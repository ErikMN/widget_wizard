import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createH264PresentationClock;
let H264_CLOCK_RATE;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ createH264PresentationClock, H264_CLOCK_RATE } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Timing.ts'
  ));
});

after(async () => {
  await server?.close();
});

test('keeps exact RTP presentation times for variable frame intervals', () => {
  assert.equal(H264_CLOCK_RATE, 90000);
  const clock = createH264PresentationClock();
  const times = [123456, 126456, 135456, 139056, 139056];
  assert.deepEqual(times.map((timestamp) => clock({ ssrc: 1, timestamp })), [
    0, 3000, 12000, 15600, 15600
  ]);
});

test('preserves non-monotonic presentation times in decoding order across wraparound', () => {
  const clock = createH264PresentationClock();
  const first = 0xfffff000;
  /* I, P, B, B, P, B: display order differs from decode order. */
  const offsets = [0, 10800, 3600, 7200, 18000, 14400];
  assert.deepEqual(offsets.map((offset) => clock({
    ssrc: 1, timestamp: (first + offset) >>> 0
  })), offsets);
});

test('permits presentation times before the first received picture', () => {
  const clock = createH264PresentationClock();
  assert.equal(clock({ ssrc: 1, timestamp: 100 }), 0);
  assert.equal(clock({ ssrc: 1, timestamp: 0xffffff00 }), -356);
  assert.equal(clock({ ssrc: 1, timestamp: 200 }), 100);
});

test('extends timestamps through more than one complete wrap without losing ticks', () => {
  const clock = createH264PresentationClock();
  for (let index = 0; index <= 10; index++) {
    const offset = index * 1000000000;
    assert.equal(clock({ ssrc: 1, timestamp: offset >>> 0 }), offset);
  }
});

test('keeps the presentation clock across discontinuities within a source', () => {
  const clock = createH264PresentationClock();
  const first = { ssrc: 1, timestamp: 100, discontinuity: true };
  const recovered = { ssrc: 1, timestamp: 90100, discontinuity: true };
  assert.equal(clock(first), 0);
  assert.equal(clock(recovered), 90000);
  assert.equal(clock({ ssrc: 2, timestamp: 42 }), 0);
  assert.equal(clock({ ssrc: 2, timestamp: 3042 }), 3000);
  assert.equal(createH264PresentationClock()(recovered), 0);
});

test('rejects ambiguous or invalid timestamps without changing the clock', () => {
  const clock = createH264PresentationClock();
  assert.equal(clock({ ssrc: 1, timestamp: 0 }), 0);
  for (const timestamp of [-1, 1.5, NaN, Infinity, 0x100000000]) {
    assert.throws(() => clock({ ssrc: 1, timestamp }), /Invalid/);
  }
  assert.throws(() => clock({ ssrc: 1, timestamp: 0x80000000 }), /Ambiguous/);
  assert.equal(clock({ ssrc: 1, timestamp: 3600 }), 3600);
});

test('handles both sides of the half-range limit without clamping', () => {
  const forward = createH264PresentationClock();
  assert.equal(forward({ ssrc: 1, timestamp: 0 }), 0);
  assert.equal(forward({ ssrc: 1, timestamp: 0x7fffffff }), 0x7fffffff);
  const backward = createH264PresentationClock();
  assert.equal(backward({ ssrc: 1, timestamp: 0xffffffff }), 0);
  assert.throws(() => backward({ ssrc: 1, timestamp: 0x7fffffff }), /Ambiguous/);
  assert.equal(backward({ ssrc: 1, timestamp: 0x80000000 }), -0x7fffffff);
});
