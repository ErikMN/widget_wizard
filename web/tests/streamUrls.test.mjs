import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let getStreamUrls;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ getStreamUrls } = await server.ssrLoadModule(
    '/src/components/player/native/streamUrls.ts'
  ));
});

after(async () => {
  await server?.close();
});

test('builds the still image and motion JPEG endpoints', () => {
  assert.deepEqual(getStreamUrls('camera:8080', false, 'JPEG', {}, 2), {
    transport: 'http',
    url: 'http://camera:8080/axis-cgi/jpg/image.cgi?timestamp=2'
  });
  assert.deepEqual(getStreamUrls('camera', true, 'MJPEG', { fps: '10' }, 3), {
    transport: 'http',
    url: 'https://camera/mjpg/video.mjpg?fps=10&timestamp=3'
  });
});

test('selects H.264 in an MP4 container and preserves other parameters', () => {
  const parameters = Object.freeze({
    videocodec: 'av1',
    container: 'matroska',
    camera: '2',
    audio: '1',
    resolution: '1920x1080',
    timestamp: 'old'
  });
  const stream = getStreamUrls('camera', true, 'MP4_H264', parameters, 4);
  assert.equal(stream.transport, 'http');
  const url = new URL(stream.url);
  assert.equal(url.pathname, '/axis-cgi/media.cgi');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    ...parameters,
    videocodec: 'h264',
    container: 'mp4',
    timestamp: '4'
  });
});

test('builds secure RTSP, WebSocket and session token URLs', () => {
  assert.deepEqual(getStreamUrls('camera:8443', true, 'RTP_H264', {}, 0), {
    transport: 'rtsp',
    url: 'rtsp://camera:8443/axis-media/media.amp?timestamp=0&videocodec=h264',
    websocketUrl: 'wss://camera:8443/rtsp-over-websocket',
    tokenUrl: 'https://camera:8443/axis-cgi/rtspwssession.cgi'
  });
});

test('builds insecure RTP JPEG URLs and retains the requested port', () => {
  assert.deepEqual(getStreamUrls('camera:8080', false, 'RTP_JPEG', {}, 1), {
    transport: 'rtsp',
    url: 'rtsp://camera:8080/axis-media/media.amp?timestamp=1&videocodec=jpeg',
    websocketUrl: 'ws://camera:8080/rtsp-over-websocket',
    tokenUrl: 'http://camera:8080/axis-cgi/rtspwssession.cgi'
  });
});

test('encodes names and values without dropping unfamiliar parameters', () => {
  const stream = getStreamUrls(
    'camera',
    true,
    'JPEG',
    { 'custom&key': 'A B+C&å', compression: '0' },
    5
  );
  assert.equal(
    stream.url,
    'https://camera/axis-cgi/jpg/image.cgi?custom%26key=A%20B%2BC%26%C3%A5&compression=0&timestamp=5'
  );
});

test('returns no stream URL when playback has no host', () => {
  for (const format of ['JPEG', 'MJPEG', 'MP4_H264', 'RTP_H264', 'RTP_JPEG']) {
    assert.equal(getStreamUrls('', true, format, {}, 0), undefined);
  }
});

test('preserves IPv6 hosts and nonstandard ports', () => {
  const stream = getStreamUrls('[2001:db8::1]:8443', true, 'RTP_JPEG', {}, 0);
  assert.equal(
    stream.websocketUrl,
    'wss://[2001:db8::1]:8443/rtsp-over-websocket'
  );
  assert.equal(
    stream.tokenUrl,
    'https://[2001:db8::1]:8443/axis-cgi/rtspwssession.cgi'
  );
});
