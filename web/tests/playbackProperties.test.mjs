import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom;
let server;
let testing;
let usePlaybackProperties;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost'
  });

  for (const key of [
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
    'Event',
    'MouseEvent',
    'navigator'
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? dom.window : dom.window[key]
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  testing = await import('@testing-library/react');
  ({ usePlaybackProperties } = await server.ssrLoadModule(
    '/src/components/player/native/usePlaybackProperties.ts'
  ));
});

afterEach(() => {
  testing?.cleanup();
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const key of [
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
    'Event',
    'MouseEvent',
    'navigator',
    'IS_REACT_ACT_ENVIRONMENT'
  ]) {
    delete globalThis[key];
  }
});

test('stream replacement invalidates old properties but preserves aspect ratio', () => {
  const first = {};
  const second = {};
  const { result, rerender } = testing.renderHook(
    (request) => usePlaybackProperties(request),
    { initialProps: first }
  );
  const video = { width: 1920, height: 1080, volume: 0.5, el: {} };

  testing.act(() => result.current.onPlaying(video));
  assert.equal(result.current.videoProperties, video);
  assert.equal(result.current.volume, 0.5);
  const reportOldStream = result.current.onPlaying;

  rerender(second);
  assert.equal(result.current.videoProperties, undefined);
  assert.equal(result.current.volume, undefined);
  assert.equal(result.current.naturalAspectRatio, 1920 / 1080);

  testing.act(() => reportOldStream(video));
  assert.equal(result.current.videoProperties, undefined);

  const image = { width: 1920, height: 1080, el: {} };
  testing.act(() => result.current.onPlaying(image));
  assert.equal(result.current.videoProperties, image);
  assert.equal(result.current.volume, undefined);

  testing.act(() => reportOldStream(video));
  assert.equal(result.current.videoProperties, image);
  assert.equal(result.current.volume, undefined);
});

test('stop invalidates properties and a restart reports the new geometry', () => {
  const { result, rerender } = testing.renderHook(
    (request) => usePlaybackProperties(request),
    { initialProps: {} }
  );
  testing.act(() =>
    result.current.onPlaying({ width: 1920, height: 1080, volume: 0.5 })
  );
  testing.act(() => result.current.setVolume(0.25));
  assert.equal(result.current.volume, 0.25);

  const reportStoppedStream = result.current.onPlaying;
  rerender(undefined);
  testing.act(() =>
    reportStoppedStream({ width: 640, height: 480, volume: 1 })
  );
  assert.equal(result.current.videoProperties, undefined);
  assert.equal(result.current.volume, undefined);
  assert.equal(result.current.naturalAspectRatio, 1920 / 1080);

  rerender({});
  const next = { width: 1080, height: 1920, volume: 0.75 };
  testing.act(() => result.current.onPlaying(next));
  assert.equal(result.current.videoProperties, next);
  assert.equal(result.current.volume, 0.75);
  assert.equal(result.current.naturalAspectRatio, 1080 / 1920);
});
