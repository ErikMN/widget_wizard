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
  RTP_H264: 'RTP_H264',
  RTP_JPEG: 'RTP_JPEG'
};

export const PlaybackArea = (props) => {
  globalThis.__legacyPlaybackProps = props;
  const tag = props.format === Format.RTP_JPEG ? 'canvas' : 'video';
  return React.createElement(tag, { ref: props.forwardedRef });
};
`;

const mp4Module = `
export const startHttpMp4Stream = (video, src, onEnded) => {
  const stream = { video, src, onEnded, stopped: false };
  globalThis.__mp4Playback = stream;
  return () => { stream.stopped = true; };
};
`;

const jpegModule = `
export const startJpegStream = (canvas, urls, offset, onPlaying, onEnded) => {
  const stream = { canvas, urls, offset, onPlaying, onEnded, stopped: false };
  globalThis.__jpegPlayback = stream;
  return () => { stream.stopped = true; };
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
          if (id === './httpMp4Stream') {
            return '\0playback-area-test:mp4';
          }
          if (id === './rtsp/jpeg/jpegStream') {
            return '\0playback-area-test:jpeg';
          }
        },
        load(id) {
          if (id === '\0playback-area-test:legacy') {
            return legacyModule;
          }
          if (id === '\0playback-area-test:mp4') {
            return mp4Module;
          }
          if (id === '\0playback-area-test:jpeg') {
            return jpegModule;
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
  delete globalThis.__mp4Playback;
  delete globalThis.__jpegPlayback;
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
  const reports = [];
  const onPlaying = (properties) => reports.push(properties);
  const onEnded = () => {};
  const props = {
    ref,
    request: {
      play: true,
      host: 'camera',
      format,
      parameters: { camera: '2' },
      refresh: 0,
      offset: 5
    },
    autoRetry: true,
    onPlaying,
    onEnded
  };
  const view = testing.render(React.createElement(PlaybackArea, props));

  return {
    ref,
    props,
    view,
    reports,
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

test('forwards RTSP H.264 playback options to the legacy area', () => {
  const current = mount('RTP_H264');
  const request = { ...current.props.request, secure: true };
  current.rerender({ request });

  const legacy = globalThis.__legacyPlaybackProps;
  assert.equal(current.ref.current.tagName, 'VIDEO');
  assert.equal(legacy.forwardedRef, current.ref);
  assert.equal(legacy.format, 'RTP_H264');
  assert.equal(legacy.host, request.host);
  assert.equal(legacy.parameters, request.parameters);
  assert.equal(legacy.refresh, request.refresh);
  assert.equal(legacy.secure, true);
  assert.equal(legacy.play, true);
  assert.equal(legacy.offset, 5);
  assert.equal(legacy.autoRetry, true);
  assert.equal(typeof legacy.onPlaying, 'function');
  assert.equal(legacy.onEnded, current.props.onEnded);

  const previous = current.ref.current;
  current.rerender({ request: { ...request, refresh: 1 } });
  assert.notEqual(current.ref.current, previous);
});

test('selects native RTP JPEG and owns one session per playback request', () => {
  const current = mount('RTP_JPEG');
  const first = globalThis.__jpegPlayback;
  assert.equal(first.canvas, current.ref.current);
  assert.equal(first.canvas.tagName, 'CANVAS');
  assert.equal(first.offset, 5);
  assert.equal(first.urls.websocketUrl, 'wss://camera/rtsp-over-websocket');
  assert.equal(first.urls.tokenUrl, 'https://camera/axis-cgi/rtspwssession.cgi');
  const url = new URL(first.urls.url);
  assert.equal(url.pathname, '/axis-media/media.amp');
  assert.equal(url.searchParams.get('videocodec'), 'jpeg');
  assert.equal(url.searchParams.get('camera'), '2');
  assert.equal(globalThis.__legacyPlaybackProps, undefined);

  current.rerender({ request: { ...current.props.request } });
  assert.equal(globalThis.__jpegPlayback, first);
  assert.equal(first.stopped, false);
  first.onPlaying({ el: first.canvas, width: 640, height: 480 });
  assert.deepEqual(current.reports, [{ el: first.canvas, width: 640, height: 480 }]);

  const request = { ...current.props.request, refresh: 1, offset: 10, secure: false };
  current.rerender({ request });
  const next = globalThis.__jpegPlayback;
  assert.equal(first.stopped, true);
  assert.notEqual(next.canvas, first.canvas);
  assert.equal(next.canvas, current.ref.current);
  assert.equal(next.offset, 10);
  assert.equal(next.urls.websocketUrl, 'ws://camera/rtsp-over-websocket');
  assert.equal(new URL(next.urls.url).searchParams.get('timestamp'), '1');

  current.rerender({ request: { ...request, play: false } });
  assert.equal(next.stopped, true);
  assert.equal(globalThis.__jpegPlayback, next);

  current.rerender({ request });
  const restarted = globalThis.__jpegPlayback;
  assert.notEqual(restarted, next);
  current.view.unmount();
  assert.equal(restarted.stopped, true);
  assert.equal(current.ref.current, null);
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
  const jpeg = globalThis.__jpegPlayback;
  assert.equal(jpeg.canvas, current.ref.current);

  current.rerender({ request: current.props.request });
  assert.equal(jpeg.stopped, true);
  assert.equal(current.ref.current.tagName, 'VIDEO');
  assert.equal(globalThis.__legacyPlaybackProps.format, 'RTP_H264');
});

test('selects native HTTP MP4 playback and cleans up replaced requests', () => {
  const current = mount('MP4_H264');
  const first = globalThis.__mp4Playback;
  assert.equal(current.ref.current, first.video);
  assert.equal(first.video.tagName, 'VIDEO');
  assert.equal(first.onEnded, current.props.onEnded);
  const url = new URL(first.src);
  assert.equal(url.pathname, '/axis-cgi/media.cgi');
  assert.equal(url.searchParams.get('videocodec'), 'h264');
  assert.equal(url.searchParams.get('container'), 'mp4');
  assert.equal(globalThis.__legacyPlaybackProps, undefined);

  current.rerender({
    request: { ...current.props.request, refresh: 1 }
  });
  const next = globalThis.__mp4Playback;
  assert.equal(first.stopped, true);
  assert.notEqual(first.video, next.video);
  assert.equal(current.ref.current, next.video);

  current.rerender({
    request: { ...current.props.request, format: 'RTP_H264' }
  });
  assert.equal(next.stopped, true);
  assert.equal(current.ref.current.tagName, 'VIDEO');
  assert.equal(globalThis.__legacyPlaybackProps.format, 'RTP_H264');
});

test('replaces the legacy RTSP component when seeking', () => {
  const current = mount('RTP_H264');
  const previous = current.ref.current;
  current.rerender({
    request: { ...current.props.request, offset: 10 }
  });
  assert.notEqual(current.ref.current, previous);
  assert.equal(globalThis.__legacyPlaybackProps.offset, 10);
});

test('reports a native image failure without requesting a retry', () => {
  const current = mount('MJPEG');
  const reports = [];
  current.rerender({ onEnded: (retry) => reports.push(retry) });
  const image = current.ref.current;

  testing.act(() => image.dispatchEvent(new window.Event('error')));
  testing.act(() => image.dispatchEvent(new window.Event('error')));
  assert.equal(image.hasAttribute('src'), false);
  assert.deepEqual(reports, [false]);
});

test('switches between H.264 and AV1 using the native HTTP MP4 component', () => {
  const current = mount('MP4_H264');
  const first = globalThis.__mp4Playback;
  current.rerender({
    request: { ...current.props.request, format: 'MP4_AV1' }
  });

  const av1 = globalThis.__mp4Playback;
  assert.equal(first.stopped, true);
  assert.equal(current.ref.current, av1.video);
  assert.equal(new URL(av1.src).searchParams.get('videocodec'), 'av1');
  assert.equal(new URL(av1.src).searchParams.get('container'), 'mp4');
  assert.equal(globalThis.__legacyPlaybackProps, undefined);

  current.rerender({ request: current.props.request });
  assert.equal(av1.stopped, true);
  assert.equal(
    new URL(globalThis.__mp4Playback.src).searchParams.get('videocodec'),
    'h264'
  );
});

test('adapts legacy playback reports before forwarding them', () => {
  const current = mount('RTP_H264');
  const video = current.ref.current;
  const pipeline = { currentTime: 2 };
  const legacy = globalThis.__legacyPlaybackProps;
  legacy.onPlaying({
    el: video,
    width: 1920,
    height: 1080,
    volume: 0,
    pipeline,
    range: [8, 19],
    formatSupportsAudio: true
  });

  const [report] = current.reports;
  assert.equal(report.el, video);
  assert.equal(report.width, 1920);
  assert.equal(report.height, 1080);
  assert.equal(report.volume, 0);
  assert.equal(report.timeline.start, 8);
  assert.equal(report.timeline.end, 19);
  assert.equal(report.timeline.readCurrentTime(), 2);
  assert.equal('pipeline' in report, false);
  assert.equal('formatSupportsAudio' in report, false);
});

test('native image and MP4 components report the same basic properties', () => {
  for (const [format, width, height, event] of [
    ['JPEG', 'naturalWidth', 'naturalHeight', 'load'],
    ['MJPEG', 'naturalWidth', 'naturalHeight', 'load'],
    ['MP4_H264', 'videoWidth', 'videoHeight', 'playing'],
    ['MP4_AV1', 'videoWidth', 'videoHeight', 'playing']
  ]) {
    const current = mount(format);
    const media = current.ref.current;
    Object.defineProperties(media, {
      [width]: { value: 1280 },
      [height]: { value: 720 }
    });

    testing.act(() => media.dispatchEvent(new window.Event(event)));
    assert.deepEqual(current.reports, [
      { el: media, width: 1280, height: 720 }
    ]);
    current.view.unmount();
  }
});
