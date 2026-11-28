import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom;
let server;
let React;
let testing;
let PlaybackArea;

const legacyModule = `
import React from 'react';

export const Format = {
  MP4_H264: 'MP4_H264',
  RTP_H264: 'RTP_H264',
  RTP_JPEG: 'RTP_JPEG'
};

export const PlaybackArea = (props) => {
  globalThis.__legacyPlaybackProps = props;
  const tag = props.format === Format.RTP_JPEG ? 'canvas' : 'video';
  return React.createElement(tag, { ref: props.forwardedRef });
};
`;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://camera'
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
    server: { middlewareMode: true },
    /* Keep the legacy player import inside Vite so the test mock can resolve it. */
    ssr: { noExternal: ['media-stream-player'] },
    plugins: [
      {
        name: 'playback-area-test',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'media-stream-player') {
            return '\0playback-area-test:legacy';
          }
        },
        load(id) {
          if (id === '\0playback-area-test:legacy') {
            return legacyModule;
          }
        }
      }
    ]
  });
  React = await import('react');
  testing = await import('@testing-library/react');
  ({ PlaybackArea } = await server.ssrLoadModule(
    '/src/components/player/native/PlaybackArea.tsx'
  ));
});

afterEach(() => {
  testing?.cleanup();
  delete globalThis.__legacyPlaybackProps;
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

function mount(format) {
  const ref = React.createRef();
  const onPlaying = () => {};
  const onEnded = () => {};
  const props = {
    ref,
    request: {
      play: true,
      host: 'camera',
      format,
      parameters: { camera: '2' },
      refresh: 0
    },
    offset: 5,
    autoRetry: true,
    onPlaying,
    onEnded
  };
  const view = testing.render(React.createElement(PlaybackArea, props));

  return {
    ref,
    props,
    view,
    rerender(changes) {
      view.rerender(React.createElement(PlaybackArea, { ...props, ...changes }));
    }
  };
}

test('selects native JPEG and MJPEG playback and forwards the media ref', () => {
  const current = mount('JPEG');
  const first = current.ref.current;
  assert.equal(first.tagName, 'IMG');
  assert.equal(new URL(first.src).pathname, '/axis-cgi/jpg/image.cgi');
  assert.equal(new URL(first.src).protocol, 'https:');
  assert.equal(new URL(first.src).searchParams.get('camera'), '2');
  assert.equal(globalThis.__legacyPlaybackProps, undefined);

  current.rerender({
    request: { ...current.props.request, format: 'MJPEG', secure: false }
  });

  const next = current.ref.current;
  assert.notEqual(next, first);
  assert.equal(next.tagName, 'IMG');
  assert.equal(first.hasAttribute('src'), false);
  assert.equal(new URL(next.src).pathname, '/mjpg/video.mjpg');
  assert.equal(new URL(next.src).protocol, 'http:');
  assert.equal(globalThis.__legacyPlaybackProps, undefined);
});

test('replaces refreshed images and releases the source when stopped', () => {
  const current = mount('MJPEG');
  const first = current.ref.current;
  const request = { ...current.props.request, refresh: 1 };
  current.rerender({ request });

  const refreshed = current.ref.current;
  assert.notEqual(refreshed, first);
  assert.equal(first.hasAttribute('src'), false);
  assert.equal(new URL(refreshed.src).searchParams.get('timestamp'), '1');

  current.rerender({ request: { ...request, play: false } });
  assert.equal(refreshed.hasAttribute('src'), false);
  assert.equal(current.ref.current.hasAttribute('src'), false);

  current.rerender({ request });
  assert.ok(current.ref.current.hasAttribute('src'));
  const restarted = current.ref.current;
  current.view.unmount();
  assert.equal(restarted.hasAttribute('src'), false);
  assert.equal(current.ref.current, null);
});

test('forwards the remaining formats and playback options to the legacy area', () => {
  const current = mount('MP4_H264');

  for (const [format, tag] of [
    ['MP4_H264', 'VIDEO'],
    ['RTP_H264', 'VIDEO'],
    ['RTP_JPEG', 'CANVAS']
  ]) {
    const request = { ...current.props.request, format, secure: true };
    current.rerender({ request });

    const legacy = globalThis.__legacyPlaybackProps;
    assert.equal(current.ref.current.tagName, tag);
    assert.equal(legacy.forwardedRef, current.ref);
    assert.equal(legacy.format, format);
    assert.equal(legacy.host, request.host);
    assert.equal(legacy.parameters, request.parameters);
    assert.equal(legacy.refresh, request.refresh);
    assert.equal(legacy.secure, true);
    assert.equal(legacy.play, true);
    assert.equal(legacy.offset, 5);
    assert.equal(legacy.autoRetry, true);
    assert.equal(legacy.onPlaying, current.props.onPlaying);
    assert.equal(legacy.onEnded, current.props.onEnded);
  }

  const previous = current.ref.current;
  current.rerender({
    request: { ...current.props.request, format: 'RTP_JPEG', refresh: 1 }
  });
  assert.notEqual(current.ref.current, previous);
});

test('keeps the media reference current when switching between implementations', () => {
  const current = mount('RTP_H264');
  assert.equal(current.ref.current.tagName, 'VIDEO');

  current.rerender({
    request: { ...current.props.request, format: 'JPEG' }
  });
  const image = current.ref.current;
  assert.equal(image.tagName, 'IMG');

  current.rerender({
    request: { ...current.props.request, format: 'RTP_JPEG' }
  });
  assert.equal(image.hasAttribute('src'), false);
  assert.equal(current.ref.current.tagName, 'CANVAS');
});
