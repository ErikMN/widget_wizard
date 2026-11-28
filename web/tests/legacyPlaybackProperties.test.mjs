import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let adaptLegacyPlaybackProperties;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ adaptLegacyPlaybackProperties } = await server.ssrLoadModule(
    '/src/components/player/native/legacyPlaybackProperties.ts'
  ));
});

after(async () => {
  await server?.close();
});

const properties = { el: {}, width: 1920, height: 1080 };

test('preserves dimensions and optional volume without a pipeline', () => {
  assert.deepEqual(adaptLegacyPlaybackProperties(properties), {
    ...properties,
    volume: undefined
  });
  assert.equal(
    adaptLegacyPlaybackProperties({ ...properties, volume: 0 }).volume,
    0
  );
});

test('reads current playback time and preserves the recording range', () => {
  const pipeline = { currentTime: 2 };
  const report = adaptLegacyPlaybackProperties({
    ...properties,
    pipeline,
    range: [8, 19]
  });

  assert.equal(report.timeline.start, 8);
  assert.equal(report.timeline.end, 19);
  assert.equal(report.timeline.readCurrentTime(), 2);
  pipeline.currentTime = 4;
  assert.equal(report.timeline.readCurrentTime(), 4);
  assert.equal('pipeline' in report, false);
  assert.equal('range' in report, false);
});

test('preserves unknown bounds for a live stream', () => {
  const report = adaptLegacyPlaybackProperties({
    ...properties,
    pipeline: { currentTime: 3 }
  });
  assert.equal(report.timeline.start, undefined);
  assert.equal(report.timeline.end, undefined);
  assert.equal(report.timeline.readCurrentTime(), 3);
});

test('reads current metrics from the video track rather than the first track', () => {
  const pipeline = {
    tracks: [
      { type: 'audio' },
      {
        type: 'video',
        codec: { coding: 'H.264', profile: 'Main', level: '4.1' }
      }
    ],
    framerate: [50, 30],
    bitrate: [64000, 2000000]
  };
  const report = adaptLegacyPlaybackProperties({ ...properties, pipeline });

  assert.deepEqual(report.readMetrics(), {
    encoding: 'H.264 Main (4.1)',
    frameRate: 30,
    bitrate: 2000000
  });
  pipeline.framerate[1] = 25;
  pipeline.bitrate[1] = 1500000;
  assert.deepEqual(report.readMetrics(), {
    encoding: 'H.264 Main (4.1)',
    frameRate: 25,
    bitrate: 1500000
  });
});

test('returns no metrics without a reported video track', () => {
  for (const pipeline of [{}, { tracks: [{ type: 'audio' }] }]) {
    const report = adaptLegacyPlaybackProperties({ ...properties, pipeline });
    assert.deepEqual(report.readMetrics(), {});
  }
});

test('keeps readers associated with the pipeline that reported them', () => {
  const first = { currentTime: 2 };
  const second = { currentTime: 8 };
  const firstReport = adaptLegacyPlaybackProperties({
    ...properties,
    pipeline: first
  });
  const secondReport = adaptLegacyPlaybackProperties({
    ...properties,
    pipeline: second
  });

  assert.equal(firstReport.timeline.readCurrentTime(), 2);
  assert.equal(secondReport.timeline.readCurrentTime(), 8);
  first.currentTime = 3;
  assert.equal(firstReport.timeline.readCurrentTime(), 3);
  assert.equal(secondReport.timeline.readCurrentTime(), 8);
});
