/* JPEG canvas presentation
 *
 * Decode complete JPEG images with the browser and draw them at their RTP
 * presentation times. Only one image is decoded at a time. If decoding falls
 * behind, skip older images that are already due rather than build up latency.
 * Stop cancels scheduled drawing and prevents unfinished decodes from drawing.
 *
 * The bitmap renderer and image fallback follow the approach used by the
 * Axis media-stream-library-js v13.3.3 canvas sink.
 */
import type { JpegFrame } from './jpegFrame';

/* Bound the compressed images waiting for presentation. */
const MAX_QUEUED_BYTES = 32 * 1024 * 1024;
const MAX_QUEUED_FRAMES = 120;
const MAX_TIMER_DELAY = 2147483647;
/* Live video should not accumulate presentation delays beyond two seconds. */
const MAX_LIVE_DELAY = 2000;
/* Detect a stalled live stream independently of RTSP keepalive responses. */
const PROGRESS_TIMEOUT = 30000;

interface ScheduledFrame {
  readonly frame: JpegFrame;
  readonly time: number;
  readonly generation: number;
}

export const createJpegCanvasRenderer = (
  canvas: HTMLCanvasElement,
  clockRate: number,
  onDraw: (width: number, height: number) => void,
  onError: (error: unknown) => void,
  live = true
) => {
  if (!Number.isFinite(clockRate) || clockRate <= 0) {
    throw new Error('Invalid JPEG clock rate');
  }
  const bitmapContext =
    typeof createImageBitmap === 'function'
      ? canvas.getContext('bitmaprenderer')
      : null;
  const context = bitmapContext ? null : canvas.getContext('2d');
  if (!bitmapContext && !context) {
    throw new Error('JPEG canvas rendering is unavailable');
  }

  let stopped = false;
  let decoding = false;
  let source: number | undefined;
  let generation = 0;
  let lastTimestamp = 0;
  let presentationTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelImage: (() => void) | undefined;
  let onFinished: (() => void) | undefined;
  const queue: ScheduledFrame[] = [];
  let queuedBytes = 0;

  const clearQueue = () => {
    clearTimeout(timer);
    timer = undefined;
    queue.length = 0;
    queuedBytes = 0;
  };

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearQueue();
    clearTimeout(progressTimer);
    progressTimer = undefined;
    onFinished = undefined;
    cancelImage?.();
  };

  const fail = (error: unknown) => {
    if (!stopped) {
      stop();
      onError(error);
    }
  };

  const watchProgress = () => {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(
      () => fail(new Error('JPEG presentation timed out')),
      PROGRESS_TIMEOUT
    );
  };

  const start = () => {
    if (live && !stopped) {
      watchProgress();
    }
  };

  const reportDraw = (width: number, height: number) => {
    if (live) {
      watchProgress();
    }
    onDraw(width, height);
  };

  const isCurrent = (entry: ScheduledFrame) =>
    !stopped && entry.generation === generation;

  const resize = (width: number, height: number) => {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const drawWithImage = (blob: Blob, entry: ScheduledFrame): Promise<void> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      let active = true;
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        URL.revokeObjectURL(url);
        cancelImage = undefined;
      };
      cancelImage = () => {
        cleanup();
        resolve();
      };
      image.onload = () => {
        try {
          if (active && isCurrent(entry) && image.naturalWidth && image.naturalHeight) {
            const { naturalWidth: width, naturalHeight: height } = image;
            resize(width, height);
            context!.drawImage(image, 0, 0);
            cleanup();
            reportDraw(width, height);
          }
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      };
      image.onerror = () => {
        cleanup();
        resolve();
      };
      try {
        image.src = url;
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

  const draw = async (entry: ScheduledFrame) => {
    const blob = new Blob([entry.frame.data], { type: 'image/jpeg' });
    if (!bitmapContext) {
      await drawWithImage(blob, entry);
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      /* A failed image decode does not invalidate the following JPEG frames. */
      return;
    }
    try {
      if (isCurrent(entry) && bitmap.width && bitmap.height) {
        const { width, height } = bitmap;
        resize(width, height);
        bitmapContext.transferFromImageBitmap(bitmap);
        reportDraw(width, height);
      }
    } finally {
      bitmap.close();
    }
  };

  const takeFrame = () => {
    const entry = queue.shift()!;
    queuedBytes -= entry.frame.data.byteLength;
    return entry;
  };

  const pump = () => {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || decoding) {
      return;
    }
    if (!queue.length) {
      if (onFinished) {
        const notify = onFinished;
        stop();
        notify();
      }
      return;
    }
    const now = performance.now();
    if (queue[0].time > now) {
      timer = setTimeout(pump, Math.min(queue[0].time - now, MAX_TIMER_DELAY));
      return;
    }
    let entry = takeFrame();
    while (queue.length && queue[0].time <= now) {
      entry = takeFrame();
    }
    decoding = true;
    /* Recordings may contain long gaps, but an individual decode must finish. */
    if (!live) {
      watchProgress();
    }
    draw(entry)
      .catch(fail)
      .finally(() => {
        decoding = false;
        if (!live) {
          clearTimeout(progressTimer);
          progressTimer = undefined;
        }
        pump();
      });
  };

  const push = (frame: JpegFrame) => {
    if (stopped || onFinished) {
      return;
    }
    const now = performance.now();
    /* Signed subtraction handles normal RTP timestamp wraparound. */
    const ticks = (frame.timestamp - lastTimestamp) | 0;
    const nextTime = presentationTime + (ticks * 1000) / clockRate;
    /* Packets arrive in order. A backward timestamp is a clock reset.
     * Rebase live video if its clock schedules images too far ahead, but
     * retain forward timing gaps when playing a recording.
     */
    if (
      source !== frame.ssrc ||
      ticks < 0 ||
      (live && nextTime - now > MAX_LIVE_DELAY)
    ) {
      clearQueue();
      cancelImage?.();
      generation++;
      source = frame.ssrc;
      presentationTime = now;
    } else {
      presentationTime = nextTime;
    }
    lastTimestamp = frame.timestamp;

    /* Keep only the newest image already due while a decode is pending. */
    while (queue.length > 1 && queue[1].time <= now) {
      takeFrame();
    }
    if (queue.length && presentationTime <= now) {
      takeFrame();
    }
    if (
      queue.length >= MAX_QUEUED_FRAMES ||
      queuedBytes + frame.data.byteLength > MAX_QUEUED_BYTES
    ) {
      fail(new Error('JPEG presentation queue exceeded its limit'));
      return;
    }
    queue.push({ frame, time: presentationTime, generation });
    queuedBytes += frame.data.byteLength;
    pump();
  };

  /* Let a finite stream display its queued images before reporting completion. */
  const finish = (notify: () => void) => {
    if (!stopped && !onFinished) {
      onFinished = notify;
      pump();
    }
  };

  return { start, push, stop, finish };
};
