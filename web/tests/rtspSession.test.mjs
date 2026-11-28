import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

let server;
let startRtspSession;
let RtspResponseError;
let RtspParser;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ startRtspSession, RtspResponseError } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtspSession.ts'
  ));
  ({ RtspParser } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtspMessage.ts'
  ));
});

after(async () => {
  await server?.close();
});

const urls = {
  url: 'rtsp://camera/axis-media/media.amp?camera=2&audio=1',
  websocketUrl: 'wss://camera/rtsp-over-websocket',
  tokenUrl: 'https://camera/axis-cgi/rtspwssession.cgi'
};
const base = 'rtsp://camera/axis-media/media.amp/';
const encoder = new TextEncoder();
const sockets = [];
const stops = [];
const originalWebSocket = globalThis.WebSocket;

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

  remoteClose() {
    this.readyState = TestSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event('close'), { code: 1006 }));
  }

  send(data) {
    assert.equal(this.readyState, TestSocket.OPEN);
    this.sent.push(...new RtspParser().parse(data));
  }

  message(data) {
    this.dispatchEvent(new MessageEvent('message', { data: data.buffer }));
  }
}

beforeEach(() => {
  sockets.length = 0;
  stops.length = 0;
  globalThis.WebSocket = TestSocket;
});

afterEach(() => {
  for (const stop of stops) {
    stop();
  }
  globalThis.WebSocket = originalWebSocket;
});

const start = (overrides = {}, offset = 0) => {
  const reports = [];
  const packets = [];
  const errors = [];
  const stop = startRtspSession(urls, offset, {
    selectTracks: (description) => description.tracks,
    onTracks: (tracks) => reports.push({ tracks }),
    onPlay: (range, rtpInfo) => reports.push({ range, rtpInfo }),
    onPacket: (track, kind, data) => packets.push({ track, kind, data }),
    onEnded: (error) => errors.push(error),
    ...overrides
  });
  stops.push(stop);
  return { socket: sockets.at(-1), reports, packets, errors, stop };
};

const nextTask = () => new Promise((resolve) => setImmediate(resolve));
const last = (socket) => socket.sent.at(-1);
const response = (cseq, headers = {}, body = '', status = 200) => {
  const fields = { CSeq: cseq, ...headers };
  if (body) {
    fields['Content-Length'] = encoder.encode(body).length;
  }
  return encoder.encode(
    `RTSP/1.0 ${status} Status\r\n` +
      Object.entries(fields)
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join('') +
      '\r\n' +
      body
  );
};
const reply = (socket, headers = {}, body = '', status = 200) =>
  socket.message(response(last(socket).headers.get('cseq'), headers, body, status));
const video = [
  'm=video 0 RTP/AVP 96',
  'a=control:video',
  'a=rtpmap:96 H264/90000'
];
const audio = [
  'm=audio 0 RTP/AVP 97',
  'a=control:audio',
  'a=rtpmap:97 MPEG4-GENERIC/48000/2'
];
const describe = (socket, media = video, aggregate = true) =>
  reply(
    socket,
    { 'Content-Type': 'application/sdp', 'Content-Base': base },
    ['v=0', ...(aggregate ? ['a=control:*'] : []), ...media].join('\r\n')
  );
const setup = (socket, pair = '0-1', session = 'session;timeout=60') =>
  reply(socket, {
    Session: session,
    Transport: `RTP/AVP/TCP;unicast;interleaved=${pair};mode="PLAY"`
  });
const open = async (socket) => {
  socket.open();
  await nextTask();
  assert.equal(last(socket).method, 'OPTIONS');
  reply(socket);
  assert.equal(last(socket).method, 'DESCRIBE');
};
const play = async (socket, session) => {
  await open(socket);
  describe(socket);
  setup(socket, '0-1', session);
  reply(socket);
};
const packet = (channel, value) => Uint8Array.of(36, channel, 0, 1, value);

test('negotiates video and audio with sequential commands and returned channels', async () => {
  const current = start({}, 5);
  const { socket } = current;
  await open(socket);
  assert.equal(last(socket).headers.get('accept'), 'application/sdp');
  describe(socket, [...video, ...audio]);
  assert.equal(last(socket).uri, `${base}video`);
  assert.equal(last(socket).headers.get('blocksize'), '64000');
  assert.equal(
    last(socket).headers.get('transport'),
    'RTP/AVP/TCP;unicast;interleaved=0-1'
  );
  setup(socket, '1-3');
  assert.equal(last(socket).uri, `${base}audio`);
  assert.equal(last(socket).headers.get('session'), 'session');
  assert.equal(
    last(socket).headers.get('transport'),
    'RTP/AVP/TCP;unicast;interleaved=4-5'
  );
  setup(socket, '6-8');
  assert.equal(last(socket).method, 'PLAY');
  assert.equal(last(socket).uri, base);
  assert.equal(last(socket).headers.get('range'), 'npt=5-');
  assert.equal(current.reports[0].tracks.length, 2);
  const range = 'npt=5-20';
  const rtpInfo = 'url=rtsp://camera/video;seq=123;rtptime=456';
  const header = response('5', { Range: range, 'RTP-Info': rtpInfo });
  socket.message(
    Uint8Array.of(
      ...header,
      ...packet(1, 1),
      ...packet(3, 2),
      ...packet(6, 3),
      ...packet(8, 4),
      ...packet(0, 5)
    )
  );
  assert.deepEqual(current.reports[1], { range, rtpInfo });
  assert.deepEqual(
    current.packets.map(({ track, kind, data }) => [
      track.description.media, kind, data[0]
    ]),
    [
      ['video', 'rtp', 1],
      ['video', 'rtcp', 2],
      ['audio', 'rtp', 3],
      ['audio', 'rtcp', 4]
    ]
  );
  current.stop();
  assert.deepEqual(
    socket.sent.map((message) => message.method),
    ['OPTIONS', 'DESCRIBE', 'SETUP', 'SETUP', 'PLAY', 'TEARDOWN']
  );
  assert.deepEqual(
    socket.sent.map((message) => message.headers.get('cseq')),
    ['1', '2', '3', '4', '5', '6']
  );
  assert.equal(socket.closeCount, 1);
  assert.deepEqual(current.errors, []);
});

test('uses a selected track control URI without aggregate control', async () => {
  const current = start({
    selectTracks: (description) => [description.tracks[0]]
  });
  const { socket } = current;
  await open(socket);
  describe(socket, [...video, ...audio], false);
  setup(socket);
  assert.equal(last(socket).method, 'PLAY');
  assert.equal(last(socket).uri, `${base}video`);
  reply(socket);
  current.stop();
  assert.equal(last(socket).uri, `${base}video`);
});

test('rejects multi-track playback without aggregate control', async () => {
  const current = start();
  await open(current.socket);
  describe(current.socket, [...video, ...audio], false);
  assert.match(current.errors[0].message, /require aggregate control/);
  assert.equal(current.socket.sent.length, 2);
  assert.equal(current.socket.closeCount, 1);
});

test('rejects empty, repeated or foreign track selections', async () => {
  for (const selectTracks of [
    () => [],
    (description) => [description.tracks[0], description.tracks[0]],
    (description) => [{ ...description.tracks[0] }]
  ]) {
    const current = start({ selectTracks });
    await open(current.socket);
    describe(current.socket);
    assert.match(current.errors[0].message, /track selection/);
    assert.equal(current.socket.closeCount, 1);
  }
});

test('requires the matching CSeq and waits for a final response', async () => {
  const current = start();
  current.socket.open();
  await nextTask();
  reply(current.socket, {}, '', 100);
  assert.equal(current.socket.sent.length, 1);
  reply(current.socket);
  assert.equal(last(current.socket).method, 'DESCRIBE');
  current.socket.message(response('99'));
  assert.match(current.errors[0].message, /response sequence/);
  assert.equal(current.socket.closeCount, 1);
});

test('requires the session identifier and rejects changes to it', async () => {
  const missing = start();
  await open(missing.socket);
  describe(missing.socket);
  reply(missing.socket, { Transport: 'RTP/AVP/TCP;interleaved=0-1' });
  assert.match(missing.errors[0].message, /Missing RTSP session/);
  const changed = start();
  await open(changed.socket);
  describe(changed.socket, [...video, ...audio]);
  setup(changed.socket);
  setup(changed.socket, '2-3', 'another');
  assert.match(changed.errors[0].message, /identifier changed/);
  assert.equal(last(changed.socket).method, 'TEARDOWN');
  assert.equal(last(changed.socket).headers.get('session'), 'session');
});

test('rejects invalid or conflicting transport channels', async () => {
  for (const transport of [
    undefined,
    'RTP/AVP;unicast;interleaved=0-1',
    'RTP/AVP/TCP;multicast;interleaved=0-1',
    'RTP/AVP/TCP;interleaved=256-1',
    'RTP/AVP/TCP;interleaved=1-1',
    'RTP/AVP/TCP;interleaved=0-1;interleaved=2-3'
  ]) {
    const current = start();
    await open(current.socket);
    describe(current.socket);
    reply(current.socket, {
      Session: 'session',
      ...(transport ? { Transport: transport } : {})
    });
    assert.match(current.errors[0].message, /transport|channels/);
    assert.equal(current.socket.closeCount, 1);
  }
  const duplicate = start();
  await open(duplicate.socket);
  describe(duplicate.socket, [...video, ...audio]);
  setup(duplicate.socket);
  setup(duplicate.socket, '1-2');
  assert.match(duplicate.errors[0].message, /Duplicate RTSP/);
});

test('sends keepalive before expiration and schedules the next after its response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const current = start();
  const { socket } = current;
  await play(socket, 'session;timeout=4');
  t.mock.timers.tick(1999);
  assert.equal(last(socket).method, 'PLAY');
  t.mock.timers.tick(1);
  assert.equal(last(socket).method, 'OPTIONS');
  assert.equal(last(socket).headers.get('session'), 'session');
  const count = socket.sent.length;
  t.mock.timers.tick(500);
  assert.equal(socket.sent.length, count);
  reply(socket, { Session: 'session;timeout=2' });
  t.mock.timers.tick(499);
  assert.equal(socket.sent.length, count);
  t.mock.timers.tick(1);
  assert.equal(socket.sent.length, count + 1);
  current.stop();
  t.mock.timers.tick(30000);
  assert.equal(last(socket).method, 'TEARDOWN');
  assert.deepEqual(current.errors, []);
});

test('uses the default timeout when no positive timeout is advertised', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const first = start();
  await play(first.socket, 'session');
  t.mock.timers.tick(30000);
  assert.equal(last(first.socket).method, 'OPTIONS');
  first.stop();
  const second = start();
  await play(second.socket, 'session;timeout=0');
  t.mock.timers.tick(29999);
  assert.equal(last(second.socket).method, 'PLAY');
  t.mock.timers.tick(1);
  assert.equal(last(second.socket).method, 'OPTIONS');
});

test('times out unanswered commands and cancels keepalive on failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const current = start();
  await open(current.socket);
  describe(current.socket);
  setup(current.socket, '0-1', 'session;timeout=2');
  reply(current.socket);
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1999);
  assert.deepEqual(current.errors, []);
  t.mock.timers.tick(1);
  assert.match(current.errors[0].message, /OPTIONS timed out/);
  assert.equal(last(current.socket).method, 'TEARDOWN');
  t.mock.timers.tick(100000);
  assert.equal(current.errors.length, 1);
  assert.equal(current.socket.closeCount, 1);
});

test('ends on RTSP failure without sending subsequent negotiation commands', async () => {
  const current = start();
  await open(current.socket);
  reply(current.socket, {}, '', 401);
  assert.match(current.errors[0].message, /DESCRIBE failed \(401\)/);
  assert.ok(current.errors[0] instanceof RtspResponseError);
  assert.equal(current.errors[0].status, 401);
  assert.equal(current.errors[0].method, 'DESCRIBE');
  assert.equal(current.socket.sent.length, 2);
  assert.equal(current.socket.closeCount, 1);
});

test('stop during connection or SETUP cancels without an end notification', async () => {
  const connecting = start();
  connecting.stop();
  await nextTask();
  assert.equal(connecting.socket.closeCount, 1);
  assert.deepEqual(connecting.errors, []);
  const current = start();
  await open(current.socket);
  describe(current.socket, [...video, ...audio]);
  setup(current.socket);
  current.stop();
  current.stop();
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.equal(current.socket.closeCount, 1);
  assert.deepEqual(current.errors, []);
});

test('stops before PLAY if the track consumer cancels', async () => {
  let current;
  current = start({ onTracks: () => current.stop() });
  await open(current.socket);
  describe(current.socket);
  setup(current.socket);
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.equal(
    current.socket.sent.some((message) => message.method === 'PLAY'),
    false
  );
  assert.deepEqual(current.errors, []);
});

test('reports unexpected socket termination once and stops delivering packets', async () => {
  const current = start();
  await play(current.socket);
  current.socket.remoteClose();
  current.socket.remoteClose();
  current.socket.message(packet(0, 1));
  assert.equal(current.errors.length, 1);
  assert.deepEqual(current.packets, []);
});

test('responds to unsupported server commands without consuming a pending response', async () => {
  const current = start();
  current.socket.open();
  await nextTask();
  current.socket.message(
    encoder.encode(`ANNOUNCE ${urls.url} RTSP/1.0\r\nCSeq: 80\r\n\r\n`)
  );
  assert.equal(last(current.socket).status, 501);
  assert.equal(last(current.socket).headers.get('cseq'), '80');
  current.socket.message(response('1'));
  assert.equal(last(current.socket).method, 'DESCRIBE');
  assert.deepEqual(current.errors, []);
});

test('keeps parallel sessions independent', async () => {
  const first = start();
  const second = start();
  await play(first.socket, 'first');
  await play(second.socket, 'second');
  first.stop();
  second.socket.message(packet(0, 7));
  assert.equal(second.packets[0].data[0], 7);
  second.stop();
  assert.equal(last(first.socket).headers.get('session'), 'first');
  assert.equal(last(second.socket).headers.get('session'), 'second');
});

test('uses the first free higher RTCP channel when only RTP is specified', async () => {
  const current = start();
  await open(current.socket);
  describe(current.socket, [...video, ...audio]);
  setup(current.socket, '2-4');
  setup(current.socket, '1');
  const tracks = current.reports[0].tracks;
  assert.equal(tracks[1].rtpChannel, 1);
  assert.equal(tracks[1].rtcpChannel, 3);
  reply(current.socket);
  current.socket.message(packet(3, 8));
  assert.equal(current.packets[0].track.description.media, 'audio');
  assert.equal(current.packets[0].kind, 'rtcp');
});

test('cleans up when sending a command or consuming a packet fails', async () => {
  const sendFailure = start();
  await open(sendFailure.socket);
  sendFailure.socket.send = () => {
    throw new Error('send error');
  };
  describe(sendFailure.socket);
  assert.match(sendFailure.errors[0].message, /send failed/);
  assert.equal(sendFailure.errors.length, 1);
  assert.equal(sendFailure.socket.closeCount, 1);
  const consumerFailure = start({
    onPacket: () => {
      throw new Error('consumer error');
    }
  });
  await play(consumerFailure.socket);
  consumerFailure.socket.message(packet(0, 1));
  assert.match(consumerFailure.errors[0].message, /consumer error/);
  assert.equal(last(consumerFailure.socket).method, 'TEARDOWN');
  assert.equal(consumerFailure.socket.closeCount, 1);
});

test('rejects invalid session timeouts', async () => {
  for (const session of [
    'session;timeout=-1',
    'session;timeout=1.5',
    'session;timeout=2;timeout=3'
  ]) {
    const current = start();
    await open(current.socket);
    describe(current.socket);
    setup(current.socket, '0-1', session);
    assert.match(current.errors[0].message, /Invalid RTSP session timeout/);
    assert.equal(current.socket.closeCount, 1);
  }
});

test('renews immediately after a delayed reply if the interval has elapsed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const current = start();
  const { socket } = current;
  await open(socket);
  describe(socket);
  setup(socket, '0-1', 'session;timeout=4');
  t.mock.timers.tick(1500);
  reply(socket);
  t.mock.timers.tick(499);
  assert.equal(last(socket).method, 'PLAY');
  t.mock.timers.tick(1);
  assert.equal(last(socket).method, 'OPTIONS');
  const count = socket.sent.length;
  t.mock.timers.tick(2500);
  assert.equal(socket.sent.length, count);
  reply(socket);
  t.mock.timers.tick(1);
  assert.equal(socket.sent.length, count + 1);
  assert.deepEqual(current.errors, []);
});

test('discards premature packets and reports PLAY before delivering media', async () => {
  const events = [];
  const current = start({
    onPlay: () => events.push('play'),
    onPacket: (_track, kind, data) => events.push([kind, data[0]])
  });
  const { socket } = current;
  await open(socket);
  describe(socket);
  setup(socket);
  socket.message(packet(0, 1));
  socket.message(packet(1, 2));
  assert.deepEqual(events, []);
  socket.message(
    Uint8Array.of(
      ...packet(0, 3),
      ...response(last(socket).headers.get('cseq')),
      ...packet(0, 4),
      ...packet(1, 5)
    )
  );
  assert.deepEqual(events, ['play', ['rtp', 4], ['rtcp', 5]]);
});

test('does not deliver media when the PLAY handler stops the session', async () => {
  let current;
  current = start({ onPlay: () => current.stop() });
  await open(current.socket);
  describe(current.socket);
  setup(current.socket);
  current.socket.message(
    Uint8Array.of(
      ...response(last(current.socket).headers.get('cseq')),
      ...packet(0, 1)
    )
  );
  assert.deepEqual(current.packets, []);
  assert.equal(last(current.socket).method, 'TEARDOWN');
  assert.deepEqual(current.errors, []);
});
