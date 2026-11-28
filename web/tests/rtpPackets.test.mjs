import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseRtpPacket;
let parseRtcpPackets;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ parseRtpPacket } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtp.ts'
  ));
  ({ parseRtcpPackets } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtcp.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const rtp = (flags = 0, ...body) =>
  bytes(
    0x80 | flags, 0xe0, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xfe,
    0x89, 0xab, 0xcd, 0xef,
    ...body
  );
const rtcp = (type, flags, body) => {
  assert.equal(body.length % 4, 0);
  const words = body.length / 4;
  return bytes(0x80 | flags, type, words >> 8, words & 0xff, ...body);
};
const words = (...values) => {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value));
  return data;
};
const sender = words(0x89abcdef, 0xf0000000, 0x80000000, 0xfffffffe, 120, 64000);
const receiver = rtcp(201, 0, words(123));
const bye = rtcp(203, 1, words(0x89abcdef));

test('reads the unsigned RTP header fields and marker', () => {
  const packet = parseRtpPacket(rtp(0, 1, 2, 3));
  assert.deepEqual(packet, {
    marker: true,
    payloadType: 96,
    sequenceNumber: 65535,
    timestamp: 4294967294,
    ssrc: 0x89abcdef,
    csrcs: [],
    extension: undefined,
    payload: bytes(1, 2, 3)
  });
  const data = rtp(0, 4);
  data[1] = 26;
  assert.equal(parseRtpPacket(data).marker, false);
  assert.equal(parseRtpPacket(data).payloadType, 26);
});

test('skips contributing sources and extension data before the media payload', () => {
  const data = rtp(
    0x12, ...words(1, 0xffffffff), 0xbe, 0xde, 0, 2,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  );
  const packet = parseRtpPacket(data);
  assert.deepEqual(packet.csrcs, [1, 0xffffffff]);
  assert.deepEqual(packet.extension, {
    profile: 0xbede,
    data: bytes(1, 2, 3, 4, 5, 6, 7, 8)
  });
  assert.deepEqual(packet.payload, bytes(9, 10));
});

test('accepts an empty extension and the largest contributing source list', () => {
  const data = rtp(0x1f, ...words(...Array.from({ length: 15 }, (_, i) => i)), 1, 2, 0, 0);
  const packet = parseRtpPacket(data);
  assert.equal(packet.csrcs.length, 15);
  assert.deepEqual(packet.extension, { profile: 258, data: bytes() });
  assert.equal(packet.payload.length, 0);
});

test('excludes padding without consuming payload bytes', () => {
  const packet = parseRtpPacket(rtp(0x30, 0xbe, 0xde, 0, 1, 1, 2, 3, 4, 5, 99, 2));
  assert.deepEqual(packet.payload, bytes(5));
  assert.deepEqual(packet.extension.data, bytes(1, 2, 3, 4));
  assert.equal(parseRtpPacket(rtp(0x20, 1)).payload.length, 0);
});

test('uses the input view offsets and does not copy media or extension data', () => {
  const data = bytes(99, ...rtp(0x10, 0, 1, 0, 1, 4, 5, 6, 7, 8), 99);
  const input = data.subarray(1, -1);
  const packet = parseRtpPacket(input);
  assert.equal(packet.sequenceNumber, 65535);
  assert.deepEqual(packet.payload, bytes(8));
  assert.equal(packet.payload.buffer, data.buffer);
  assert.equal(packet.extension.data.buffer, data.buffer);
  assert.equal(packet.extension.data.byteOffset, input.byteOffset + 16);
});

test('rejects short headers and other RTP versions', () => {
  for (let size = 0; size < 12; size++) {
    assert.throws(() => parseRtpPacket(rtp().subarray(0, size)), /RTP header/);
  }
  for (const version of [0, 1, 3]) {
    const data = rtp();
    data[0] = version << 6;
    assert.throws(() => parseRtpPacket(data), /RTP header/);
  }
});

test('rejects truncated contributing sources and extension fields', () => {
  assert.throws(() => parseRtpPacket(rtp(1, 1, 2, 3)), /contributing sources/);
  for (let length = 0; length < 4; length++) {
    assert.throws(
      () => parseRtpPacket(rtp(0x10, ...bytes(1, 2, 0, 1).subarray(0, length))),
      /extension header/
    );
  }
  assert.throws(
    () => parseRtpPacket(rtp(0x10, 1, 2, 0, 1, 3, 4, 5)),
    /extension data/
  );
  assert.throws(
    () => parseRtpPacket(rtp(0x10, 1, 2, 0xff, 0xff)),
    /extension data/
  );
});

test('rejects zero or excessive padding and extensions overlapping padding', () => {
  for (const data of [rtp(0x20), rtp(0x20, 0), rtp(0x20, 1, 3), rtp(0x21, 0, 0, 0, 1)]) {
    assert.throws(() => parseRtpPacket(data), /RTP padding/);
  }
  assert.throws(
    () => parseRtpPacket(rtp(0x30, 1, 2, 0, 1, 0, 0, 0, 4)),
    /extension data/
  );
});

test('reads sender timing and counters without converting NTP to a wall clock', () => {
  const [report] = parseRtcpPackets(rtcp(200, 0, sender));
  assert.deepEqual(report, {
    type: 'senderReport',
    ssrc: 0x89abcdef,
    ntpSeconds: 0xf0000000,
    ntpFraction: 0x80000000,
    rtpTimestamp: 0xfffffffe,
    packetCount: 120,
    octetCount: 64000
  });
  assert.equal(parseRtcpPackets(rtcp(200, 0, words(1, 0, 0, 0, 0, 0)))[0].ntpSeconds, 0);
});

test('accepts reception report blocks and profile extensions in sender reports', () => {
  const body = bytes(...sender, ...new Uint8Array(24), ...words(123));
  assert.equal(parseRtcpPackets(rtcp(200, 1, body))[0].rtpTimestamp, 0xfffffffe);
});

test('separates compound RTCP packets including unknown packet types', () => {
  const unknown = rtcp(210, 3, words(45, 67));
  const data = bytes(99, ...rtcp(200, 0, sender), ...receiver, ...unknown, ...bye, 99);
  const packets = parseRtcpPackets(data.subarray(1, -1));
  assert.deepEqual(packets.map((packet) => packet.type), ['senderReport', 'other', 'other', 'bye']);
  assert.deepEqual(packets[1], { type: 'other', packetType: 201, count: 0, body: words(123) });
  assert.deepEqual(packets[2], { type: 'other', packetType: 210, count: 3, body: words(45, 67) });
  assert.equal(packets[2].body.buffer, data.buffer);
  assert.deepEqual(packets[3].sources, [0x89abcdef]);
});

test('reads all goodbye sources and the optional UTF-8 reason', () => {
  const reason = new TextEncoder().encode('slut ä');
  const body = bytes(...words(1, 0xffffffff), reason.length, ...reason);
  assert.equal(body.length % 4, 0);
  assert.deepEqual(parseRtcpPackets(rtcp(203, 2, body)), [
    { type: 'bye', sources: [1, 0xffffffff], reason: 'slut ä' }
  ]);
  assert.deepEqual(parseRtcpPackets(bye), [{ type: 'bye', sources: [0x89abcdef], reason: undefined }]);
  assert.deepEqual(parseRtcpPackets(rtcp(203, 0, bytes())), [{ type: 'bye', sources: [], reason: undefined }]);
  assert.equal(parseRtcpPackets(rtcp(203, 1, bytes(...words(1), 1, 65, 0, 0)))[0].reason, 'A');
});

test('removes RTCP padding on the last packet only', () => {
  const padded = rtcp(203, 0x21, bytes(...words(1), 9, 9, 9, 4));
  assert.deepEqual(parseRtcpPackets(bytes(...receiver, ...padded))[1].sources, [1]);
  assert.throws(
    () => parseRtcpPackets(bytes(...padded, ...receiver)),
    /RTCP padding/
  );
});

test('rejects invalid RTCP versions, lengths and trailing partial packets', () => {
  assert.throws(() => parseRtcpPackets(bytes()), /Empty RTCP/);
  for (let length = 1; length < receiver.length; length++) {
    assert.throws(() => parseRtcpPackets(receiver.subarray(0, length)), /RTCP/);
  }
  for (const version of [0, 1, 3]) {
    const data = receiver.slice();
    data[0] = version << 6;
    assert.throws(() => parseRtcpPackets(data), /RTCP header/);
  }
  assert.throws(
    () => parseRtcpPackets(bytes(...receiver, 0x80, 203)),
    /RTCP header/
  );
});

test('rejects invalid RTCP padding counts', () => {
  for (const count of [0, 1, 12]) {
    assert.throws(
      () => parseRtcpPackets(rtcp(201, 0x20, bytes(...words(1), 0, 0, 0, count))),
      /RTCP padding/
    );
  }
});

test('rejects truncated sender or receiver report blocks and goodbye sources', () => {
  assert.throws(
    () => parseRtcpPackets(rtcp(200, 0, sender.subarray(0, 20))),
    /sender report/
  );
  assert.throws(() => parseRtcpPackets(rtcp(200, 1, sender)), /sender report/);
  assert.throws(
    () => parseRtcpPackets(rtcp(201, 0, bytes())),
    /receiver report/
  );
  assert.throws(
    () => parseRtcpPackets(rtcp(201, 1, words(1))),
    /receiver report/
  );
  assert.throws(
    () => parseRtcpPackets(rtcp(203, 2, words(1))),
    /goodbye sources/
  );
});

test('rejects truncated or incorrectly padded goodbye reasons', () => {
  for (const tail of [bytes(4, 65, 66, 67), bytes(1, 65, 0, 1), bytes(1, 65, 0, 0, 0, 0, 0, 0)]) {
    assert.throws(
      () => parseRtcpPackets(rtcp(203, 1, bytes(...words(1), ...tail))),
      /goodbye reason/
    );
  }
});
