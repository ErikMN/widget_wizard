/* H.264 RTP depacketization
 *
 * Reconstruct NAL units and group them into access units in transmission order.
 * Support single NAL packets, STAP-A aggregation and FU-A fragmentation as
 * defined in RFC 6184. Preserve parameter sets and other non-picture NAL units
 * so the media handler can configure the decoder before playing video.
 *
 * The Axis media-stream-library-js v13.3.3 H.264 depayloader is the reference
 * for frame boundaries. This assembler also checks sequence numbers, timestamps
 * and fragment headers. It does not decode or generate MP4 data.
 */
import type { RtpPacket } from '../rtp';

/* Bound incomplete pictures, including streams that never send a marker. */
const MAX_ACCESS_UNIT_BYTES = 32 * 1024 * 1024;
const MAX_PACKETS = 65536;
const MAX_NAL_UNITS = 4096;

export interface H264AccessUnit {
  readonly timestamp: number;
  readonly ssrc: number;
  /* NAL units include their headers but no start codes or length prefixes. */
  readonly nalUnits: readonly Uint8Array[];
  /* Contains an IDR slice, not proof that the entire picture was received. */
  readonly isIdr: boolean;
  /* First output after startup, source change or discarded media. */
  readonly discontinuity: boolean;
}

interface FragmentedNal {
  readonly header: number;
  readonly chunks: Uint8Array[];
  size: number;
}

interface PendingAccessUnit {
  readonly timestamp: number;
  readonly nalUnits: Uint8Array[];
  bytes: number;
  packets: number;
  damaged: boolean;
  fragment?: FragmentedNal;
}

const isNalHeader = (header: number): boolean => {
  const type = header & 0x1f;
  return (header & 0x80) === 0 && type >= 1 && type <= 23;
};

/* End of sequence and end of stream (types 10 and 11) have empty RBSPs.
 * Other NAL units need payload data; this is not bitstream validation.
 */
const isNalSizeValid = (header: number, size: number): boolean => {
  const type = header & 0x1f;
  return size > 1 || (size === 1 && (type === 10 || type === 11));
};

const appendNal = (unit: PendingAccessUnit, nal: Uint8Array): boolean => {
  if (
    !nal.length ||
    !isNalHeader(nal[0]) ||
    !isNalSizeValid(nal[0], nal.length) ||
    unit.nalUnits.length >= MAX_NAL_UNITS ||
    unit.bytes + nal.length > MAX_ACCESS_UNIT_BYTES
  ) {
    return false;
  }
  /* Own only the bytes needed by the access unit, not the packet buffer. */
  unit.nalUnits.push(new Uint8Array(nal));
  unit.bytes += nal.length;
  return true;
};

const appendAggregation = (
  unit: PendingAccessUnit,
  data: Uint8Array
): boolean => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 1;
  while (offset < data.length) {
    if (offset + 2 > data.length) {
      return false;
    }
    const size = view.getUint16(offset);
    offset += 2;
    if (
      offset + size > data.length ||
      !appendNal(unit, data.subarray(offset, offset + size))
    ) {
      return false;
    }
    offset += size;
  }
  return data.length > 1;
};

const appendFragment = (unit: PendingAccessUnit, data: Uint8Array): boolean => {
  if (data.length < 2) {
    return false;
  }
  const start = (data[1] & 0x80) !== 0;
  const end = (data[1] & 0x40) !== 0;
  /* The reserved FU header bit is ignored by receivers (RFC 6184, 5.8). */
  const header = (data[0] & 0xe0) | (data[1] & 0x1f);
  if (!isNalHeader(header) || (start && end)) {
    return false;
  }
  if (start) {
    if (unit.fragment || unit.nalUnits.length >= MAX_NAL_UNITS) {
      return false;
    }
    unit.fragment = { header, chunks: [], size: 1 };
    unit.bytes++;
  }
  const fragment = unit.fragment;
  const size = data.length - 2;
  if (
    !fragment ||
    header !== fragment.header ||
    unit.bytes + size > MAX_ACCESS_UNIT_BYTES
  ) {
    return false;
  }
  /* Empty FU payloads are permitted. Do not retain empty chunks. */
  if (size) {
    fragment.chunks.push(new Uint8Array(data.subarray(2)));
    fragment.size += size;
    unit.bytes += size;
  }
  if (end) {
    if (!isNalSizeValid(fragment.header, fragment.size)) {
      return false;
    }
    const nal = new Uint8Array(fragment.size);
    nal[0] = fragment.header;
    let offset = 1;
    for (const chunk of fragment.chunks) {
      nal.set(chunk, offset);
      offset += chunk.length;
    }
    unit.nalUnits.push(nal);
    unit.fragment = undefined;
  }
  return true;
};

/* One assembler per negotiated payload. Packets must arrive in RTP sequence
 * order, as they do over the RTSP WebSocket. Discard damaged access units
 * until the next marker or timestamp. Decoder recovery belongs to the caller.
 * Modes zero and one are supported; interleaved mode requires reordering.
 */
export const createH264AccessUnitAssembler = (
  payloadType: number,
  packetizationMode: 0 | 1
) => {
  if (packetizationMode !== 0 && packetizationMode !== 1) {
    throw new Error('Unsupported H.264 packetization mode');
  }
  let source: number | undefined;
  let lastSequence: number | undefined;
  let pending: PendingAccessUnit | undefined;
  let discontinuity = true;

  return (packet: RtpPacket): H264AccessUnit | undefined => {
    if (packet.payloadType !== payloadType) {
      return undefined;
    }
    if (packet.ssrc !== source) {
      source = packet.ssrc;
      lastSequence = undefined;
      pending = undefined;
      discontinuity = true;
    }
    if (packet.sequenceNumber === lastSequence) {
      return undefined;
    }
    const gap =
      lastSequence !== undefined &&
      packet.sequenceNumber !== ((lastSequence + 1) & 0xffff);
    lastSequence = packet.sequenceNumber;

    if (!pending || pending.timestamp !== packet.timestamp) {
      /* Do not join pictures across timestamps if a marker was missing. */
      if (pending) {
        discontinuity = true;
      }
      pending = {
        timestamp: packet.timestamp,
        nalUnits: [],
        bytes: 0,
        packets: 0,
        damaged: false
      };
    }
    const unit = pending;
    const data = packet.payload;
    const type = data[0] & 0x1f;
    let valid = false;
    if (
      !gap &&
      !unit.damaged &&
      ++unit.packets <= MAX_PACKETS &&
      data.length &&
      !(data[0] & 0x80)
    ) {
      if (type === 28 && packetizationMode === 1) {
        valid = appendFragment(unit, data);
      } else if (!unit.fragment) {
        if (type === 24 && packetizationMode === 1) {
          valid = appendAggregation(unit, data);
        } else {
          valid = appendNal(unit, data);
        }
      }
    }
    if (!valid || (packet.marker && unit.fragment)) {
      unit.damaged = true;
      unit.nalUnits.length = 0;
      unit.fragment = undefined;
      discontinuity = true;
    }
    if (!packet.marker) {
      return undefined;
    }
    pending = undefined;
    if (unit.damaged || !unit.nalUnits.length) {
      return undefined;
    }
    const result: H264AccessUnit = {
      timestamp: unit.timestamp,
      ssrc: packet.ssrc,
      nalUnits: unit.nalUnits,
      isIdr: unit.nalUnits.some((nal) => (nal[0] & 0x1f) === 5),
      discontinuity
    };
    discontinuity = false;
    return result;
  };
};
