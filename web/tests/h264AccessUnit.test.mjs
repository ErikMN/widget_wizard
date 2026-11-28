import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseRtpPacket;
let createH264AccessUnitAssembler;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ parseRtpPacket } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtp.ts'
  ));
  ({ createH264AccessUnitAssembler } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264AccessUnit.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const assembler = (mode = 1) => createH264AccessUnitAssembler(96, mode);
const packet = (payload, options = {}) => {
  const {
    sequence = 1, timestamp = 100, source = 1, marker = true, payloadType = 96
  } = options;
  const data = new Uint8Array(12 + payload.length);
  const view = new DataView(data.buffer);
  data[0] = 0x80;
  data[1] = payloadType | (marker ? 0x80 : 0);
  view.setUint16(2, sequence);
  view.setUint32(4, timestamp);
  view.setUint32(8, source);
  data.set(payload, 12);
  return parseRtpPacket(data);
};

const stap = (...nals) => {
  const data = new Uint8Array(1 + nals.reduce((size, nal) => size + 2 + nal.length, 0));
  const view = new DataView(data.buffer);
  const nri = nals.reduce((maximum, nal) => Math.max(maximum, nal[0] & 0x60), 0);
  data[0] = nri | 24;
  let offset = 1;
  for (const nal of nals) {
    view.setUint16(offset, nal.length);
    data.set(nal, offset + 2);
    offset += 2 + nal.length;
  }
  return data;
};
const fu = (header, flags, payload) => {
  const data = new Uint8Array(2 + payload.length);
  data[0] = (header & 0xe0) | 28;
  data[1] = flags | (header & 0x1f);
  data.set(payload, 2);
  return data;
};

/* Two pictures encoded with libx264, including two slices per picture.
 * Generated from a red 32 by 32 image at 10 FPS, with AUD and no SEI.
 */
const fixture = [
  ['CRA=', 'Z0LACtolsBEAAAMAAQAAAwAUjxImoA==', 'aM4PyA==',
    'ZYiEOhGKAAIY8cAAQPY4AAh5SeA=', 'ZWIhDoRigACGPHAAED2OAAIeUng='],
  ['CTA=', 'QZogMpw=', 'QWaIDKc=']
].map((unit) => unit.map((nal) => Uint8Array.from(Buffer.from(nal, 'base64'))));

test('preserves single NAL units and raw unsigned RTP timing', () => {
  const push = assembler(0);
  const first = push(packet(bytes(0x67, 1), { timestamp: 0xffffffff, source: 0xffffffff }));
  assert.deepEqual(first, {
    timestamp: 0xffffffff,
    ssrc: 0xffffffff,
    nalUnits: [bytes(0x67, 1)],
    isIdr: false,
    discontinuity: true
  });
  const next = push(packet(bytes(0x65, 2), {
    timestamp: 0, sequence: 2, source: 0xffffffff
  }));
  assert.equal(next.isIdr, true);
  assert.equal(next.discontinuity, false);
  assert.equal(next.timestamp, 0);
});

test('reassembles real H.264 pictures from aggregation, fragmentation and single NAL packets', () => {
  const push = assembler();
  const [first, second] = fixture;
  assert.equal(push(packet(stap(...first.slice(0, 3)), { marker: false })), undefined);
  const nal = first[3];
  assert.equal(push(packet(fu(nal[0], 0x80, nal.subarray(1, 7)), {
    sequence: 2, marker: false
  })), undefined);
  assert.equal(push(packet(fu(nal[0], 0, nal.subarray(7, 13)), {
    sequence: 3, marker: false
  })), undefined);
  assert.equal(push(packet(fu(nal[0], 0x40, nal.subarray(13)), {
    sequence: 4, marker: false
  })), undefined);
  const idr = push(packet(first[4], { sequence: 5 }));
  assert.deepEqual(idr.nalUnits, first);
  assert.equal(idr.isIdr, true);
  assert.equal(idr.discontinuity, true);
  const predicted = push(packet(stap(...second), { sequence: 6, timestamp: 9100 }));
  assert.deepEqual(predicted.nalUnits, second);
  assert.equal(predicted.isIdr, false);
  assert.equal(predicted.discontinuity, false);
});

test('preserves non-picture NAL units in transmission order before IDR', () => {
  const nals = [bytes(0x67, 1), bytes(0x68, 2), bytes(0x06, 3), bytes(0x09, 4)];
  const push = assembler();
  for (const [index, nal] of nals.entries()) {
    const unit = push(packet(nal, { sequence: index + 1 }));
    assert.deepEqual(unit.nalUnits, [nal]);
    assert.equal(unit.isIdr, false);
  }
});

test('does not treat reordered picture timestamps as lost RTP packets', () => {
  const push = assembler();
  push(packet(bytes(0x65, 1), { timestamp: 100 }));
  const next = push(packet(bytes(0x41, 2), { sequence: 2, timestamp: 50 }));
  assert.equal(next.timestamp, 50);
  assert.equal(next.discontinuity, false);
});

test('handles empty FU payloads, ignored reserved bits and sequence wraparound', () => {
  const push = assembler();
  const header = 0x65;
  assert.equal(push(packet(fu(header, 0xa0, bytes()), {
    sequence: 65535, marker: false
  })), undefined);
  assert.equal(push(packet(fu(header, 0, bytes(1, 2)), {
    sequence: 0, marker: false
  })), undefined);
  const result = push(packet(fu(header, 0x40, bytes()), { sequence: 1 }));
  assert.deepEqual(result.nalUnits, [bytes(header, 1, 2)]);
});

test('drops a damaged fragmented picture and reports loss on recovery', () => {
  const push = assembler();
  push(packet(bytes(0x65, 1)));
  push(packet(fu(0x41, 0x80, bytes(2)), { sequence: 2, timestamp: 200, marker: false }));
  assert.equal(push(packet(fu(0x41, 0x40, bytes(3)), { sequence: 4, timestamp: 200 })), undefined);
  const result = push(packet(bytes(0x65, 4), { sequence: 5, timestamp: 300 }));
  assert.equal(result.discontinuity, true);
  assert.deepEqual(result.nalUnits, [bytes(0x65, 4)]);
});

test('discards the access unit containing a sequence gap even without a fragmented NAL', () => {
  const push = assembler();
  push(packet(bytes(0x65, 1)));
  assert.equal(push(packet(bytes(0x41, 2), { sequence: 3, timestamp: 200, marker: false })), undefined);
  assert.equal(push(packet(bytes(0x41, 3), { sequence: 4, timestamp: 200 })), undefined);
  assert.equal(push(packet(bytes(0x65, 4), { sequence: 5, timestamp: 300 })).discontinuity, true);
});

test('does not combine pictures if a marker is missing', () => {
  const push = assembler();
  push(packet(bytes(0x65, 1), { timestamp: 0 }));
  push(packet(bytes(0x41, 1), { sequence: 2, marker: false }));
  const result = push(packet(bytes(0x65, 2), { sequence: 3, timestamp: 200 }));
  assert.deepEqual(result.nalUnits, [bytes(0x65, 2)]);
  assert.equal(result.discontinuity, true);
});

test('ignores other payload types and duplicate sequence numbers', () => {
  const push = assembler();
  const first = packet(bytes(0x67, 1), { marker: false });
  push(first);
  assert.equal(push(first), undefined);
  assert.equal(push(packet(bytes(0x41, 9), { sequence: 55, payloadType: 97, source: 9 })), undefined);
  const last = packet(bytes(0x65, 2), { sequence: 2 });
  assert.deepEqual(push(last).nalUnits, [bytes(0x67, 1), bytes(0x65, 2)]);
  assert.equal(push(last), undefined);
});

test('a source change invalidates partial NAL units and resets sequence tracking', () => {
  const push = assembler();
  push(packet(bytes(0x65, 1)));
  push(packet(fu(0x41, 0x80, bytes(2)), { sequence: 2, marker: false }));
  assert.equal(push(packet(fu(0x41, 0x40, bytes(3)), { source: 2, sequence: 50 })), undefined);
  const result = push(packet(bytes(0x65, 4), { source: 2, sequence: 51 }));
  assert.equal(result.ssrc, 2);
  assert.equal(result.discontinuity, true);
  assert.deepEqual(result.nalUnits, [bytes(0x65, 4)]);
});

test('rejects unsupported packetization modes and packet types', () => {
  assert.throws(() => assembler(2), /packetization mode/);
  for (const data of [stap(bytes(0x65, 1)), fu(0x65, 0x80, bytes(1))]) {
    assert.equal(assembler(0)(packet(data)), undefined);
  }
  for (const type of [0, 25, 26, 27, 29, 30, 31]) {
    assert.equal(assembler()(packet(bytes(0x60 | type, 1))), undefined);
  }
});

test('rejects malformed aggregation packets without returning partial units', () => {
  for (const data of [
    bytes(), bytes(0x78), bytes(0x78, 0), bytes(0x78, 0, 0),
    bytes(0x78, 0, 3, 0x65, 1), stap(bytes(0x65, 1), bytes()),
    stap(bytes(0x65, 1), bytes(0x78, 1)), stap(bytes(0x65, 1), bytes(0xe5, 1)),
    bytes(...stap(bytes(0x65, 1)), 1), bytes(0xf8, 0, 2, 0x65, 1)
  ]) {
    const push = assembler();
    push(packet(bytes(0x67, 1), { marker: false }));
    assert.equal(push(packet(data, { sequence: 2 })), undefined);
    const result = push(packet(bytes(0x65, 2), { sequence: 3, timestamp: 200 }));
    assert.deepEqual(result.nalUnits, [bytes(0x65, 2)]);
    assert.equal(result.discontinuity, true);
  }
});

test('rejects incomplete or inconsistent FU headers and premature markers', () => {
  for (const data of [
    bytes(0x7c), fu(0x65, 0xc0, bytes(1)), fu(0x65, 0x40, bytes(1)),
    fu(0x60, 0x80, bytes(1)), fu(0x78, 0x80, bytes(1)),
    fu(0xe5, 0x80, bytes(1)), fu(0x65, 0x80, bytes(1))
  ]) {
    assert.equal(assembler()(packet(data)), undefined);
  }
  for (const data of [
    fu(0x41, 0x40, bytes(2)), fu(0x45, 0x40, bytes(2)),
    fu(0x65, 0x80, bytes(2)), bytes(0x65, 2), stap(bytes(0x65, 2)),
    fu(0x65, 0, bytes(2))
  ]) {
    const push = assembler();
    push(packet(fu(0x65, 0x80, bytes(1)), { marker: false }));
    assert.equal(push(packet(data, { sequence: 2 })), undefined);
    assert.equal(push(packet(bytes(0x65, 3), { sequence: 3 })).discontinuity, true);
  }
});

test('rejects header-only NAL units in single packets and aggregates', () => {
  for (const header of [0x41, 0x62, 0x63, 0x64, 0x65, 0x06, 0x67, 0x68, 0x09]) {
    assert.equal(assembler(0)(packet(bytes(header))), undefined);
    const push = assembler();
    push(packet(bytes(0x65, 1), { timestamp: 0 }));
    assert.equal(push(packet(stap(bytes(0x67, 1), bytes(header)), {
      sequence: 2, marker: false
    })), undefined);
    assert.equal(push(packet(bytes(0x65, 2), { sequence: 3 })), undefined);
    const recovered = push(packet(bytes(0x65, 3), { sequence: 4, timestamp: 200 }));
    assert.deepEqual(recovered.nalUnits, [bytes(0x65, 3)]);
    assert.equal(recovered.discontinuity, true);
  }
});

test('rejects a fragmented NAL when every fragment has an empty payload', () => {
  for (const header of [0x41, 0x65, 0x67, 0x68]) {
    const push = assembler();
    push(packet(bytes(0x65, 1), { timestamp: 0 }));
    assert.equal(push(packet(fu(header, 0x80, bytes()), {
      sequence: 2, marker: false
    })), undefined);
    assert.equal(push(packet(fu(header, 0, bytes()), {
      sequence: 3, marker: false
    })), undefined);
    assert.equal(push(packet(fu(header, 0x40, bytes()), { sequence: 4 })), undefined);
    const recovered = push(packet(bytes(0x65, 3), { sequence: 5, timestamp: 200 }));
    assert.deepEqual(recovered.nalUnits, [bytes(0x65, 3)]);
    assert.equal(recovered.discontinuity, true);
  }
});

test('preserves header-only end of sequence and end of stream NAL units', () => {
  for (const header of [10, 11]) {
    const nal = bytes(header);
    assert.deepEqual(assembler(0)(packet(nal)).nalUnits, [nal]);
    assert.deepEqual(assembler()(packet(stap(nal))).nalUnits, [nal]);
    const push = assembler();
    assert.equal(push(packet(fu(header, 0x80, bytes()), { marker: false })), undefined);
    assert.deepEqual(push(packet(fu(header, 0x40, bytes()), {
      sequence: 2
    })).nalUnits, [nal]);
  }
});

test('a fragmented NAL cannot continue across RTP timestamps', () => {
  const push = assembler();
  push(packet(fu(0x65, 0x80, bytes(1)), { marker: false }));
  assert.equal(push(packet(fu(0x65, 0x40, bytes(2)), { sequence: 2, timestamp: 200 })), undefined);
  assert.equal(push(packet(bytes(0x65, 3), { sequence: 3, timestamp: 300 })).discontinuity, true);
});

test('owns NAL data independently of the packet buffers and later pictures', () => {
  const push = assembler();
  const aggregate = packet(stap(bytes(0x67, 1)), { marker: false });
  const start = packet(fu(0x65, 0x80, bytes(2)), { sequence: 2, marker: false });
  push(aggregate);
  push(start);
  aggregate.payload.fill(0);
  start.payload.fill(0);
  const end = packet(fu(0x65, 0x40, bytes(3)), { sequence: 3 });
  const result = push(end);
  end.payload.fill(0);
  push(packet(bytes(0x41, 4), { sequence: 4 }));
  assert.deepEqual(result.nalUnits, [bytes(0x67, 1), bytes(0x65, 2, 3)]);
});

test('enforces the byte limit on an active fragmented access unit', () => {
  const limit = 32 * 1024 * 1024;
  const chunk = new Uint8Array(32768);
  for (const extra of [0, 1]) {
    const push = assembler();
    let sequence = 0;
    let size = 1;
    while (size + chunk.length < limit) {
      const flags = sequence === 0 ? 0x80 : 0;
      assert.equal(push(packet(fu(0x65, flags, chunk), { sequence, marker: false })), undefined);
      size += chunk.length;
      sequence++;
    }
    const last = new Uint8Array(limit - size + extra);
    const result = push(packet(fu(0x65, 0x40, last), { sequence }));
    if (extra === 0) {
      assert.equal(result.nalUnits[0].length, limit);
    } else {
      assert.equal(result, undefined);
    }
    assert.ok(push(packet(bytes(0x65, 2), { sequence: sequence + 1, timestamp: 200 })));
  }
});

test('bounds the number of packets even for empty FU payloads', () => {
  const limit = 65536;
  for (const extra of [0, 1]) {
    const push = assembler();
    push(packet(fu(0x65, 0x80, bytes(1)), { sequence: 0, marker: false }));
    for (let i = 1; i < limit + extra - 1; i++) {
      assert.equal(push(packet(fu(0x65, 0, bytes()), { sequence: i & 0xffff, marker: false })), undefined);
    }
    const sequence = (limit + extra - 1) & 0xffff;
    const result = push(packet(fu(0x65, 0x40, bytes(2)), { sequence }));
    if (extra === 0) {
      assert.deepEqual(result.nalUnits, [bytes(0x65, 1, 2)]);
    } else {
      assert.equal(result, undefined);
    }
    assert.ok(push(packet(bytes(0x65, 3), { sequence: (sequence + 1) & 0xffff, timestamp: 200 })));
  }
});

test('bounds the number of retained NAL units in aggregate packets', () => {
  const limit = 4096;
  for (const extra of [0, 1]) {
    const push = assembler();
    const nals = Array.from({ length: limit + extra }, () => bytes(0x06, 1));
    const result = push(packet(stap(...nals)));
    if (extra === 0) {
      assert.equal(result.nalUnits.length, limit);
    } else {
      assert.equal(result, undefined);
    }
    assert.ok(push(packet(bytes(0x65, 3), { sequence: 2, timestamp: 200 })));
  }
});
