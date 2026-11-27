import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let formats;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  formats = await server.ssrLoadModule(
    '/src/components/player/streamFormats.ts'
  );
});

after(async () => {
  await server?.close();
});

test('detects AV1 support from the camera format list', () => {
  assert.equal(
    formats.deviceSupportsAv1({
      'root.Properties.Image.Format': 'av1,jpeg,mjpeg,h264,h265'
    }),
    true
  );
  assert.equal(
    formats.deviceSupportsAv1({
      'root.Properties.Image.Format': 'jpeg,mjpeg,h264,h265'
    }),
    false
  );
  assert.equal(formats.deviceSupportsAv1(null), false);
});

test('a saved AV1 choice falls back to H.264 when AV1 cannot be played', () => {
  assert.equal(formats.getPlayableFormat(formats.MP4_AV1, true), 'MP4_AV1');
  assert.equal(formats.getPlayableFormat(formats.MP4_AV1, false), 'MP4_H264');
  assert.equal(formats.getPlayableFormat('RTP_H264', false), 'RTP_H264');
});
