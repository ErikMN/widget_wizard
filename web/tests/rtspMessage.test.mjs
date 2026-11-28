import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let RtspParser;
let serializeRtspRequest;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ RtspParser, serializeRtspRequest } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtspMessage.ts'
  ));
});

after(async () => {
  await server?.close();
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uri = 'rtsp://camera/axis-media/media.amp?camera=1';
const bytes = (text) => encoder.encode(text);
const concat = (...parts) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
const response = (headers = '', body = new Uint8Array(0)) =>
  concat(bytes(`RTSP/1.0 200 OK\r\nCSeq: 1\r\n${headers}\r\n`), body);
const interleaved = (channel, data) =>
  concat(Uint8Array.of(0x24, channel, data.length >> 8, data.length & 255), data);

test('serializes RTSP requests with CRLF and an exact header terminator', () => {
  const request = serializeRtspRequest('OPTIONS', uri, { CSeq: '1' });
  assert.equal(
    decoder.decode(request),
    `OPTIONS ${uri} RTSP/1.0\r\nCSeq: 1\r\n\r\n`
  );
  assert.equal(
    decoder.decode(serializeRtspRequest('OPTIONS', '*', {})),
    'OPTIONS * RTSP/1.0\r\n\r\n'
  );
});

test('calculates Content-Length from bytes rather than text length', () => {
  const body = bytes('räksmörgås');
  const request = serializeRtspRequest(
    'SET_PARAMETER',
    uri,
    { CSeq: '2' },
    body
  );
  const [message] = new RtspParser().parse(request);
  assert.equal(message.type, 'request');
  assert.equal(message.method, 'SET_PARAMETER');
  assert.equal(message.uri, uri);
  assert.equal(message.headers.get('content-length'), String(body.length));
  assert.deepEqual(message.body, body);
});

test('rejects request line and header injection and caller-supplied length', () => {
  for (const [method, target, headers] of [
    ['BAD METHOD', uri, {}],
    ['OPTIONS', `${uri}\r\nCSeq: 2`, {}],
    ['OPTIONS', '', {}],
    ['OPTIONS', uri, { 'Bad Header': '1' }],
    ['OPTIONS', uri, { CSeq: '1\r\nSession: injected' }],
    ['OPTIONS', uri, { 'content-length': '0' }]
  ]) {
    assert.throws(() => serializeRtspRequest(method, target, headers));
  }
});

test('parses case-insensitive headers and folded or repeated values', () => {
  const [message] = new RtspParser().parse(
    response(
      'sEsSiOn: token; timeout=60\r\nPublic: OPTIONS, DESCRIBE\r\n\tSETUP\r\nPublic: PLAY\r\n'
    )
  );
  assert.equal(message.type, 'response');
  assert.equal(message.status, 200);
  assert.equal(message.reason, 'OK');
  assert.equal(message.headers.get('session'), 'token; timeout=60');
  assert.equal(message.headers.get('public'), 'OPTIONS, DESCRIBE SETUP, PLAY');
  assert.equal(message.body.length, 0);
});

test('accepts the legacy CR and LF header delimiters as well as CRLF', () => {
  for (const newline of ['\r\n', '\n', '\r']) {
    const data = bytes(['RTSP/1.0 200 OK', 'CSeq: 4', '', ''].join(newline));
    const [message] = new RtspParser().parse(data);
    assert.equal(message.headers.get('cseq'), '4');
  }
});

test('preserves an SDP body followed by packets and another response', () => {
  const body = bytes('$v=0\r\ns=Kamera å\r\n');
  const first = response(
    `Content-Type: application/sdp\r\nContent-Length: ${body.length}\r\n`,
    body
  );
  const rtp = interleaved(5, Uint8Array.of(0x80, 96, 0x24, 13, 10));
  const rtcp = interleaved(8, Uint8Array.of(0x80, 200, 0, 0, 0x80, 203, 0, 0));
  const data = concat(first, rtp, rtcp, response('Session: token\r\n'));
  const messages = new RtspParser().parse(data);
  assert.deepEqual(messages.map((message) => message.type), [
    'response',
    'interleaved',
    'interleaved',
    'response'
  ]);
  assert.deepEqual(messages[0].body, body);
  assert.equal(messages[1].channel, 5);
  assert.deepEqual(messages[1].data, rtp.slice(4));
  assert.equal(messages[2].channel, 8);
  assert.deepEqual(messages[2].data, rtcp.slice(4));
  assert.equal(messages[3].headers.get('session'), 'token');
});

test('handles every two-chunk split and byte-by-byte fragmentation', () => {
  const body = bytes('v=0\r\ns=Stream\r\n');
  const data = concat(
    response(`Content-Length: ${body.length}\r\n`, body),
    interleaved(3, Uint8Array.of(0x80, 96, 0, 1)),
    response()
  );
  const expected = new RtspParser().parse(data);
  for (let split = 0; split <= data.length; split++) {
    const parser = new RtspParser();
    assert.deepEqual(
      [
        ...parser.parse(data.subarray(0, split)),
        ...parser.parse(data.subarray(split))
      ],
      expected,
      `Split at byte ${split}`
    );
  }
  const parser = new RtspParser();
  const messages = [];
  for (const byte of data) {
    messages.push(...parser.parse(Uint8Array.of(byte)));
  }
  assert.deepEqual(messages, expected);
});

test('waits for a complete declared body and does not consume the next message', () => {
  const parser = new RtspParser();
  assert.deepEqual(
    parser.parse(response('Content-Length: 4\r\n', bytes('ab'))),
    []
  );
  const [message, next] = parser.parse(concat(bytes('cd'), response()));
  assert.equal(decoder.decode(message.body), 'abcd');
  assert.equal(next.status, 200);
});

test('handles the full 16-bit interleaved packet length', () => {
  const payload = new Uint8Array(65535).fill(0x24);
  const packet = interleaved(255, payload);
  const parser = new RtspParser();
  assert.deepEqual(parser.parse(packet.subarray(0, 500)), []);
  const [message] = parser.parse(packet.subarray(500));
  assert.equal(message.channel, 255);
  assert.deepEqual(message.data, payload);
});

test('copies payloads so later reads and source mutations cannot change them', () => {
  const parser = new RtspParser();
  const packet = interleaved(0, Uint8Array.of(1, 2, 3));
  const [first] = parser.parse(packet);
  packet.fill(0);
  parser.parse(interleaved(0, Uint8Array.of(4, 5, 6)));
  assert.deepEqual(first.data, Uint8Array.of(1, 2, 3));
});

test('keeps incomplete input isolated between connections', () => {
  const first = new RtspParser();
  const second = new RtspParser();
  const packet = interleaved(0, Uint8Array.of(1, 2, 3));
  assert.deepEqual(first.parse(packet.subarray(0, 3)), []);
  assert.equal(second.parse(response())[0].status, 200);
  assert.deepEqual(first.parse(packet.subarray(3))[0].data, packet.slice(4));
});

test('rejects malformed and oversized content lengths', () => {
  for (const length of [
    '-1',
    '1.5',
    '2x',
    '',
    '1048577',
    '999999999999999999999'
  ]) {
    assert.throws(
      () => new RtspParser().parse(response(`Content-Length: ${length}\r\n`)),
      /Content-Length/
    );
  }
  assert.throws(
    () =>
      new RtspParser().parse(
        response('Content-Length: 1\r\ncontent-length: 1\r\n')
      ),
    /Duplicate/
  );
});

test('rejects malformed start lines and headers and limits incomplete headers', () => {
  for (const text of [
    'HTTP/1.1 200 OK\r\n\r\n',
    'RTSP/1.0 999 Invalid\r\n\r\n',
    'RTSP/1.0 200 OK\r\nBad header\r\n\r\n'
  ]) {
    assert.throws(() => new RtspParser().parse(bytes(text)), /Invalid RTSP/);
  }
  assert.throws(
    () => new RtspParser().parse(new Uint8Array(32768).fill(65)),
    /size limit/
  );
});

test('rejects method names starting with the interleaved packet marker', () => {
  assert.throws(
    () => serializeRtspRequest('$OPTIONS', uri, { CSeq: '1' }),
    /Invalid RTSP request line/
  );
});

test('rejects a header continuation without a preceding field', () => {
  for (const line of [' CSeq: 1', '\tCSeq: 1']) {
    const data = bytes(`RTSP/1.0 200 OK\r\n${line}\r\n\r\n`);
    assert.throws(() => new RtspParser().parse(data), /header continuation/);
  }
});

test('bodyless responses do not consume the next message', () => {
  for (const status of [100, 199, 204, 304]) {
    for (const length of [4, 1048577]) {
      const header = bytes(
        `RTSP/1.0 ${status} Status\r\nCSeq: 1\r\nContent-Length: ${length}\r\n\r\n`
      );
      const packet = interleaved(3, Uint8Array.of(0x80, 96, 0, 1));
      const data = concat(header, packet, response());
      for (const split of [0, header.length - 1, header.length, data.length]) {
        const parser = new RtspParser();
        const messages = [
          ...parser.parse(data.subarray(0, split)),
          ...parser.parse(data.subarray(split))
        ];
        assert.equal(messages.length, 3);
        assert.equal(messages[0].status, status);
        assert.equal(messages[0].headers.get('content-length'), String(length));
        assert.equal(messages[0].body.length, 0);
        assert.equal(messages[1].channel, 3);
        assert.deepEqual(messages[1].data, packet.slice(4));
        assert.equal(messages[2].status, 200);
      }
    }
  }
});
