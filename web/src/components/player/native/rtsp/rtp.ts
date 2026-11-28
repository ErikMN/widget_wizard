/* RTP media packets
 *
 * Read the sequence number, timestamp, source and payload from an RTP packet.
 * Skip contributing sources and header extensions when locating the media data,
 * and exclude padding. The media handler decides how to interpret the payload
 * and handle missing packets or timestamp wraparound.
 */
export interface RtpPacket {
  readonly marker: boolean;
  readonly payloadType: number;
  readonly sequenceNumber: number;
  /* Timestamp in ticks of the clock advertised for this payload. */
  readonly timestamp: number;
  readonly ssrc: number;
  readonly csrcs: readonly number[];
  readonly extension?: { readonly profile: number; readonly data: Uint8Array };
  readonly payload: Uint8Array;
}

/* Payload and extension data are views of the input packet, not copies. */
export const parseRtpPacket = (data: Uint8Array): RtpPacket => {
  if (data.length < 12 || data[0] >> 6 !== 2) {
    throw new Error('Invalid RTP header');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const csrcCount = data[0] & 0x0f;
  let offset = 12 + csrcCount * 4;
  let end = data.length;
  if (data[0] & 0x20) {
    const padding = data[end - 1];
    if (padding === 0 || padding > end - offset) {
      throw new Error('Invalid RTP padding');
    }
    end -= padding;
  }
  if (offset > end) {
    throw new Error('Truncated RTP contributing sources');
  }

  const csrcs: number[] = [];
  for (let i = 0; i < csrcCount; i++) {
    csrcs.push(view.getUint32(12 + i * 4));
  }

  let extension: RtpPacket['extension'];
  if (data[0] & 0x10) {
    if (offset + 4 > end) {
      throw new Error('Truncated RTP extension header');
    }
    const profile = view.getUint16(offset);
    /* The extension length counts four-byte words after its header. */
    const size = view.getUint16(offset + 2) * 4;
    offset += 4;
    if (offset + size > end) {
      throw new Error('Truncated RTP extension data');
    }
    extension = { profile, data: data.subarray(offset, offset + size) };
    offset += size;
  }

  return {
    marker: (data[1] & 0x80) !== 0,
    payloadType: data[1] & 0x7f,
    sequenceNumber: view.getUint16(2),
    timestamp: view.getUint32(4),
    ssrc: view.getUint32(8),
    csrcs,
    extension,
    payload: data.subarray(offset, end)
  };
};
