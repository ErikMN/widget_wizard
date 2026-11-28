import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

let server;
let connectRtspWebSocket;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ connectRtspWebSocket } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtspWebSocket.ts'
  ));
});

after(async () => {
  await server?.close();
});

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const sockets = [];
const requests = [];
const urls = {
  websocketUrl: 'wss://camera/rtsp-over-websocket?existing=1',
  tokenUrl: 'https://camera/axis-cgi/rtspwssession.cgi'
};
const response = new TextEncoder().encode('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n');

class TestSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = TestSocket.CONNECTING;
  closeCount = 0;
  sent = [];
  listeners = new Map();

  constructor(url, protocol) {
    super();
    this.url = new URL(url);
    this.protocol = protocol;
    sockets.push(this);
  }

  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.get(type)?.delete(listener);
  }

  open() {
    this.readyState = TestSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  close() {
    this.closeCount++;
    this.readyState = TestSocket.CLOSED;
  }

  remoteClose(code = 1006) {
    this.readyState = TestSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }

  error() {
    this.dispatchEvent(new Event('error'));
  }

  message(data) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  send(data) {
    this.sent.push(data);
  }
}

beforeEach(() => {
  sockets.length = 0;
  requests.length = 0;
  globalThis.WebSocket = TestSocket;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('  token+/=  ');
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
});

const start = (endpoints = urls, onMessage) => {
  const controller = new AbortController();
  const messages = [];
  const errors = [];
  const ready = connectRtspWebSocket(
    endpoints,
    controller.signal,
    onMessage ?? ((message) => messages.push(message)),
    (error) => errors.push(error)
  );
  return { controller, messages, errors, ready };
};

const nextTask = () => new Promise((resolve) => setImmediate(resolve));
const assertDetached = (socket) => {
  for (const listeners of socket.listeners.values()) {
    assert.equal(listeners.size, 0);
  }
};

test('opens WS and WSS with the binary subprotocol without fetching a token', async () => {
  for (const secure of [false, true]) {
    const current = start({
      websocketUrl: `${secure ? 'wss' : 'ws'}://camera/rtsp-over-websocket`,
      tokenUrl: `${secure ? 'https' : 'http'}://camera/axis-cgi/rtspwssession.cgi`
    });
    const socket = sockets.at(-1);
    assert.equal(socket.protocol, 'binary');
    assert.equal(socket.binaryType, 'arraybuffer');
    socket.open();
    const connection = await current.ready;
    connection.close();
    assertDetached(socket);
  }
  assert.equal(requests.length, 0);
});

test('retries once with a fresh encoded token after handshake failure', async () => {
  const current = start();
  sockets[0].error();
  await nextTask();
  assert.equal(sockets[0].closeCount, 1);
  assertDetached(sockets[0]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.href, urls.tokenUrl);
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(sockets.length, 2);
  const socket = sockets[1];
  assert.equal(socket.url.searchParams.get('existing'), '1');
  assert.equal(socket.url.searchParams.get('rtspwssession'), 'token+/=');
  assert.equal(socket.protocol, 'binary');
  assert.equal(socket.binaryType, 'arraybuffer');
  socket.open();
  const connection = await current.ready;
  connection.close();
  assertDetached(socket);
});

test('does not retry a failed token handshake or disclose the token in errors', async () => {
  const current = start();
  const rejection = assert.rejects(current.ready, {
    message: 'RTSP WebSocket connection failed'
  });
  sockets[0].remoteClose();
  await nextTask();
  sockets[1].error();
  await rejection;
  assert.equal(sockets.length, 2);
  assert.equal(requests.length, 1);
  assertDetached(sockets[0]);
  assertDetached(sockets[1]);
  assert.deepEqual(current.errors, []);
});

test('rejects failed token responses and empty or multiline tokens', async () => {
  for (const result of [
    () => new Response('denied', { status: 401 }),
    () => new Response('   '),
    () => new Response('first\nsecond'),
    () => {
      throw new Error('network failure');
    }
  ]) {
    globalThis.fetch = async () => result();
    const current = start();
    const socket = sockets.at(-1);
    const rejection = assert.rejects(current.ready, /session token/);
    socket.error();
    await rejection;
    assert.equal(sockets.at(-1), socket);
    assertDetached(socket);
  }
});

test('rejects mismatched hosts, security schemes and embedded credentials', async () => {
  for (const endpoints of [
    { ...urls, tokenUrl: 'https://other/axis-cgi/rtspwssession.cgi' },
    { ...urls, tokenUrl: 'http://camera/axis-cgi/rtspwssession.cgi' },
    { ...urls, websocketUrl: 'https://camera/rtsp-over-websocket' },
    { ...urls, websocketUrl: 'wss://user:password@camera/rtsp-over-websocket' }
  ]) {
    await assert.rejects(
      start(endpoints).ready,
      /Invalid RTSP WebSocket endpoints/
    );
  }
  assert.equal(sockets.length, 0);
  assert.equal(requests.length, 0);
});

test('cancels a pending connection without fetching a token', async () => {
  const current = start();
  const rejection = assert.rejects(current.ready, { name: 'AbortError' });
  current.controller.abort();
  await rejection;
  assert.equal(sockets[0].closeCount, 1);
  assertDetached(sockets[0]);
  assert.equal(requests.length, 0);
  assert.deepEqual(current.errors, []);
});

test('cancels a pending token request and never opens a second socket', async () => {
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(options.signal.reason)
      );
    });
  };
  const current = start();
  const rejection = assert.rejects(current.ready, { name: 'AbortError' });
  sockets[0].error();
  await nextTask();
  current.controller.abort();
  await rejection;
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(sockets.length, 1);
});

test('cancels a pending token-authenticated socket', async () => {
  const current = start();
  const rejection = assert.rejects(current.ready, { name: 'AbortError' });
  sockets[0].error();
  await nextTask();
  current.controller.abort();
  await rejection;
  assert.equal(sockets[1].closeCount, 1);
  assertDetached(sockets[1]);
});

test('times out a stalled first handshake without retrying', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const current = start();
  const rejection = assert.rejects(current.ready, /timed out/);
  t.mock.timers.tick(20000);
  await rejection;
  assert.equal(sockets[0].closeCount, 1);
  assertDetached(sockets[0]);
  assert.equal(requests.length, 0);
});

test('the connection deadline also covers token fetching and the retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const current = start();
  const rejection = assert.rejects(current.ready, /timed out/);
  t.mock.timers.tick(15000);
  sockets[0].error();
  await nextTask();
  assert.equal(sockets.length, 2);
  t.mock.timers.tick(5000);
  await rejection;
  assert.equal(sockets[1].closeCount, 1);
  assertDetached(sockets[1]);
});

test('delivers fragmented messages in order and sends binary data', async () => {
  const current = start();
  const socket = sockets[0];
  socket.open();
  const connection = await current.ready;
  socket.message(response.slice(0, 5).buffer);
  assert.equal(current.messages.length, 0);
  const rest = Uint8Array.of(...response.slice(5), 36, 4, 0, 2, 128, 96);
  socket.message(rest.buffer);
  assert.equal(current.messages[0].status, 200);
  assert.equal(current.messages[1].channel, 4);
  assert.deepEqual(current.messages[1].data, Uint8Array.of(128, 96));
  connection.send(response);
  assert.deepEqual(socket.sent, [response]);
  connection.close();
  connection.close();
  assert.equal(socket.closeCount, 1);
  assertDetached(socket);
  assert.throws(() => connection.send(response), /closed/);
  assert.deepEqual(current.errors, []);
});

test('aborting an established connection closes it silently', async () => {
  const current = start();
  const socket = sockets[0];
  socket.open();
  const connection = await current.ready;
  current.controller.abort();
  socket.message(response.buffer);
  socket.error();
  connection.close();
  assert.equal(socket.closeCount, 1);
  assertDetached(socket);
  assert.deepEqual(current.messages, []);
  assert.deepEqual(current.errors, []);
});

test('reports remote closure, parser errors and socket errors once', async () => {
  for (const terminate of [
    (socket) => socket.remoteClose(1001),
    (socket) => socket.message('unexpected text'),
    (socket) => socket.message(new TextEncoder().encode('invalid\r\n\r\n').buffer),
    (socket) => socket.error()
  ]) {
    const current = start();
    const socket = sockets.at(-1);
    socket.open();
    const connection = await current.ready;
    terminate(socket);
    socket.error();
    socket.remoteClose();
    assert.equal(current.errors.length, 1);
    assertDetached(socket);
    assert.throws(() => connection.send(response), /closed/);
  }
});

test('reports a send failure and closes the connection', async () => {
  const current = start();
  const socket = sockets[0];
  socket.open();
  const connection = await current.ready;
  socket.send = () => {
    throw new Error('send failed');
  };
  assert.throws(() => connection.send(response), /send failed/);
  assert.equal(current.errors.length, 1);
  assert.equal(socket.closeCount, 1);
  assertDetached(socket);
});

test('stops delivering a batch if the consumer closes the connection', async () => {
  const messages = [];
  let connection;
  const current = start(urls, (message) => {
    messages.push(message);
    connection.close();
  });
  const socket = sockets[0];
  socket.open();
  connection = await current.ready;
  socket.message(Uint8Array.of(...response, ...response).buffer);
  assert.equal(messages.length, 1);
  assertDetached(socket);
  assert.deepEqual(current.errors, []);
});

test('does not start a connection with an already aborted signal', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    connectRtspWebSocket(
      urls,
      controller.signal,
      () => {},
      () => {}
    ),
    { name: 'AbortError' }
  );
  assert.equal(sockets.length, 0);
  assert.equal(requests.length, 0);
});

test('closes a socket if cancellation occurs just after opening', async () => {
  const current = start();
  const rejection = assert.rejects(current.ready, { name: 'AbortError' });
  sockets[0].open();
  current.controller.abort();
  await rejection;
  assert.equal(sockets[0].closeCount, 1);
  assertDetached(sockets[0]);
  assert.equal(requests.length, 0);
  assert.deepEqual(current.errors, []);
});

test('times out a stalled token response body', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      text: () =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(options.signal.reason)
          );
        })
    };
  };
  const current = start();
  const rejection = assert.rejects(current.ready, /timed out/);
  sockets[0].error();
  await nextTask();
  assert.equal(requests.length, 1);
  t.mock.timers.tick(20000);
  await rejection;
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(sockets.length, 1);
});

test('clears the startup deadline and keeps connections independent', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = start();
  const second = start();
  sockets[0].open();
  sockets[1].open();
  const firstConnection = await first.ready;
  const secondConnection = await second.ready;
  sockets[0].message(response.slice(0, 5).buffer);
  sockets[1].message(response.buffer);
  assert.equal(first.messages.length, 0);
  assert.equal(second.messages.length, 1);
  t.mock.timers.tick(20000);
  assert.equal(sockets[0].readyState, TestSocket.OPEN);
  assert.equal(sockets[1].readyState, TestSocket.OPEN);
  firstConnection.close();
  sockets[1].message(response.buffer);
  assert.equal(second.messages.length, 2);
  secondConnection.close();
  assertDetached(sockets[0]);
  assertDetached(sockets[1]);
});

test('does not fetch a token when creating the socket fails', async () => {
  globalThis.WebSocket = class {
    constructor() {
      throw new Error('WebSocket unavailable');
    }
  };
  await assert.rejects(start().ready, /could not be created/);
  assert.equal(requests.length, 0);
});
