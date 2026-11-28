import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let getStreamStats;
let readLegacyStreamMetrics;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ getStreamStats } = await server.ssrLoadModule(
    '/src/components/player/native/streamStats.ts'
  ));
  ({ readLegacyStreamMetrics } = await server.ssrLoadModule(
    '/src/components/player/native/legacyStreamStats.ts'
  ));
});

after(async () => {
  await server?.close();
});

test('preserves the existing labels for all five formats', () => {
  for (const [format, label] of [
    ['JPEG', 'Still image'],
    ['MJPEG', 'MJPEG'],
    ['RTP_JPEG', 'MJPEG'],
    ['RTP_H264', 'RTSP (WebSocket)'],
    ['MP4_H264', 'MP4 (HTTP)']
  ]) {
    assert.deepEqual(getStreamStats(format, 1920, 1080, 0, undefined), [
      { name: 'Stream type', value: label },
      { name: 'Resolution', value: '1920x1080' },
      { name: 'Refreshed', value: 0, unit: 'time' }
    ]);
  }
});

test('formats encoding, frame rate, bitrate and volume with existing units', () => {
  assert.deepEqual(
    getStreamStats('RTP_H264', 1920, 1080, 2, 0.567, {
      encoding: 'H.264 Main (4.1)',
      frameRate: 29.976,
      bitrate: 1234567
    }),
    [
      { name: 'Stream type', value: 'RTSP (WebSocket)' },
      { name: 'Resolution', value: '1920x1080' },
      { name: 'Refreshed', value: 2, unit: 'times' },
      { name: 'Encoding', value: 'H.264 Main (4.1)' },
      { name: 'Frame rate', value: 29.98, unit: 'fps' },
      { name: 'Bitrate', value: 1235, unit: 'kbit/s' },
      { name: 'Volume', value: 56, unit: '%' }
    ]
  );
});

test('omits unavailable metrics but retains a measured zero', () => {
  const stats = getStreamStats('MP4_H264', 1280, 720, 1, 0, {
    frameRate: NaN,
    bitrate: 0
  });
  assert.deepEqual(stats.slice(3), [
    { name: 'Bitrate', value: 0, unit: 'kbit/s' },
    { name: 'Volume', value: 0, unit: '%' }
  ]);
});

test('selects the video track rather than the first track', () => {
  assert.deepEqual(
    readLegacyStreamMetrics({
      pipeline: {
        tracks: [
          { type: 'audio' },
          {
            type: 'video',
            codec: { coding: 'H.264', profile: 'Main', level: '4.1' }
          }
        ],
        framerate: [50, 30],
        bitrate: [64000, 2000000]
      }
    }),
    { encoding: 'H.264 Main (4.1)', frameRate: 30, bitrate: 2000000 }
  );
});

test('returns no metrics without a reported video track', () => {
  assert.deepEqual(readLegacyStreamMetrics({}), {});
  assert.deepEqual(readLegacyStreamMetrics({ pipeline: {} }), {});
  assert.deepEqual(
    readLegacyStreamMetrics({ pipeline: { tracks: [{ type: 'audio' }] } }),
    {}
  );
});
