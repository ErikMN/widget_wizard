import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let calculateVideoDimensions;
let dimensionsEqual;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ calculateVideoDimensions, dimensionsEqual } = await server.ssrLoadModule(
    '/src/components/player/native/videoDimensions.ts'
  ));
});

after(async () => {
  await server?.close();
});

const container = { left: 100, top: 200 };
const rect = (width, height) => ({ left: 120, top: 230, width, height });

test('keeps the element size when its aspect ratio matches the stream', () => {
  const actual = calculateVideoDimensions(1920, 1080, rect(960, 540), container);
  assert.deepEqual(actual, {
    videoWidth: 1920,
    videoHeight: 1080,
    pixelWidth: 960,
    pixelHeight: 540,
    offsetX: 20,
    offsetY: 30
  });
});

test('excludes horizontal black bars from the overlay area', () => {
  const actual = calculateVideoDimensions(1920, 1080, rect(960, 720), container);
  assert.deepEqual(actual, {
    videoWidth: 1920,
    videoHeight: 1080,
    pixelWidth: 960,
    pixelHeight: 540,
    offsetX: 20,
    offsetY: 120
  });
});

test('excludes vertical black bars from the overlay area', () => {
  const actual = calculateVideoDimensions(1080, 1920, rect(800, 640), container);
  assert.deepEqual(actual, {
    videoWidth: 1080,
    videoHeight: 1920,
    pixelWidth: 360,
    pixelHeight: 640,
    offsetX: 240,
    offsetY: 30
  });
});

test('retains the element bounds before stream dimensions are available', () => {
  const actual = calculateVideoDimensions(0, 0, rect(960, 540), container);
  assert.deepEqual(actual, {
    videoWidth: 0,
    videoHeight: 0,
    pixelWidth: 960,
    pixelHeight: 540,
    offsetX: 20,
    offsetY: 30
  });
});

test('retains zero-sized element bounds without dividing by zero', () => {
  const actual = calculateVideoDimensions(1920, 1080, rect(0, 0), container);
  assert.deepEqual(actual, {
    videoWidth: 1920,
    videoHeight: 1080,
    pixelWidth: 0,
    pixelHeight: 0,
    offsetX: 20,
    offsetY: 30
  });
});

test('ignores small layout changes but detects stream resolution changes', () => {
  const actual = calculateVideoDimensions(1920, 1080, rect(960, 540), container);
  assert.equal(dimensionsEqual(actual, { ...actual, offsetX: 20.25 }), true);
  assert.equal(dimensionsEqual(actual, { ...actual, offsetX: 20.5 }), false);
  assert.equal(dimensionsEqual(actual, { ...actual, videoWidth: 1921 }), false);
});
