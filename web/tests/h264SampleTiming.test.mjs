import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createH264SampleTimeline;
let createH264PresentationClock;
let parseH264Format;
let createH264ParameterSetStore;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  const base = '/src/components/player/native/rtsp/h264';
  ({ createH264SampleTimeline } = await server.ssrLoadModule(base + '/h264SampleTiming.ts'));
  ({ createH264PresentationClock } = await server.ssrLoadModule(base + '/h264Timing.ts'));
  ({ parseH264Format } = await server.ssrLoadModule(base + '/h264Format.ts'));
  ({ createH264ParameterSetStore } = await server.ssrLoadModule(base + '/h264Configuration.ts'));
});

after(async () => {
  await server?.close();
});

/* Use a real progressive SPS and PPS. Override timing metadata only when
 * exercising a declared fixed cadence or unsupported configuration.
 */
const configuration = (reorder = 0, timing, options = {}) => {
  const format = parseH264Format(
    'sprop-parameter-sets=Z0LACtolsBEAAAMAAQAAAwAUjxImoA==,aM4PyA=='
  );
  const config = createH264ParameterSetStore(format).resolve(0);
  return {
    ...config,
    sps: {
      ...config.sps,
      info: {
        ...config.sps.info,
        ...options,
        vui: { ...config.sps.info.vui, maxNumReorderFrames: reorder, timing, ...options.vui }
      }
    }
  };
};

const unit = (config, timestamp, options = {}) => ({
  timestamp, ssrc: 1, nalUnits: [], configuration: config,
  isIdr: false, discontinuity: false, ...options
});
const idr = (config, timestamp) => unit(config, timestamp, { isIdr: true, discontinuity: true });
const times = (sample) => [
  sample.presentationTimestamp, sample.decodeTimestamp, sample.duration, sample.compositionOffset
];

test('times non-reordered variable-rate pictures from the following timestamp', () => {
  const config = configuration();
  const timeline = createH264SampleTimeline(config);
  const clock = createH264PresentationClock();
  const input = [idr(config, 0xfffffff0), unit(config, 2984), unit(config, 11984)];
  const results = input.map((picture) => timeline.push(picture, clock(picture)));
  assert.equal(results[0], undefined);
  assert.equal(results[1].unit, input[0]);
  assert.deepEqual(times(results[1]), [0, 0, 3000, 0]);
  assert.deepEqual(times(results[2]), [3000, 3000, 9000, 0]);
  assert.deepEqual(times(timeline.finish(3600)), [12000, 12000, 3600, 0]);
  assert.equal(timeline.finish(), undefined);
  assert.throws(() => timeline.push(input[2], 16000), /closed/);
});

test('does not invent a duration for the final variable-rate picture', () => {
  const config = configuration();
  const timeline = createH264SampleTimeline(config);
  assert.equal(timeline.push(idr(config, 10), 0), undefined);
  assert.equal(timeline.finish(), undefined);
});

test('constructs a decode schedule for reordered fixed-rate pictures', () => {
  const config = configuration(2, { numUnitsInTick: 1, timeScale: 50, fixedFrameRate: true });
  const timeline = createH264SampleTimeline(config);
  const clock = createH264PresentationClock();
  const offsets = [0, 10800, 3600, 7200, 18000, 14400];
  const result = offsets.map((offset, index) => {
    const timestamp = (0xfffff000 + offset) >>> 0;
    const picture = index === 0 ? idr(config, timestamp) : unit(config, timestamp);
    return times(timeline.push(picture, clock(picture)));
  });
  assert.deepEqual(result, [
    [0, -7200, 3600, 7200],
    [10800, -3600, 3600, 14400],
    [3600, 0, 3600, 3600],
    [7200, 3600, 3600, 3600],
    [18000, 7200, 3600, 10800],
    [14400, 10800, 3600, 3600]
  ]);
  assert.equal(timeline.finish(), undefined);
});

test('rounds fractional cadence boundaries without accumulating duration error', () => {
  const config = configuration(1, { numUnitsInTick: 1001, timeScale: 48000, fixedFrameRate: true });
  const timeline = createH264SampleTimeline(config);
  const anchor = 100000;
  const count = 24000;
  let previous;
  let total = 0;
  for (let index = 0; index < count; index++) {
    const pts = anchor + Math.round(index * 3753.75);
    const picture = index === 0 ? idr(config, pts) : unit(config, pts);
    const sample = timeline.push(picture, pts);
    if (previous) {
      assert.equal(sample.decodeTimestamp, previous.decodeTimestamp + previous.duration);
    }
    assert.ok(sample.duration === 3753 || sample.duration === 3754);
    assert.equal(sample.presentationTimestamp, pts);
    total += sample.duration;
    previous = sample;
  }
  assert.equal(total, count * 3753.75);
  timeline.finish();
});

test('accepts RTP quantization on either side of a fractional cadence boundary', () => {
  const config = configuration(1, { numUnitsInTick: 1001, timeScale: 48000, fixedFrameRate: true });
  for (const quantize of [Math.floor, Math.ceil]) {
    const timeline = createH264SampleTimeline(config);
    const anchor = 123;
    for (let i = 0; i < 8; i++) {
      const pts = anchor + quantize(i * 3753.75);
      const picture = i === 0 ? idr(config, pts) : unit(config, pts);
      assert.equal(timeline.push(picture, pts).presentationTimestamp, pts);
    }
    timeline.finish();
  }
});

test('rejects unsupported timing rather than guessing a frame rate', () => {
  const fixed = { numUnitsInTick: 1, timeScale: 50, fixedFrameRate: true };
  for (const config of [
    configuration(1), configuration(1, { ...fixed, fixedFrameRate: false }),
    configuration(0, undefined, { vui: { maxNumReorderFrames: undefined } }),
    configuration(0, undefined, { frameMbsOnly: false }),
    configuration(0, undefined, { vui: { picStructPresent: true } }),
    configuration(1, { numUnitsInTick: 1, timeScale: 0xffffffff, fixedFrameRate: true })
  ]) {
    assert.throws(() => createH264SampleTimeline(config), /H.264/);
  }
});

test('rejects non-increasing decode times and invalid explicit final durations', () => {
  const config = configuration();
  for (const pts of [0, -1, 0x100000000, NaN, 1.5]) {
    const timeline = createH264SampleTimeline(config);
    timeline.push(idr(config, 0), 0);
    assert.throws(() => timeline.push(unit(config, 1), pts), /H.264/);
  }
  for (const duration of [0, -1, 1.5, 0x100000000]) {
    const timeline = createH264SampleTimeline(config);
    timeline.push(idr(config, 0), 0);
    assert.throws(() => timeline.finish(duration), /sample timing/);
  }
});

test('rejects inconsistent fixed cadence, duplicates and excessive reordering', () => {
  const config = configuration(1, { numUnitsInTick: 1, timeScale: 50, fixedFrameRate: true });
  for (const [offsets, error] of [
    [[0, 3601], /fixed cadence/],
    [[0, 3600, 3600], /Duplicate/],
    [[0, 10800, 14400], /reorder bound/]
  ]) {
    const timeline = createH264SampleTimeline(config);
    timeline.push(idr(config, 0), 0);
    assert.throws(() => {
      for (const pts of offsets.slice(1)) {
        timeline.push(unit(config, pts), pts);
      }
    }, error);
  }
  const timeline = createH264SampleTimeline(config);
  timeline.push(idr(config, 0), 0);
  timeline.push(unit(config, 7200), 7200);
  assert.throws(() => timeline.finish(), /Incomplete/);
});

test('requires a new timeline after loss or a source or configuration change', () => {
  const config = configuration();
  const initial = createH264SampleTimeline(config);
  assert.throws(() => initial.push(unit(config, 0), 0), /IDR/);
  assert.throws(() => initial.push(idr(config, 0), 0), /closed/);
  for (const picture of [
    idr(config, 90000),
    unit(config, 90000, { ssrc: 2 }),
    unit(configuration(), 90000)
  ]) {
    const timeline = createH264SampleTimeline(config);
    timeline.push(idr(config, 0), 0);
    assert.throws(() => timeline.push(picture, 90000), /new run/);
    assert.equal(timeline.finish(3600), undefined);
    assert.throws(() => timeline.push(unit(config, 93600), 93600), /closed/);
  }
  const recovered = createH264SampleTimeline(config);
  recovered.push(idr(config, 90000), 90000);
  assert.deepEqual(times(recovered.push(unit(config, 93600), 93600)), [90000, 90000, 3600, 0]);
});

test('bounds the number of reordered pictures rather than their forward time distance', () => {
  const config = configuration(1, { numUnitsInTick: 1, timeScale: 50, fixedFrameRate: true });
  const timeline = createH264SampleTimeline(config);
  const order = [0, 5, 1, 2, 3, 4];
  const samples = order.map((index, decodeIndex) => {
    const pts = index * 3600;
    const picture = decodeIndex === 0 ? idr(config, pts) : unit(config, pts);
    return timeline.push(picture, pts);
  });
  assert.deepEqual(samples.map((sample) => sample.presentationTimestamp), order.map((index) => index * 3600));
  assert.deepEqual(samples.map((sample) => sample.decodeTimestamp), [-3600, 0, 3600, 7200, 10800, 14400]);
  assert.equal(timeline.finish(), undefined);
});

test('rejects composition offsets that do not fit an MP4 track run', () => {
  const cadence = { numUnitsInTick: 50000, timeScale: 9, fixedFrameRate: true };
  const config = configuration(4, cadence);
  const timeline = createH264SampleTimeline(config);
  const first = timeline.push(idr(config, 0), 0);
  assert.deepEqual(times(first), [0, -4000000000, 1000000000, 4000000000]);
  assert.throws(() => timeline.push(unit(config, 2000000000), 2000000000), /sample timing/);
  assert.equal(timeline.finish(), undefined);

  const max = 0xffffffff;
  const limit = configuration(1, { numUnitsInTick: max, timeScale: 180000, fixedFrameRate: true });
  const edge = createH264SampleTimeline(limit);
  assert.deepEqual(times(edge.push(idr(limit, 0), 0)), [0, -max, max, max]);
});

test('rejects sample ends outside the exact integer timestamp range', () => {
  const config = configuration();
  const timeline = createH264SampleTimeline(config);
  const limit = Number.MAX_SAFE_INTEGER;
  timeline.push(idr(config, limit - 1), limit - 1);
  assert.deepEqual(times(timeline.push(unit(config, limit), limit)), [limit - 1, limit - 1, 1, 0]);
  assert.throws(() => timeline.finish(1), /sample timing/);
  assert.equal(timeline.finish(1), undefined);

  const fixed = configuration(1, { numUnitsInTick: 1, timeScale: 50, fixedFrameRate: true });
  const reordered = createH264SampleTimeline(fixed);
  assert.throws(() => reordered.push(idr(fixed, limit), limit), /sample timing/);
  assert.throws(() => reordered.push(idr(fixed, 0), 0), /closed/);
});

test('discards a pending variable-rate sample after an invalid timestamp', () => {
  const config = configuration();
  const timeline = createH264SampleTimeline(config);
  timeline.push(idr(config, 0), 0);
  assert.throws(() => timeline.push(unit(config, 0), 0), /sample timing/);
  assert.equal(timeline.finish(3600), undefined);
  assert.throws(() => timeline.push(unit(config, 3600), 3600), /closed/);
});
