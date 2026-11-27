import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createVideoDimensionObserver;
let resizeObservers;
let mutationObservers;

class TestObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.disconnected = false;
  }

  observe(target, options) {
    this.targets.push({ target, options });
  }

  disconnect() {
    this.disconnected = true;
  }
}

const element = (tagName) => Object.assign(new EventTarget(), { tagName });

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ createVideoDimensionObserver } = await server.ssrLoadModule(
    '/src/components/player/native/videoDimensionObserver.ts'
  ));

  globalThis.ResizeObserver = class extends TestObserver {
    constructor(callback) {
      super(callback);
      resizeObservers.push(this);
    }
  };
  globalThis.MutationObserver = class extends TestObserver {
    constructor(callback) {
      super(callback);
      mutationObservers.push(this);
    }
  };
});

beforeEach(() => {
  resizeObservers = [];
  mutationObservers = [];
});

after(async () => {
  delete globalThis.ResizeObserver;
  delete globalThis.MutationObserver;
  await server?.close();
});

test('observes the container and media only once for the same elements', () => {
  const container = element('DIV');
  const video = element('VIDEO');
  let changes = 0;
  const observer = createVideoDimensionObserver(() => changes++);

  observer.observe(container, video);
  observer.observe(container, video);

  assert.equal(resizeObservers.length, 1);
  assert.deepEqual(
    resizeObservers[0].targets.map(({ target }) => target),
    [container, video]
  );
  resizeObservers[0].callback();
  video.dispatchEvent(new Event('loadedmetadata'));
  video.dispatchEvent(new Event('resize'));
  assert.equal(changes, 3);
  observer.disconnect();
});

test('replaces observers and ignores events from the previous media element', () => {
  const container = element('DIV');
  const video = element('VIDEO');
  const image = element('IMG');
  let changes = 0;
  const observer = createVideoDimensionObserver(() => changes++);

  observer.observe(container, video);
  observer.observe(container, image);

  assert.equal(resizeObservers[0].disconnected, true);
  resizeObservers[0].callback();
  video.dispatchEvent(new Event('loadedmetadata'));
  video.dispatchEvent(new Event('resize'));
  assert.equal(changes, 0);

  image.dispatchEvent(new Event('load'));
  resizeObservers[1].callback();
  assert.equal(changes, 2);
  observer.disconnect();
});

test('observes intrinsic canvas dimensions and cleans up on disconnect', () => {
  const container = element('DIV');
  const canvas = element('CANVAS');
  let changes = 0;
  const observer = createVideoDimensionObserver(() => changes++);

  observer.observe(container, canvas);
  assert.deepEqual(mutationObservers[0].targets, [
    {
      target: canvas,
      options: { attributes: true, attributeFilter: ['width', 'height'] }
    }
  ]);
  mutationObservers[0].callback();
  assert.equal(changes, 1);

  observer.disconnect();
  observer.disconnect();
  assert.equal(resizeObservers[0].disconnected, true);
  assert.equal(mutationObservers[0].disconnected, true);
  mutationObservers[0].callback();
  assert.equal(changes, 1);
});

test('disconnects when the media is removed and can observe a new element', () => {
  const container = element('DIV');
  const image = element('IMG');
  let changes = 0;
  const observer = createVideoDimensionObserver(() => changes++);

  observer.observe(container, image);
  observer.observe(container, null);
  assert.equal(resizeObservers[0].disconnected, true);
  image.dispatchEvent(new Event('load'));
  assert.equal(changes, 0);

  observer.observe(container, image);
  image.dispatchEvent(new Event('load'));
  assert.equal(changes, 1);
  observer.disconnect();
});

test('rebinds when the container changes even if the media stays the same', () => {
  const firstContainer = element('DIV');
  const secondContainer = element('DIV');
  const video = element('VIDEO');
  let changes = 0;
  const observer = createVideoDimensionObserver(() => changes++);

  observer.observe(firstContainer, video);
  observer.observe(secondContainer, video);

  assert.equal(resizeObservers[0].disconnected, true);
  assert.deepEqual(
    resizeObservers[1].targets.map(({ target }) => target),
    [secondContainer, video]
  );
  resizeObservers[0].callback();
  video.dispatchEvent(new Event('resize'));
  assert.equal(changes, 1);

  observer.disconnect();
  resizeObservers[1].callback();
  video.dispatchEvent(new Event('resize'));
  assert.equal(changes, 1);
});
