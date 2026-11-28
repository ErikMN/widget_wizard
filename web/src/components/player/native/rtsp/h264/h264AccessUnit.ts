/* H.264 access unit assembly
 *
 * Use the picture identification and NAL ordering rules in H.264
 * sections 7.4.1.2.3 and 7.4.1.2.4. RFC 6184 section 5.1 allows
 * the marker as an early indication, but receivers must not rely on it.
 * Start decoding only at an IDR picture with an observed start boundary.
 */
import type { RtpPacket } from '../rtp';
import { createH264ParameterSetStore, type H264Configuration } from './h264Configuration';
import { createH264Depacketizer, MAX_ACCESS_UNIT_BYTES, MAX_NAL_UNITS } from './h264Depacketizer';
import type { H264Format } from './h264Format';
import { parseH264SliceHeader, startsNewH264Picture, type H264SliceHeader } from './h264SliceHeader';

export interface H264AccessUnit {
  readonly timestamp: number;
  readonly ssrc: number;
  readonly nalUnits: readonly Uint8Array[];
  /* Treat parameter set bytes as read-only. */
  readonly configuration: H264Configuration;
  readonly isIdr: boolean;
  /* The decoder must restart with this IDR picture. */
  readonly discontinuity: boolean;
}

interface PendingPicture {
  readonly timestamp: number;
  readonly knownStart: boolean;
  readonly nalUnits: Uint8Array[];
  bytes: number;
  header?: H264SliceHeader;
  hasMacroblockZero: boolean;
}

const newPicture = (timestamp: number, knownStart: boolean): PendingPicture => ({
  timestamp,
  knownStart,
  nalUnits: [],
  bytes: 0,
  hasMacroblockZero: false
});

const sameConfiguration = (a: H264Configuration, b: H264Configuration): boolean =>
  a.sps === b.sps && a.pps === b.pps;

const appendNal = (picture: PendingPicture, nal: Uint8Array) => {
  if (
    picture.nalUnits.length >= MAX_NAL_UNITS ||
    picture.bytes + nal.length > MAX_ACCESS_UNIT_BYTES
  ) {
    throw new Error('H.264 access unit exceeds storage limits');
  }
  /* The depacketizer already owns the NAL bytes. */
  picture.nalUnits.push(nal);
  picture.bytes += nal.length;
};

/* One assembler per negotiated track. Output is in decoding order.
 * The last picture remains pending until a following boundary is observed.
 * No slice data is decoded, so completeness cannot be proved here.
 */
export const createH264AccessUnitAssembler = (payloadType: number, format: H264Format) => {
  const depacketize = createH264Depacketizer(payloadType, format.packetizationMode);
  let store = createH264ParameterSetStore(format);
  let source: number | undefined;
  let lastTimestamp: number | undefined;
  let pending: PendingPicture | undefined;
  let activeConfiguration: H264Configuration | undefined;

  const discard = () => {
    pending = undefined;
    lastTimestamp = undefined;
    activeConfiguration = undefined;
  };

  const finish = (output: H264AccessUnit[], ssrc: number) => {
    const picture = pending;
    pending = undefined;
    if (!picture?.header) {
      return;
    }
    /* Macroblock zero is necessary, but not sufficient to prove completeness.
     * It need not occur in the first received slice.
     */
    if (!picture.knownStart || !picture.hasMacroblockZero) {
      activeConfiguration = undefined;
      return;
    }
    const { configuration, isIdr } = picture.header;
    const discontinuity = !activeConfiguration ||
      !sameConfiguration(activeConfiguration, configuration);
    if (discontinuity && !isIdr) {
      activeConfiguration = undefined;
      return;
    }
    output.push({
      timestamp: picture.timestamp,
      ssrc,
      nalUnits: picture.nalUnits,
      configuration,
      isIdr,
      discontinuity
    });
    activeConfiguration = configuration;
  };

  return (packet: RtpPacket): H264AccessUnit[] => {
    const output: H264AccessUnit[] = [];
    if (packet.payloadType !== payloadType) {
      return output;
    }
    if (packet.ssrc !== source) {
      if (source !== undefined) {
        store = createH264ParameterSetStore(format);
      }
      source = packet.ssrc;
      discard();
    }

    for (const batch of depacketize(packet)) {
      if (batch.discontinuity) {
        discard();
      }
      for (const nal of batch.nalUnits) {
        const type = nal[0] & 0x1f;
        const timestamp = batch.timestamp;
        try {
          if (type >= 6 && type <= 9) {
            /* SEI, SPS, PPS and AUD after VCL belong to the next picture. */
            if (pending?.header) {
              finish(output, batch.ssrc);
            }
            if (!pending || pending.timestamp !== timestamp || type === 9) {
              pending = newPicture(timestamp, true);
            }
            if (type === 7 || type === 8) {
              try {
                store.update(nal);
              } catch (error) {
                store.invalidate(type);
                throw error;
              }
            }
            appendNal(pending, nal);
          } else if (type === 1 || type === 5) {
            const header = parseH264SliceHeader(nal, store.resolve);
            if (!header || header.redundantPicCnt !== 0) {
              throw new Error('Missing H.264 configuration or unsupported redundant slice');
            }
            let knownStart = pending?.knownStart ??
              (lastTimestamp !== undefined && lastTimestamp !== timestamp);
            if (pending?.header) {
              if (startsNewH264Picture(pending.header, header)) {
                finish(output, batch.ssrc);
                knownStart = true;
              } else if (
                pending.timestamp !== timestamp ||
                !sameConfiguration(pending.header.configuration, header.configuration)
              ) {
                throw new Error('Inconsistent H.264 picture');
              }
            }
            if (!pending || pending.timestamp !== timestamp) {
              pending = newPicture(timestamp, knownStart);
            }
            pending.header ??= header;
            pending.hasMacroblockZero ||= header.firstMbInSlice === 0;
            appendNal(pending, nal);
          } else if (type === 10 || type === 11) {
            if (pending?.header && pending.timestamp === timestamp) {
              appendNal(pending, nal);
              finish(output, batch.ssrc);
            }
            discard();
          } else if (type === 12 && pending?.header && pending.timestamp === timestamp) {
            appendNal(pending, nal);
          } else {
            /* Data partitions and extended AVC NAL types are not supported. */
            throw new Error('Unsupported H.264 NAL unit');
          }
        } catch {
          /* Do not submit a damaged picture or continue with its references. */
          discard();
        }
        lastTimestamp = timestamp;
      }
    }
    return output;
  };
};
