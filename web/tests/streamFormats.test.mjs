import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let getStreamFormat;
let isStreamFormat;
let getAvailableStreamFormats;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ getStreamFormat, isStreamFormat, getAvailableStreamFormats } =
    await server.ssrLoadModule(
      '/src/components/player/native/types.ts'
    ));
});

after(async () => {
  await server?.close();
});

const supported = { isTypeSupported: () => true };
const unsupported = { isTypeSupported: () => false };
const originalFormats = ['MP4_H264', 'RTP_H264', 'RTP_JPEG', 'MJPEG', 'JPEG'];

test('preserves all previously saved stream formats', () => {
  for (const format of originalFormats) {
    assert.equal(isStreamFormat(format), true);
    assert.equal(getStreamFormat(format, 'MP4_H264', originalFormats), format);
  }
});

test('rejects unsupported and invalid saved formats', () => {
  for (const value of ['unknown', '', null, undefined, 123, {}]) {
    assert.equal(isStreamFormat(value), false);
    assert.equal(getStreamFormat(value, 'MP4_H264', originalFormats), 'MP4_H264');
  }
});

test('uses the requested initial format as the fallback', () => {
  assert.equal(getStreamFormat(null, 'JPEG', originalFormats), 'JPEG');
});

test('requires advertised AV1 and browser MP4 support', () => {
  const checked = [];
  const mediaSource = {
    isTypeSupported(mime) {
      checked.push(mime);
      return true;
    }
  };
  for (const formats of [undefined, '', 'h264,jpeg', 'h264,av10']) {
    assert.deepEqual(
      getAvailableStreamFormats(formats, mediaSource),
      originalFormats
    );
  }
  assert.deepEqual(checked, []);
  assert.deepEqual(
    getAvailableStreamFormats('h264, AV1 ,jpeg', mediaSource),
    ['MP4_H264', 'MP4_AV1', 'RTP_H264', 'RTP_JPEG', 'MJPEG', 'JPEG']
  );
  assert.deepEqual(checked, ['video/mp4; codecs="av01.0.08M.08"']);
  assert.deepEqual(
    getAvailableStreamFormats('h264,av1', unsupported),
    originalFormats
  );
});

test('restores a saved AV1 selection when capabilities become available', () => {
  const saved = 'MP4_AV1';
  const available = getAvailableStreamFormats('h264,av1', supported);
  assert.equal(isStreamFormat(saved), true);
  assert.equal(getStreamFormat(saved, 'MP4_H264', originalFormats), 'MP4_H264');
  assert.equal(getStreamFormat(saved, 'MP4_H264', available), saved);
  assert.equal(getStreamFormat(saved, 'MP4_H264', originalFormats), 'MP4_H264');
  assert.equal(getStreamFormat(saved, 'MP4_AV1', originalFormats), 'MP4_H264');
});

test('does not offer AV1 without MediaSource', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'MediaSource');
  try {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      value: undefined
    });
    assert.deepEqual(getAvailableStreamFormats('av1,h264'), originalFormats);
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'MediaSource', previous);
    } else {
      delete globalThis.MediaSource;
    }
  }
});
