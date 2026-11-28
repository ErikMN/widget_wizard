import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseRtpPacket;
let createH264AccessUnitAssembler;
let createH264Depacketizer;
let parseH264Format;

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
  ({ createH264Depacketizer } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Depacketizer.ts'
  ));
  ({ parseH264Format } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Format.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const assembler = (mode = 1) => {
  const push = createH264Depacketizer(96, mode);
  return (input) => {
    const batches = push(input);
    assert.ok(batches.length <= 1);
    return batches[0];
  };
};
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
    discontinuity: true
  });
  const next = push(packet(bytes(0x65, 2), {
    timestamp: 0, sequence: 2, source: 0xffffffff
  }));
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
  assert.equal(idr.discontinuity, true);
  const predicted = push(packet(stap(...second), { sequence: 6, timestamp: 9100 }));
  assert.deepEqual(predicted.nalUnits, second);
  assert.equal(predicted.discontinuity, false);
});

test('preserves non-picture NAL units in transmission order before IDR', () => {
  const nals = [bytes(0x67, 1), bytes(0x68, 2), bytes(0x06, 3), bytes(0x09, 4)];
  const push = assembler();
  for (const [index, nal] of nals.entries()) {
    const unit = push(packet(nal, { sequence: index + 1 }));
    assert.deepEqual(unit.nalUnits, [nal]);
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

test('releases an unmarked batch when the timestamp changes', () => {
  const push = createH264Depacketizer(96, 1);
  push(packet(bytes(0x65, 1), { timestamp: 0 }));
  assert.deepEqual(push(packet(bytes(0x41, 1), { sequence: 2, marker: false })), []);
  const result = push(packet(bytes(0x65, 2), { sequence: 3, timestamp: 200 }));
  assert.deepEqual(result.map((batch) => batch.nalUnits), [[bytes(0x41, 1)], [bytes(0x65, 2)]]);
  assert.deepEqual(result.map((batch) => batch.discontinuity), [false, false]);
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

test('rejects incomplete or inconsistent FU headers', () => {
  for (const data of [
    bytes(0x7c), fu(0x65, 0xc0, bytes(1)), fu(0x65, 0x40, bytes(1)),
    fu(0x60, 0x80, bytes(1)), fu(0x78, 0x80, bytes(1)),
    fu(0xe5, 0x80, bytes(1))
  ]) {
    assert.equal(assembler()(packet(data)), undefined);
  }
  for (const data of [
    fu(0x41, 0x40, bytes(2)), fu(0x45, 0x40, bytes(2)),
    fu(0x65, 0x80, bytes(2)), bytes(0x65, 2), stap(bytes(0x65, 2))
  ]) {
    const push = assembler();
    push(packet(fu(0x65, 0x80, bytes(1)), { marker: false }));
    assert.equal(push(packet(data, { sequence: 2 })), undefined);
    assert.equal(push(packet(bytes(0x65, 3), { sequence: 3 })).discontinuity, true);
  }
});

test('ignores premature markers inside a fragmented NAL unit', () => {
  const push = assembler();
  assert.equal(push(packet(fu(0x65, 0x80, bytes(1)))), undefined);
  assert.equal(push(packet(fu(0x65, 0, bytes(2)), { sequence: 2 })), undefined);
  const result = push(packet(fu(0x65, 0x40, bytes(3)), { sequence: 3 }));
  assert.deepEqual(result.nalUnits, [bytes(0x65, 1, 2, 3)]);
  assert.equal(result.discontinuity, true);
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

const pictures = (withParameterSets = false) => {
  const parameterSets = withParameterSets
    ? ';sprop-parameter-sets=' + fixture[0].slice(1, 3).map((nal) => Buffer.from(nal).toString('base64')).join(',')
    : '';
  return createH264AccessUnitAssembler(96, parseH264Format('packetization-mode=1' + parameterSets));
};

test('assembles a picture across early markers and emits only at a following boundary', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  for (const [index, nal] of idr.entries()) {
    assert.deepEqual(push(packet(nal, { sequence: index + 1 })), []);
  }
  const [first] = push(packet(stap(...predicted), { sequence: 6, timestamp: 9100 }));
  assert.deepEqual(first.nalUnits, idr);
  assert.equal(first.configuration.sps.info.width, 32);
  assert.equal(first.isIdr, true);
  assert.equal(first.discontinuity, true);
  const [next] = push(packet(stap(...idr), { sequence: 7, timestamp: 18100 }));
  assert.deepEqual(next.nalUnits, predicted);
  assert.equal(next.isIdr, false);
  assert.equal(next.discontinuity, false);
});

test('assembles unmarked pictures and preserves decoding order with decreasing timestamps', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  assert.deepEqual(push(packet(stap(...idr), { marker: false })), []);
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 2, timestamp: 50, marker: false })), []);
  const [first] = push(packet(stap(...idr), { sequence: 3, timestamp: 200, marker: false }));
  assert.deepEqual(first.nalUnits, idr);
  assert.equal(first.timestamp, 100);
  const [next] = push(packet(stap(...predicted), { sequence: 4, timestamp: 300 }));
  assert.deepEqual(next.nalUnits, predicted);
  assert.equal(next.timestamp, 50);
});

test('uses slice identity to separate pictures with equal RTP timestamps', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  assert.deepEqual(push(packet(stap(...idr))), []);
  const [first] = push(packet(stap(...predicted), { sequence: 2 }));
  assert.deepEqual(first.nalUnits, idr);
  const [next] = push(packet(stap(...idr.slice(3)), { sequence: 3 }));
  assert.deepEqual(next.nalUnits, predicted);
});

test('does not recover from an IDR that started before reception', () => {
  const push = pictures(true);
  const [idr, predicted] = fixture;
  assert.deepEqual(push(packet(idr[4])), []);
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 2, timestamp: 200 })), []);
  assert.deepEqual(push(packet(stap(...idr.slice(3)), { sequence: 3, timestamp: 300 })), []);
  const [first] = push(packet(stap(...predicted), { sequence: 4, timestamp: 400 }));
  assert.deepEqual(first.nalUnits, idr.slice(3));
  assert.equal(first.discontinuity, true);
});

test('drops pending pictures after a packet gap and waits for another IDR', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  push(packet(stap(...idr)));
  assert.equal(push(packet(stap(...predicted), { sequence: 2, timestamp: 200 })).length, 1);
  assert.deepEqual(push(packet(predicted[1], { sequence: 4, timestamp: 200 })), []);
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 5, timestamp: 300 })), []);
  assert.deepEqual(push(packet(stap(...idr), { sequence: 6, timestamp: 400 })), []);
  const [recovered] = push(packet(stap(...predicted), { sequence: 7, timestamp: 500 }));
  assert.equal(recovered.isIdr, true);
  assert.equal(recovered.discontinuity, true);
});

test('waits for an IDR when the selected parameter set changes', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  const replacement = new Uint8Array(idr[1]);
  replacement[3]++;
  push(packet(stap(...idr)));
  const [first] = push(packet(stap(replacement, ...predicted), { sequence: 2, timestamp: 200 }));
  assert.deepEqual(first.configuration.sps.nal, idr[1]);
  assert.deepEqual(push(packet(stap(idr[0], replacement, ...idr.slice(2)), { sequence: 3, timestamp: 300 })), []);
  const [recovered] = push(packet(stap(...predicted), { sequence: 4, timestamp: 400 }));
  assert.deepEqual(recovered.configuration.sps.nal, replacement);
  assert.equal(recovered.discontinuity, true);
});

test('clears in-band parameter sets and incomplete pictures when the source changes', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  push(packet(stap(...idr)));
  assert.deepEqual(push(packet(stap(...idr.slice(3)), { source: 2, sequence: 100 })), []);
  assert.deepEqual(push(packet(stap(...predicted), { source: 2, sequence: 101, timestamp: 200 })), []);
  assert.deepEqual(push(packet(stap(...idr), { source: 2, sequence: 102, timestamp: 300 })), []);
  const [recovered] = push(packet(stap(...predicted), { source: 2, sequence: 103, timestamp: 400 }));
  assert.equal(recovered.ssrc, 2);
  assert.equal(recovered.discontinuity, true);
});

test('does not emit a picture without macroblock zero or after an invalid slice', () => {
  const [idr, predicted] = fixture;
  for (const invalid of [idr[4], bytes(0x65, 0)]) {
    const push = pictures();
    assert.deepEqual(push(packet(stap(...idr.slice(0, 3), invalid))), []);
    assert.deepEqual(push(packet(stap(...predicted), { sequence: 2, timestamp: 200 })), []);
    assert.deepEqual(push(packet(stap(...idr), { sequence: 3, timestamp: 300 })), []);
    assert.equal(push(packet(stap(...predicted), { sequence: 4, timestamp: 400 })).length, 1);
  }
});

test('does not release an unmarked batch across a sequence gap', () => {
  const push = createH264Depacketizer(96, 1);
  push(packet(bytes(0x65, 1), { marker: false }));
  assert.deepEqual(push(packet(bytes(0x41, 2), { sequence: 3, timestamp: 200 })), []);
  const [next] = push(packet(bytes(0x65, 3), { sequence: 4, timestamp: 300 }));
  assert.equal(next.discontinuity, true);
  assert.deepEqual(next.nalUnits, [bytes(0x65, 3)]);
});

test('bounds picture NAL count across repeated transport markers', () => {
  const push = pictures();
  const [idr, predicted] = fixture;
  push(packet(stap(...idr)));
  for (let sequence = 2; sequence <= 4094; sequence++) {
    assert.deepEqual(push(packet(bytes(0x0c, 0xff, 0x80), { sequence })), []);
  }
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 4095, timestamp: 200 })), []);
  assert.deepEqual(push(packet(stap(...idr), { sequence: 4096, timestamp: 300 })), []);
  const [recovered] = push(packet(stap(...predicted), { sequence: 4097, timestamp: 400 }));
  assert.equal(recovered.discontinuity, true);
});

test('invalidates the affected parameter set type after a rejected update', () => {
  const [idr, predicted] = fixture;
  const idrWithoutSets = [idr[0], ...idr.slice(3)];
  for (const [index, malformed] of [[1, bytes(0x67, 1)], [2, bytes(0x68, 0xcc)]]) {
    const push = pictures(true);
    push(packet(stap(...idrWithoutSets)));
    assert.equal(push(packet(stap(...predicted), { sequence: 2, timestamp: 200 })).length, 1);
    const [previous] = push(packet(stap(idr[0], malformed, ...idr.slice(3)), {
      sequence: 3, timestamp: 300
    }));
    assert.deepEqual(previous.nalUnits, predicted);
    assert.deepEqual(push(packet(stap(...idrWithoutSets), { sequence: 4, timestamp: 400 })), []);
    assert.deepEqual(push(packet(stap(...predicted), { sequence: 5, timestamp: 500 })), []);
    assert.deepEqual(push(packet(stap(idr[0], idr[index], ...idr.slice(3)), {
      sequence: 6, timestamp: 600
    })), []);
    const [recovered] = push(packet(stap(...predicted), { sequence: 7, timestamp: 700 }));
    assert.equal(recovered.discontinuity, true);
    assert.deepEqual(recovered.configuration.sps.nal, idr[1]);
    assert.deepEqual(recovered.configuration.pps.nal, idr[2]);
  }
});

test('drops an incomplete IDR after an early marker and recovers with SDP parameter sets', () => {
  const push = pictures(true);
  const [idr, predicted] = fixture;
  assert.deepEqual(push(packet(stap(idr[0], idr[3]))), []);
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 3, timestamp: 200 })), []);
  assert.deepEqual(push(packet(stap(...predicted), { sequence: 4, timestamp: 300 })), []);
  const idrWithoutSets = [idr[0], ...idr.slice(3)];
  assert.deepEqual(push(packet(stap(...idrWithoutSets), { sequence: 5, timestamp: 400 })), []);
  const [recovered] = push(packet(stap(...predicted), { sequence: 6, timestamp: 500 }));
  assert.deepEqual(recovered.nalUnits, idrWithoutSets);
  assert.equal(recovered.discontinuity, true);
});

test('emits the last picture at an unmarked end of sequence or stream', () => {
  const [idr] = fixture;
  for (const type of [10, 11]) {
    const end = bytes(type);
    for (const mode of ['single', 'aggregate', 'fragment']) {
      const push = pictures();
      let result;
      if (mode === 'aggregate') {
        result = push(packet(stap(...idr, end), { marker: false }));
      } else {
        assert.deepEqual(push(packet(stap(...idr), { marker: false })), []);
        if (mode === 'fragment') {
          assert.deepEqual(push(packet(fu(type, 0x80, bytes()), { sequence: 2, marker: false })), []);
          result = push(packet(fu(type, 0x40, bytes()), { sequence: 3, marker: false }));
        } else {
          result = push(packet(end, { sequence: 2, marker: false }));
        }
      }
      assert.equal(result.length, 1);
      assert.deepEqual(result[0].nalUnits, [...idr, end]);
      assert.equal(result[0].discontinuity, true);
    }
  }
});

test('does not emit a damaged picture at an unmarked end of stream', () => {
  const [idr] = fixture;
  const push = pictures();
  assert.deepEqual(push(packet(stap(...idr), { marker: false })), []);
  assert.deepEqual(push(packet(bytes(11), { sequence: 3, marker: false })), []);
});
