/* RTP JPEG frame assembly
 *
 * Reassemble one JPEG stream into complete images for the browser decoder.
 * Use fragment offsets and RTP sequence numbers to reject incomplete frames.
 * Keep only the current frame and reusable quantization tables for its source.
 * A new frame starts at offset zero and the marker bit completes it.
 *
 * Based on RFC 2435 and the Axis media-stream-library-js v13.3.3 JPEG
 * depayloader, including its SDP dimension fallback.
 */
import type { RtpPacket } from '../rtp';
import type { SdpPayload } from '../sdp';
import {
  makeJpegHeader,
  makeQuantizationTables,
  type QuantizationTables
} from './jpegHeaders';

const MAX_SCAN_SIZE = 2 ** 24;
/* Leave room for packet headers while bounding the storage retained by views. */
const MAX_FRAME_STORAGE = 2 * MAX_SCAN_SIZE;
/* Limit retained fragments to one full RTP sequence number cycle. */
const MAX_FRAGMENTS = 65536;

export interface JpegFrame {
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
  readonly ssrc: number;
  /* Identifies progressive images and interlaced fields (RFC 2435, section 4.1). */
  readonly typeSpecific: number;
  readonly data: Uint8Array<ArrayBuffer>;
}

interface Fragment {
  readonly offset: number;
  readonly type: number;
  readonly typeSpecific: number;
  readonly quality: number;
  readonly width: number;
  readonly height: number;
  readonly restartInterval: number;
  readonly tables?: QuantizationTables;
  readonly scan: Uint8Array;
}

const readFragment = (
  data: Uint8Array,
  frameSize: SdpPayload['frameSize']
): Fragment | undefined => {
  if (data.length < 8) {
    return undefined;
  }
  const offset = data[1] * 65536 + data[2] * 256 + data[3];
  const type = data[4];
  const quality = data[5];
  const width = data[6] * 8 || frameSize?.width;
  const height = data[7] * 8 || frameSize?.height;
  if (
    ![0, 1, 64, 65].includes(type) ||
    quality === 0 ||
    (quality >= 100 && quality < 128) ||
    !width ||
    !height ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 65535 ||
    height > 65535
  ) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let cursor = 8;
  let restartInterval = 0;
  if (type >= 64) {
    if (data.length < cursor + 4) {
      return undefined;
    }
    restartInterval = view.getUint16(cursor);
    if (!restartInterval) {
      return undefined;
    }
    cursor += 4;
  }

  let tables: QuantizationTables | undefined;
  if (quality >= 128 && offset === 0) {
    if (data.length < cursor + 4) {
      return undefined;
    }
    const precision = data[cursor + 1] & 3;
    const length = view.getUint16(cursor + 2);
    cursor += 4;
    const expected = (precision & 1 ? 128 : 64) + (precision & 2 ? 128 : 64);
    if (
      cursor + length > data.length ||
      (length !== 0 && length !== expected)
    ) {
      return undefined;
    }
    if (length) {
      /* JPEG quantization coefficients must be nonzero. Check each table
       * using its advertised precision before allowing it into the cache.
       */
      let coefficientOffset = cursor;
      for (let table = 0; table < 2; table++) {
        const wide = (precision & (1 << table)) !== 0;
        for (let i = 0; i < 64; i++) {
          const coefficient = wide
            ? view.getUint16(coefficientOffset)
            : data[coefficientOffset];
          if (coefficient === 0) {
            return undefined;
          }
          coefficientOffset += wide ? 2 : 1;
        }
      }
      tables = { precision, data: data.subarray(cursor, cursor + length) };
    } else if (quality === 255) {
      return undefined;
    }
    cursor += length;
  }
  const scan = data.subarray(cursor);
  if (offset + scan.length > MAX_SCAN_SIZE) {
    return undefined;
  }
  return {
    offset,
    type,
    typeSpecific: data[0],
    quality,
    width,
    height,
    restartInterval,
    tables,
    scan
  };
};

interface PendingFrame {
  readonly first: Fragment;
  readonly header: Uint8Array;
  readonly timestamp: number;
  readonly chunks: Uint8Array[];
  sequenceNumber: number;
  length: number;
  retainedBytes: number;
}

/* One assembler per selected JPEG payload. Input packets belong to the
 * caller and must remain unchanged while an incomplete frame is retained.
 * Malformed or incomplete frames are discarded until the next frame start.
 */
export const createJpegFrameAssembler = (description: SdpPayload) => {
  let source: number | undefined;
  let pending: PendingFrame | undefined;
  const cachedTables = new Map<number, QuantizationTables>();

  return (packet: RtpPacket): JpegFrame | undefined => {
    if (packet.payloadType !== description.payloadType) {
      return undefined;
    }
    if (packet.ssrc !== source) {
      pending = undefined;
      cachedTables.clear();
      source = packet.ssrc;
    }
    const fragment = readFragment(packet.payload, description.frameSize);
    if (!fragment) {
      pending = undefined;
      return undefined;
    }

    if (fragment.offset === 0) {
      pending = undefined;
      let tables = fragment.tables;
      if (fragment.quality < 128) {
        tables = makeQuantizationTables(fragment.quality);
      } else if (fragment.quality < 255) {
        /* Static Q values can omit tables after their first transmission. */
        if (tables) {
          cachedTables.set(fragment.quality, {
            precision: tables.precision,
            data: tables.data.slice()
          });
        } else {
          tables = cachedTables.get(fragment.quality);
        }
      }
      if (!tables) {
        return undefined;
      }
      pending = {
        first: fragment,
        header: makeJpegHeader(
          fragment.width,
          fragment.height,
          fragment.type,
          fragment.restartInterval,
          tables
        ),
        timestamp: packet.timestamp,
        chunks: [],
        sequenceNumber: (packet.sequenceNumber - 1) & 0xffff,
        length: 0,
        retainedBytes: 0
      };
    }
    if (!pending) {
      return undefined;
    }
    const { first } = pending;
    if (
      packet.timestamp !== pending.timestamp ||
      packet.sequenceNumber !== ((pending.sequenceNumber + 1) & 0xffff) ||
      fragment.offset !== pending.length ||
      fragment.type !== first.type ||
      fragment.typeSpecific !== first.typeSpecific ||
      fragment.quality !== first.quality ||
      fragment.width !== first.width ||
      fragment.height !== first.height ||
      fragment.restartInterval !== first.restartInterval ||
      pending.chunks.length >= MAX_FRAGMENTS ||
      pending.retainedBytes + fragment.scan.buffer.byteLength > MAX_FRAME_STORAGE
    ) {
      pending = undefined;
      return undefined;
    }
    pending.chunks.push(fragment.scan);
    pending.length += fragment.scan.length;
    pending.retainedBytes += fragment.scan.buffer.byteLength;
    pending.sequenceNumber = packet.sequenceNumber;
    if (!packet.marker) {
      return undefined;
    }

    const frame = pending;
    pending = undefined;
    if (!frame.length) {
      return undefined;
    }
    const data = new Uint8Array(frame.header.length + frame.length + 2);
    data.set(frame.header);
    let offset = frame.header.length;
    for (const chunk of frame.chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    /* Some cameras omit the JPEG end marker, which may also span packets. */
    if (data[offset - 2] !== 0xff || data[offset - 1] !== 0xd9) {
      data[offset++] = 0xff;
      data[offset++] = 0xd9;
    }
    return {
      width: first.width,
      height: first.height,
      timestamp: frame.timestamp,
      ssrc: packet.ssrc,
      typeSpecific: first.typeSpecific,
      data: data.subarray(0, offset)
    };
  };
};
