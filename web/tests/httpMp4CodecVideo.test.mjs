import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createServer } from 'vite';

let dom;
let server;
let testing;
let HttpMp4CodecVideo;

before(async () => {
  dom = new JSDOM('', { url: 'http://localhost' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.AbortController = dom.window.AbortController;
  testing = await import('@testing-library/react');
  server = await createServer({
    configFile: false,
    resolve: {
      alias: [
        {
          find: /^media-stream-library$/,
          replacement: 'media-stream-library/light'
        }
      ]
    },
    server: { middlewareMode: true }
  });
  ({ HttpMp4CodecVideo } = await server.ssrLoadModule(
    '/src/components/player/HttpMp4CodecVideo.tsx'
  ));
});

afterEach(() => testing?.cleanup());

after(async () => {
  await server?.close();
  dom?.window.close();
});

function player(props) {
  return createElement(HttpMp4CodecVideo, {
    host: 'localhost',
    videocodec: 'av1',
    play: true,
    refresh: 0,
    onPlaying() {},
    ...props
  });
}

test('reports a rejected initial fetch as a playback error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Connection failed');
  });
  t.mock.method(console, 'error', () => {});
  const onError = t.mock.fn();
  const onEnded = t.mock.fn();

  await testing.act(async () => {
    testing.render(player({ onError, onEnded }));
  });

  assert.equal(onError.mock.callCount(), 1);
  assert.equal(onEnded.mock.callCount(), 0);
});

test('reports a server close after playback but ignores a stream cancelled by refresh', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    const body = new ReadableStream({
      start(controller) {
        requests.push({ signal, controller });
        signal.addEventListener('abort', () => controller.error(signal.reason));
      }
    });
    return new Response(body, { headers: { 'Content-Type': 'video/mp4' } });
  });
  const onError = t.mock.fn();
  const onEnded = t.mock.fn();
  const view = testing.render(player({ onError, onEnded }));
  const video = view.container.querySelector('video');
  testing.fireEvent.playing(video);

  await testing.act(async () => {
    view.rerender(player({ onError, onEnded, refresh: 1 }));
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(onError.mock.callCount(), 0);
  assert.equal(onEnded.mock.callCount(), 0);

  testing.fireEvent.playing(video);
  await testing.act(async () => requests[1].controller.close());

  assert.equal(onEnded.mock.callCount(), 1);
  assert.equal(onError.mock.callCount(), 0);
});
