import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createJpegCanvasRenderer;
let startJpegStream;
let RtspParser;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ createJpegCanvasRenderer } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/jpeg/jpegCanvas.ts'
  ));
  ({ startJpegStream } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/jpeg/jpegStream.ts'
  ));
  ({ RtspParser } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtspMessage.ts'
  ));
});

after(async () => {
  await server?.close();
});

const original = new Map(
  ['createImageBitmap', 'Image', 'WebSocket'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name)
  ])
);
const decodes = [];
const stops = [];
const sockets = [];

beforeEach(() => {
  decodes.length = 0;
  sockets.length = 0;
  stops.length = 0;
  globalThis.createImageBitmap = (blob) =>
    new Promise((resolve, reject) => decodes.push({ blob, resolve, reject }));
});

afterEach(() => {
  for (const stop of stops) {
    stop();
  }
  for (const [name, descriptor] of original) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  }
});

const nextTask = () => new Promise((resolve) => setImmediate(resolve));
const bytes = (...values) => Uint8Array.of(...values);
const useClock = (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
};
const frame = (timestamp, value = 1, ssrc = 1) => ({
  width: 32,
  height: 16,
  timestamp,
  ssrc,
  typeSpecific: 0,
  data: bytes(value)
});
const bitmap = (width = 32, height = 16) => ({
  width,
  height,
  closed: 0,
  close() {
    this.closed++;
  }
});
const createCanvas = () => {
  const drawings = [];
  const contexts = [];
  const canvas = {
    width: 300,
    height: 150,
    getContext(name) {
      contexts.push(name);
      if (name === 'bitmaprenderer') {
        return { transferFromImageBitmap: (image) => drawings.push(image) };
      }
      if (name === '2d') {
        return { drawImage: (image) => drawings.push(image) };
      }
      return null;
    }
  };
  return { canvas, drawings, contexts };
};
const setupRenderer = (surface = createCanvas(), live = true) => {
  const reports = [];
  const errors = [];
  const renderer = createJpegCanvasRenderer(
    surface.canvas,
    90000,
    (width, height) => reports.push({ width, height }),
    (error) => errors.push(error),
    live
  );
  stops.push(renderer.stop);
  return { ...surface, renderer, reports, errors };
};
const resolveDecode = async (index, image = bitmap()) => {
  decodes[index].resolve(image);
  await nextTask();
  assert.equal(image.closed, 1);
  return image;
};

test('presents decoded dimensions at RTP times across timestamp wraparound', async (t) => {
  useClock(t);
  const { renderer, reports, canvas, contexts, drawings } = setupRenderer();
  renderer.push(frame(0xffffff00));
  renderer.push(frame((0xffffff00 + 9000) >>> 0));
  assert.equal(decodes.length, 1);
  assert.deepEqual(reports, []);
  const first = await resolveDecode(0, bitmap(640, 480));
  assert.deepEqual(drawings, [first]);
  assert.deepEqual(reports, [{ width: 640, height: 480 }]);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 480);
  assert.deepEqual(contexts, ['bitmaprenderer']);
  t.mock.timers.tick(99);
  assert.equal(decodes.length, 1);
  t.mock.timers.tick(1);
  assert.equal(decodes.length, 2);
  await resolveDecode(1, bitmap(1280, 720));
  assert.deepEqual(reports[1], { width: 1280, height: 720 });
});

test('decodes one image at a time and skips older due images', async (t) => {
  useClock(t);
  const { renderer, drawings } = setupRenderer();
  renderer.push(frame(0, 1));
  for (let i = 1; i <= 3; i++) {
    t.mock.timers.tick(10);
    renderer.push(frame(i * 900, i + 1));
  }
  renderer.push(frame(9000, 5));
  assert.equal(decodes.length, 1);
  await resolveDecode(0);
  assert.equal(decodes.length, 2);
  assert.deepEqual(new Uint8Array(await decodes[1].blob.arrayBuffer()), bytes(4));
  await resolveDecode(1);
  t.mock.timers.tick(69);
  assert.equal(decodes.length, 2);
  t.mock.timers.tick(1);
  assert.equal(decodes.length, 3);
  await resolveDecode(2);
  assert.equal(drawings.length, 3);
});

test('finishes queued images before notifying the end of a finite stream', async (t) => {
  useClock(t);
  const { renderer, drawings } = setupRenderer();
  let finished = 0;
  renderer.push(frame(0));
  renderer.push(frame(9000));
  renderer.finish(() => finished++);
  renderer.push(frame(18000));
  await resolveDecode(0);
  assert.equal(finished, 0);
  t.mock.timers.tick(100);
  await resolveDecode(1);
  assert.equal(finished, 1);
  assert.equal(drawings.length, 2);
  t.mock.timers.tick(100);
  assert.equal(decodes.length, 2);
  renderer.finish(() => finished++);
  assert.equal(finished, 1);
});

test('stopping cancels future images and suppresses a pending decode', async (t) => {
  useClock(t);
  const { renderer, drawings, reports } = setupRenderer();
  let finished = 0;
  renderer.push(frame(0));
  renderer.push(frame(9000));
  renderer.finish(() => finished++);
  renderer.stop();
  renderer.stop();
  await resolveDecode(0);
  t.mock.timers.tick(1000);
  assert.equal(decodes.length, 1);
  assert.equal(drawings.length, 0);
  assert.equal(reports.length, 0);
  assert.equal(finished, 0);
});

test('a new source invalidates unfinished images and resets presentation time', async (t) => {
  useClock(t);
  const { renderer, drawings } = setupRenderer();
  renderer.push(frame(100000));
  renderer.push(frame(109000));
  renderer.push(frame(0, 2, 2));
  renderer.push(frame(9000, 3, 2));
  await resolveDecode(0);
  assert.equal(drawings.length, 0);
  assert.equal(decodes.length, 2);
  assert.deepEqual(new Uint8Array(await decodes[1].blob.arrayBuffer()), bytes(2));
  await resolveDecode(1);
  t.mock.timers.tick(100);
  await resolveDecode(2);
  assert.equal(drawings.length, 2);
});

test('a rejected JPEG decode does not prevent the next image from drawing', async (t) => {
  useClock(t);
  const { renderer, drawings, errors } = setupRenderer();
  renderer.push(frame(0));
  renderer.push(frame(900));
  decodes[0].reject(new Error('invalid JPEG'));
  await nextTask();
  t.mock.timers.tick(10);
  await resolveDecode(1);
  assert.equal(drawings.length, 1);
  assert.deepEqual(errors, []);
});

test('a drawing failure releases the bitmap and reports one terminal error', async (t) => {
  useClock(t);
  const surface = createCanvas();
  const error = new Error('canvas failed');
  surface.canvas.getContext = () => ({
    transferFromImageBitmap() {
      throw error;
    }
  });
  const { renderer, errors, reports } = setupRenderer(surface);
  renderer.push(frame(0));
  renderer.push(frame(9000));
  await resolveDecode(0);
  t.mock.timers.tick(100);
  assert.deepEqual(errors, [error]);
  assert.deepEqual(reports, []);
  assert.equal(decodes.length, 1);
});

test('bounds the number and size of images waiting for presentation', async (t) => {
  useClock(t);
  const first = setupRenderer(createCanvas(), false);
  first.renderer.push(frame(0));
  for (let i = 1; i <= 120; i++) {
    first.renderer.push(frame(i * 9000));
  }
  assert.deepEqual(first.errors, []);
  first.renderer.push(frame(121 * 9000));
  assert.match(first.errors[0].message, /queue exceeded/);
  await resolveDecode(0);
  assert.equal(first.drawings.length, 0);
  const second = setupRenderer();
  second.renderer.push({ ...frame(0), data: new Uint8Array(32 * 1024 * 1024 + 1) });
  assert.match(second.errors[0].message, /queue exceeded/);
  assert.equal(decodes.length, 1);
});

test('image fallback revokes object URLs on load, error and cancellation', async (t) => {
  useClock(t);
  delete globalThis.createImageBitmap;
  const images = [];
  const revoked = [];
  globalThis.Image = class {
    naturalWidth = 640;
    naturalHeight = 480;
    constructor() {
      images.push(this);
    }
    removeAttribute(name) {
      delete this[name];
    }
  };
  t.mock.method(URL, 'createObjectURL', () => `blob:image-${images.length}`);
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  const { renderer, drawings, reports, contexts } = setupRenderer();
  renderer.push(frame(0));
  images[0].onload();
  await nextTask();
  assert.deepEqual(contexts, ['2d']);
  assert.deepEqual(reports, [{ width: 640, height: 480 }]);
  assert.equal(images[0].src, undefined);
  assert.equal(images[0].onload, null);
  assert.deepEqual(revoked, ['blob:image-1']);
  t.mock.timers.tick(10);
  renderer.push(frame(900));
  images[1].onerror();
  await nextTask();
  t.mock.timers.tick(10);
  renderer.push(frame(1800));
  const staleLoad = images[2].onload;
  renderer.stop();
  staleLoad();
  await nextTask();
  assert.deepEqual(revoked, ['blob:image-1', 'blob:image-2', 'blob:image-3']);
  assert.equal(drawings.length, 1);
});

/* Exercise the actual session, framing and JPEG assembler with a simulated device. */
const urls = {
  url: 'rtsp://camera/axis-media/media.amp?camera=2&videocodec=jpeg',
  websocketUrl: 'wss://camera/rtsp-over-websocket',
  tokenUrl: 'https://camera/axis-cgi/rtspwssession.cgi'
};
const base = 'rtsp://camera/axis-media/media.amp/';
const encoder = new TextEncoder();
class TestSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = TestSocket.CONNECTING;
  sent = [];
  closeCount = 0;
  constructor() {
    super();
    sockets.push(this);
  }
  open() {
    this.readyState = TestSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  close() {
    this.closeCount++;
    this.readyState = TestSocket.CLOSED;
  }
  send(data) {
    assert.equal(this.readyState, TestSocket.OPEN);
    this.sent.push(...new RtspParser().parse(data));
  }
  message(data) {
    this.dispatchEvent(new MessageEvent('message', { data: data.buffer }));
  }
}
const last = (socket) => socket.sent.at(-1);
const reply = (socket, headers = {}, body = '', status = 200) => {
  const fields = { CSeq: last(socket).headers.get('cseq'), ...headers };
  if (body) {
    fields['Content-Length'] = encoder.encode(body).length;
  }
  socket.message(encoder.encode(
    `RTSP/1.0 ${status} Status\r\n` +
    Object.entries(fields).map(([name, value]) => `${name}: ${value}\r\n`).join('') +
    '\r\n' + body
  ));
};
const sdp = [
  'v=0', 'a=control:*',
  'm=audio 0 RTP/AVP 0', 'a=control:audio',
  'm=video 0 RTP/AVP 26', 'a=control:video'
].join('\r\n');
const start = (streamUrls = urls) => {
  globalThis.WebSocket = TestSocket;
  const surface = createCanvas();
  const reports = [];
  const ended = [];
  const stop = startJpegStream(surface.canvas, streamUrls, 5,
    (properties) => reports.push(properties), (retry) => ended.push(retry));
  stops.push(stop);
  return { ...surface, socket: sockets.at(-1), reports, ended, stop };
};
const open = async (socket) => {
  socket.open();
  await nextTask();
  assert.equal(last(socket).method, 'OPTIONS');
  reply(socket);
  assert.equal(last(socket).method, 'DESCRIBE');
};
const describe = (socket, body = sdp) => reply(socket, {
  'Content-Type': 'application/sdp', 'Content-Base': base
}, body);
const play = async (socket) => {
  await open(socket);
  describe(socket);
  assert.equal(last(socket).method, 'SETUP');
  assert.equal(last(socket).uri, `${base}video`);
  reply(socket, { Session: 'jpeg;timeout=60', Transport: 'RTP/AVP/TCP;unicast;interleaved=7-4' });
  assert.equal(last(socket).method, 'PLAY');
  assert.equal(last(socket).headers.get('range'), 'npt=5-');
  reply(socket);
};
const interleaved = (channel, data) => bytes(36, channel, data.length >> 8, data.length, ...data);
const jpegPacket = (timestamp, sequence = 1, payloadType = 26) => {
  const data = bytes(0x80, 0x80 | payloadType, sequence >> 8, sequence,
    0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 50, 4, 2, 1, 2);
  new DataView(data.buffer).setUint32(4, timestamp);
  return interleaved(7, data);
};
const bye = (source) => {
  const data = bytes(0x81, 203, 0, 1, 0, 0, 0, 0);
  new DataView(data.buffer).setUint32(4, source);
  return interleaved(4, data);
};

test('negotiates only the JPEG track and reports actual drawn dimensions', async (t) => {
  useClock(t);
  const current = start();
  await play(current.socket);
  current.socket.message(jpegPacket(0, 1, 97));
  assert.equal(decodes.length, 0);
  current.socket.message(jpegPacket(0));
  assert.deepEqual(current.reports, []);
  const image = new Uint8Array(await decodes[0].blob.arrayBuffer());
  assert.deepEqual(image.subarray(0, 2), bytes(0xff, 0xd8));
  assert.deepEqual(image.subarray(-4), bytes(1, 2, 0xff, 0xd9));
  await resolveDecode(0);
  assert.deepEqual(current.reports, [{ el: current.canvas, width: 32, height: 16 }]);
  current.socket.message(jpegPacket(900, 2));
  t.mock.timers.tick(10);
  await resolveDecode(1);
  assert.equal(current.reports.length, 1);
  current.socket.message(jpegPacket(1800, 3));
  t.mock.timers.tick(10);
  await resolveDecode(2, bitmap(640, 480));
  assert.equal(current.reports.length, 2);
  assert.equal(current.reports[1].width, 640);
  assert.equal(current.reports[1].height, 480);
  current.stop();
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.equal(current.socket.closeCount, 1);
  assert.deepEqual(current.ended, []);
});

test('honors goodbye for the active source and drains the pending image', async (t) => {
  useClock(t);
  const current = start();
  await play(current.socket);
  current.socket.message(jpegPacket(0));
  current.socket.message(bye(2));
  assert.equal(current.socket.closeCount, 0);
  current.socket.message(bye(1));
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.equal(current.socket.closeCount, 1);
  assert.deepEqual(current.ended, []);
  await resolveDecode(0);
  assert.equal(current.drawings.length, 1);
  assert.deepEqual(current.ended, [true]);
  current.stop();
  assert.equal(current.socket.closeCount, 1);
});

test('unsupported tracks and malformed RTP report a terminal failure', async (t) => {
  useClock(t);
  t.mock.method(console, 'error', () => {});
  const first = start();
  await open(first.socket);
  describe(first.socket, 'v=0\r\nm=audio 0 RTP/AVP 0');
  assert.deepEqual(first.ended, [false]);
  assert.equal(first.socket.closeCount, 1);
  const second = start();
  await play(second.socket);
  second.socket.message(interleaved(7, bytes(1)));
  assert.deepEqual(second.ended, [false]);
  assert.equal(second.socket.closeCount, 1);
});

test('stops a negotiating or decoding stream without a completion report', async (t) => {
  useClock(t);
  const first = start();
  first.stop();
  await nextTask();
  assert.equal(first.socket.closeCount, 1);
  assert.deepEqual(first.ended, []);
  const second = start();
  await play(second.socket);
  second.socket.message(jpegPacket(0));
  second.stop();
  await resolveDecode(0);
  assert.equal(second.drawings.length, 0);
  assert.deepEqual(second.reports, []);
  assert.deepEqual(second.ended, []);
  assert.equal(second.socket.closeCount, 1);
});


test('recovers a backward clock reset without waiting for the old timestamp', async (t) => {
  useClock(t);
  const { renderer, drawings } = setupRenderer();
  renderer.push(frame(900000));
  renderer.push(frame(909000));
  renderer.push(frame(0, 2));
  await resolveDecode(0);
  assert.deepEqual(drawings, []);
  assert.equal(decodes.length, 2);
  assert.deepEqual(new Uint8Array(await decodes[1].blob.arrayBuffer()), bytes(2));
  await resolveDecode(1);
  renderer.push(frame(9000));
  t.mock.timers.tick(99);
  assert.equal(decodes.length, 2);
  t.mock.timers.tick(1);
  await resolveDecode(2);
  assert.equal(drawings.length, 2);
});

test('rebases a large forward jump in live video and completes after goodbye', async (t) => {
  useClock(t);
  const current = start();
  await play(current.socket);
  current.socket.message(jpegPacket(0));
  await resolveDecode(0);
  current.socket.message(jpegPacket(1800000000, 2));
  assert.equal(decodes.length, 2);
  current.socket.message(bye(1));
  assert.deepEqual(current.ended, []);
  await resolveDecode(1);
  assert.deepEqual(current.ended, [true]);
  assert.equal(current.socket.closeCount, 1);
});

test('preserves low frame rates without rebasing their presentation times', async (t) => {
  useClock(t);
  const { renderer, drawings, errors } = setupRenderer();
  renderer.start();
  renderer.push(frame(0));
  await resolveDecode(0);
  for (let i = 1; i <= 4; i++) {
    t.mock.timers.tick(1000);
    renderer.push(frame(i * 90000));
    await resolveDecode(i);
  }
  assert.equal(drawings.length, 5);
  assert.deepEqual(errors, []);
});

test('fails if PLAY succeeds but no image is drawn before the progress deadline', async (t) => {
  useClock(t);
  t.mock.method(console, 'error', () => {});
  const current = start();
  await play(current.socket);
  t.mock.timers.tick(29999);
  assert.deepEqual(current.ended, []);
  t.mock.timers.tick(1);
  assert.deepEqual(current.ended, [false]);
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.equal(current.socket.closeCount, 1);
  t.mock.timers.tick(60000);
  assert.deepEqual(current.ended, [false]);
});

test('only successful drawing extends the live progress deadline', async (t) => {
  useClock(t);
  t.mock.method(console, 'error', () => {});
  const current = start();
  await play(current.socket);
  current.socket.message(jpegPacket(0));
  await resolveDecode(0);
  t.mock.timers.tick(20000);
  current.socket.message(jpegPacket(1800000, 2));
  await resolveDecode(1);
  for (let i = 1; i < 30; i++) {
    t.mock.timers.tick(1000);
    if (i === 10) {
      assert.equal(last(current.socket).method, 'OPTIONS');
      reply(current.socket);
    }
    current.socket.message(jpegPacket((20 + i) * 90000, i + 2));
    decodes[i + 1].reject(new Error('invalid JPEG'));
    await nextTask();
  }
  assert.deepEqual(current.ended, []);
  t.mock.timers.tick(1000);
  assert.deepEqual(current.ended, [false]);
  assert.equal(current.drawings.length, 2);
  assert.equal(current.reports.length, 1);
  assert.equal(current.socket.closeCount, 1);
});

test('allows a recording gap beyond the live timeout and preserves completion order', async (t) => {
  useClock(t);
  const current = start({ ...urls, url: urls.url + '&recordingid=test' });
  await play(current.socket);
  current.socket.message(jpegPacket(0));
  await resolveDecode(0);
  current.socket.message(jpegPacket(90 * 90000, 2));
  current.socket.message(bye(1));
  t.mock.timers.tick(89999);
  assert.equal(decodes.length, 1);
  assert.deepEqual(current.ended, []);
  t.mock.timers.tick(1);
  await resolveDecode(1);
  assert.deepEqual(current.ended, [true]);
});

test('a stalled recording decode times out and cannot draw after failure', async (t) => {
  useClock(t);
  const { renderer, errors, drawings } = setupRenderer(createCanvas(), false);
  renderer.start();
  t.mock.timers.tick(60000);
  assert.deepEqual(errors, []);
  renderer.push(frame(0));
  t.mock.timers.tick(30000);
  assert.match(errors[0].message, /presentation timed out/);
  await resolveDecode(0);
  assert.deepEqual(drawings, []);
});

test('stopping cancels the live progress deadline', (t) => {
  useClock(t);
  const { renderer, errors } = setupRenderer();
  renderer.start();
  renderer.stop();
  t.mock.timers.tick(60000);
  assert.deepEqual(errors, []);
});
