import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let getSupportedResolutions;
let getPlayableResolution;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ getSupportedResolutions, getPlayableResolution } =
    await server.ssrLoadModule(
      '/src/components/player/native/streamResolutions.ts'
    ));
});

after(async () => {
  await server?.close();
});

const parameters = {
  'root.Properties.Image.Resolution': '640x480,800x600',
  'root.Properties.Image.I0.Resolution': '1280x720,640x480',
  'root.Properties.Image.I0.AV1.Resolution': '1920x1080, 1280x720',
  'root.Properties.Image.I0.H264.Resolution': '3840x2160,1280x720',
  'root.Properties.Image.I0.JPEG.Resolution': '1600x1200',
  'root.Properties.Image.I1.AV1.Resolution': '640x360'
};

test('uses the selected codec and channel resolution list', () => {
  assert.deepEqual(getSupportedResolutions(parameters, 'MP4_AV1'), [
    '1920x1080',
    '1280x720'
  ]);
  for (const format of ['MP4_H264', 'RTP_H264']) {
    assert.deepEqual(getSupportedResolutions(parameters, format, '1'), [
      '3840x2160',
      '1280x720'
    ]);
  }
  for (const format of ['JPEG', 'MJPEG', 'RTP_JPEG']) {
    assert.deepEqual(getSupportedResolutions(parameters, format, '1'), [
      '1600x1200'
    ]);
  }
  assert.deepEqual(getSupportedResolutions(parameters, 'MP4_AV1', '2'), [
    '640x360'
  ]);
});

test('falls back to channel and device lists on older devices', () => {
  const older = {
    'root.Properties.Image.Resolution': '640x480,800x600',
    'root.Properties.Image.I0.Resolution': '1280x720,640x480'
  };
  assert.deepEqual(getSupportedResolutions(older, 'MP4_H264'), [
    '1280x720',
    '640x480'
  ]);
  assert.deepEqual(getSupportedResolutions(older, 'JPEG', '2'), [
    '640x480',
    '800x600'
  ]);
});

test('does not assume a channel index for special or invalid camera numbers', () => {
  for (const camera of ['quad', '0', '-1', '1.5', 'invalid']) {
    assert.deepEqual(getSupportedResolutions(parameters, 'MP4_AV1', camera), [
      '640x480',
      '800x600'
    ]);
  }
});

test('distinguishes missing capabilities from an empty reported list', () => {
  assert.equal(getSupportedResolutions(null, 'MP4_AV1'), undefined);
  assert.equal(getSupportedResolutions({}, 'MP4_AV1'), undefined);
  assert.deepEqual(
    getSupportedResolutions(
      { ...parameters, 'root.Properties.Image.I0.AV1.Resolution': '' },
      'MP4_AV1'
    ),
    []
  );
});

test('uses the device default only when the requested resolution is excluded', () => {
  const requested = '3840x2160';
  const h264 = getSupportedResolutions(parameters, 'MP4_H264');
  const av1 = getSupportedResolutions(parameters, 'MP4_AV1');
  assert.equal(getPlayableResolution(requested, h264), requested);
  assert.equal(getPlayableResolution(requested, av1), undefined);
  assert.equal(getPlayableResolution(requested, h264), requested);
  assert.equal(getPlayableResolution(requested, undefined), requested);
  assert.equal(getPlayableResolution(requested, []), undefined);
  assert.equal(getPlayableResolution(undefined, av1), undefined);
  assert.equal(getPlayableResolution('', av1), undefined);
});
