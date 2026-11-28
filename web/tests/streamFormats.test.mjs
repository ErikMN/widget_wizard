import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let getStreamFormat;
let isStreamFormat;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ getStreamFormat, isStreamFormat } = await server.ssrLoadModule(
    '/src/components/player/native/types.ts'
  ));
});

after(async () => {
  await server?.close();
});

test('preserves all previously saved stream formats', () => {
  for (const format of ['MP4_H264', 'RTP_H264', 'RTP_JPEG', 'MJPEG', 'JPEG']) {
    assert.equal(isStreamFormat(format), true);
    assert.equal(getStreamFormat(format, 'MP4_H264'), format);
  }
});

test('rejects unsupported and invalid saved formats', () => {
  for (const value of ['MP4_AV1', 'unknown', '', null, undefined, 123, {}]) {
    assert.equal(isStreamFormat(value), false);
    assert.equal(getStreamFormat(value, 'MP4_H264'), 'MP4_H264');
  }
});

test('uses the requested initial format as the fallback', () => {
  assert.equal(getStreamFormat(null, 'JPEG'), 'JPEG');
});
