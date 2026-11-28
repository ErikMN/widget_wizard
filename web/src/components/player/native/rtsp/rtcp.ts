/* RTCP control packets
 *
 * Separate the control packets carried together on an RTCP channel.
 * Sender reports relate the media clock to a shared reference clock for
 * synchronization. Goodbye packets identify sources that have ended.
 * Other packet bodies are left uninterpreted until a handler needs them.
 */
export interface RtcpSenderReport {
  readonly type: 'senderReport';
  readonly ssrc: number;
  /* Preserve both NTP words without assuming an epoch or a wall clock. */
  readonly ntpSeconds: number;
  readonly ntpFraction: number;
  readonly rtpTimestamp: number;
  readonly packetCount: number;
  readonly octetCount: number;
}

export interface RtcpBye {
  readonly type: 'bye';
  readonly sources: readonly number[];
  readonly reason?: string;
}

export interface RtcpOther {
  readonly type: 'other';
  readonly packetType: number;
  readonly count: number;
  readonly body: Uint8Array;
}

export type RtcpPacket = RtcpSenderReport | RtcpBye | RtcpOther;

const decoder = new TextDecoder();

const parseBody = (
  packetType: number,
  count: number,
  body: Uint8Array
): RtcpPacket => {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (packetType === 200) {
    /* Allow profile extensions after the reception report blocks. */
    if (body.length < 24 + count * 24) {
      throw new Error('Truncated RTCP sender report');
    }
    return {
      type: 'senderReport',
      ssrc: view.getUint32(0),
      ntpSeconds: view.getUint32(4),
      ntpFraction: view.getUint32(8),
      rtpTimestamp: view.getUint32(12),
      packetCount: view.getUint32(16),
      octetCount: view.getUint32(20)
    };
  }
  if (packetType === 203) {
    const sourceBytes = count * 4;
    if (body.length < sourceBytes) {
      throw new Error('Truncated RTCP goodbye sources');
    }
    const sources: number[] = [];
    for (let offset = 0; offset < sourceBytes; offset += 4) {
      sources.push(view.getUint32(offset));
    }
    let reason: string | undefined;
    if (body.length > sourceBytes) {
      const end = sourceBytes + 1 + body[sourceBytes];
      const alignedEnd = Math.ceil(end / 4) * 4;
      if (
        alignedEnd !== body.length ||
        body.subarray(end).some((byte) => byte !== 0)
      ) {
        throw new Error('Invalid RTCP goodbye reason');
      }
      reason = decoder.decode(body.subarray(sourceBytes + 1, end));
    }
    return { type: 'bye', sources, reason };
  }
  if (packetType === 201 && body.length < 4 + count * 24) {
    throw new Error('Truncated RTCP receiver report');
  }
  return { type: 'other', packetType, count, body };
};

/* Accept individual packets as well as compound packets. Validate framing and
 * the fields read here, but do not interpret unused control packet bodies.
 * Uninterpreted bodies are views of the input, not copies.
 */
export const parseRtcpPackets = (data: Uint8Array): RtcpPacket[] => {
  if (!data.length) {
    throw new Error('Empty RTCP packet');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const packets: RtcpPacket[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (data.length - offset < 4 || data[offset] >> 6 !== 2) {
      throw new Error('Invalid RTCP header');
    }
    /* The length includes the header and is measured in words minus one. */
    const size = (view.getUint16(offset + 2) + 1) * 4;
    const next = offset + size;
    if (next > data.length) {
      throw new Error('Truncated RTCP packet');
    }
    let end = next;
    if (data[offset] & 0x20) {
      const padding = data[next - 1];
      if (
        next !== data.length ||
        !padding ||
        padding % 4 !== 0 ||
        padding > size - 4
      ) {
        throw new Error('Invalid RTCP padding');
      }
      end -= padding;
    }
    packets.push(
      parseBody(
        data[offset + 1],
        data[offset] & 0x1f,
        data.subarray(offset + 4, end)
      )
    );
    offset = next;
  }
  return packets;
};
