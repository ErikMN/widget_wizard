/* RTP JPEG playback
 *
 * Select the JPEG video track, reconstruct images and present them on a canvas.
 * The session owns the network connection; the renderer owns image decoding
 * and presentation. Report playback only after an image has been drawn.
 */
import type { PlaybackProperties } from '../../types';
import { parseRtpPacket } from '../rtp';
import { parseRtcpPackets } from '../rtcp';
import { startRtspSession } from '../rtspSession';
import type { SdpPayload } from '../sdp';
import { createJpegFrameAssembler } from './jpegFrame';
import { createJpegCanvasRenderer } from './jpegCanvas';

export const startJpegStream = (
  canvas: HTMLCanvasElement,
  urls: {
    readonly url: string;
    readonly websocketUrl: string;
    readonly tokenUrl: string;
  },
  offset: number,
  onPlaying: (properties: PlaybackProperties) => void,
  onEnded: (retry: boolean) => void
): (() => void) => {
  let stopped = false;
  let width = 0;
  let height = 0;
  let source: number | undefined;
  let payload: SdpPayload | undefined;
  let assemble: ReturnType<typeof createJpegFrameAssembler> | undefined;
  let renderer: ReturnType<typeof createJpegCanvasRenderer> | undefined;
  let stopSession: (() => void) | undefined;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    stopSession?.();
    stopSession = undefined;
    renderer?.stop();
    renderer = undefined;
    assemble = undefined;
  };

  const end = (retry: boolean) => {
    if (!stopped) {
      stop();
      onEnded(retry);
    }
  };
  const fail = (error: unknown) => {
    if (!stopped) {
      console.error('RTP JPEG playback failed:', error);
      end(false);
    }
  };
  const report = (nextWidth: number, nextHeight: number) => {
    if (!stopped && (width !== nextWidth || height !== nextHeight)) {
      width = nextWidth;
      height = nextHeight;
      onPlaying({ el: canvas, width, height });
    }
  };

  stopSession = startRtspSession(urls, offset, {
    selectTracks: (description) => {
      for (const track of description.tracks) {
        if (track.media !== 'video') {
          continue;
        }
        const jpeg = track.payloads.find(
          (entry) => entry.encoding === 'JPEG' && entry.clockRate === 90000
        );
        if (jpeg) {
          payload = jpeg;
          return [track];
        }
      }
      throw new Error('No supported RTP JPEG video track');
    },
    onTracks: () => {
      if (!payload || !payload.clockRate) {
        throw new Error('Missing RTP JPEG payload description');
      }
      assemble = createJpegFrameAssembler(payload);
      /* VAPIX identifies recording playback with the recordingid parameter. */
      const live = !new URL(urls.url).searchParams.has('recordingid');
      renderer = createJpegCanvasRenderer(
        canvas,
        payload.clockRate,
        report,
        fail,
        live
      );
    },
    onPlay: () => renderer?.start(),
    onPacket: (_track, kind, data) => {
      if (stopped || !assemble || !renderer) {
        return;
      }
      if (kind === 'rtp') {
        const packet = parseRtpPacket(data);
        if (packet.payloadType !== payload?.payloadType) {
          return;
        }
        source = packet.ssrc;
        const frame = assemble(packet);
        if (frame) {
          renderer.push(frame);
        }
      } else {
        for (const packet of parseRtcpPackets(data)) {
          if (
            packet.type === 'bye' &&
            packet.sources.some((ssrc) => source === undefined || ssrc === source)
          ) {
            /* Finish presenting the received images before reporting the end. */
            stopSession?.();
            stopSession = undefined;
            assemble = undefined;
            renderer.finish(() => end(true));
            break;
          }
        }
      }
    },
    onEnded: fail
  });
  return stop;
};
