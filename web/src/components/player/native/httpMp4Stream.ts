/* Keep ten seconds of played media and limit how far reading can run ahead. */
const BUFFER_BEHIND = 10;
const BUFFER_AHEAD = 10;
const QUOTA_BUFFER_BEHIND = 5;

const waitForEvent = (
  target: EventTarget,
  event: string,
  signal: AbortSignal,
  operation?: () => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      target.removeEventListener('abort', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Media operation failed while waiting for ${event}`));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };

    target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
    target.addEventListener('abort', onError);
    signal.addEventListener('abort', onAbort);
    try {
      operation?.();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

const bufferAhead = (buffered: TimeRanges, time: number): number => {
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= time && time < buffered.end(i)) {
      return buffered.end(i) - time;
    }
  }
  return 0;
};

/* Own one HTTP request and its MediaSource for the lifetime of the stream. */
export const startHttpMp4Stream = (
  video: HTMLVideoElement,
  src: string,
  onEnded: (retry: boolean) => void
): (() => void) => {
  const controller = new AbortController();
  const { signal } = controller;
  let mediaSource: MediaSource | undefined;
  let objectUrl: string | undefined;

  const revokeUrl = () => {
    if (objectUrl !== undefined) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
  };

  const stop = () => {
    if (signal.aborted) {
      return;
    }
    controller.abort();
    video.removeEventListener('error', onVideoError);
    mediaSource?.removeEventListener('sourceclose', onSourceClose);
    video.pause();
    video.removeAttribute('src');
    video.load();
    revokeUrl();
  };

  const fail = (error: unknown, retry = false) => {
    if (!signal.aborted) {
      console.error('HTTP MP4 playback failed:', error);
      stop();
      onEnded(retry);
    }
  };
  const onVideoError = () => fail(video.error);
  const onSourceClose = () => fail(new Error('MediaSource closed'));
  video.addEventListener('error', onVideoError);

  const run = async () => {
    if (typeof MediaSource === 'undefined') {
      throw new Error('MediaSource is unavailable');
    }
    const response = await fetch(src, { credentials: 'include', signal });
    signal.throwIfAborted();
    if (!response.ok || !response.body) {
      throw new Error(`HTTP MP4 request failed (${response.status})`);
    }

    const mime = response.headers.get('Content-Type');
    if (
      !mime ||
      mime.split(';')[0].trim().toLowerCase() !== 'video/mp4' ||
      !MediaSource.isTypeSupported(mime)
    ) {
      throw new Error(`Unsupported HTTP MP4 media type: ${mime}`);
    }

    const reader = response.body.getReader();
    try {
      const source = new MediaSource();
      mediaSource = source;
      source.addEventListener('sourceclose', onSourceClose);
      const url = URL.createObjectURL(source);
      objectUrl = url;
      await waitForEvent(source, 'sourceopen', signal, () => {
        video.src = url;
      });
      revokeUrl();
      signal.throwIfAborted();
      const buffer = source.addSourceBuffer(mime);

      while (!signal.aborted) {
        /* Do not accumulate media indefinitely if playback cannot keep up. */
        while (bufferAhead(buffer.buffered, video.currentTime) > BUFFER_AHEAD) {
          await waitForEvent(video, 'timeupdate', signal);
          signal.throwIfAborted();
        }

        const removeUntil = video.currentTime - BUFFER_BEHIND;
        if (
          buffer.buffered.length &&
          removeUntil - buffer.buffered.start(0) >= 1
        ) {
          await waitForEvent(buffer, 'updateend', signal, () => {
            buffer.remove(0, removeUntil);
          });
        }

        signal.throwIfAborted();
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (error) {
          if (!signal.aborted) {
            fail(error, true);
          }
          return;
        }
        signal.throwIfAborted();
        if (chunk.done) {
          source.endOfStream();
          onEnded(true);
          return;
        }
        if (chunk.value.byteLength > 0) {
          const append = () =>
            waitForEvent(buffer, 'updateend', signal, () => {
              buffer.appendBuffer(chunk.value);
            });
          try {
            await append();
          } catch (error) {
            signal.throwIfAborted();
            const reclaimUntil = video.currentTime - QUOTA_BUFFER_BEHIND;
            if (
              !(error instanceof DOMException) ||
              error.name !== 'QuotaExceededError' ||
              !buffer.buffered.length ||
              reclaimUntil <= buffer.buffered.start(0)
            ) {
              throw error;
            }

            /* Reclaim older played media once before retrying the same chunk. */
            await waitForEvent(buffer, 'updateend', signal, () => {
              buffer.remove(0, reclaimUntil);
            });
            await append();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  run().catch(fail);
  return stop;
};
