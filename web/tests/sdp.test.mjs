import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseSdpDescription;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ parseSdpDescription } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/sdp.ts'
  ));
});

after(async () => {
  await server?.close();
});

const uri = 'rtsp://camera/axis-media/media.amp?camera=2&audio=1';
const base = 'rtsp://camera/axis-media/media.amp/';
const encoder = new TextEncoder();
const describe = (lines, headers = {}, status = 200) =>
  parseSdpDescription(
    {
      type: 'response',
      status,
      reason: 'OK',
      headers: new Map([
        ['content-type', 'application/sdp'],
        ...Object.entries(headers)
      ]),
      body: encoder.encode(lines.join('\r\n'))
    },
    uri
  );

test('reads H264 video and AAC audio with their own control URLs', () => {
  const sps = 'packetization-mode=1; sprop-parameter-sets=Z0IAKeQ=,aM4=';
  const aac = 'mode=AAC-hbr;config=1408;SizeLength=13;IndexLength=3';
  const result = describe(
    [
      'v=0',
      'o=- 1 1 IN IP4 192.0.2.1',
      's=Camera',
      't=0 0',
      `a=control:${uri}`,
      'm=video 0 RTP/AVP 96',
      'a=control:trackID=1?camera=2&audio=1',
      'a=rtpmap:96 H264/90000',
      `a=fmtp:96 ${sps}`,
      'm=audio 0 RTP/AVP 97',
      'a=control:trackID=2?camera=2&audio=1',
      `a=fmtp:97 ${aac}`,
      'a=rtpmap:97 mpeg4-generic/16000/1'
    ],
    { 'content-base': base }
  );
  assert.deepEqual(result, {
    aggregateControlUri: uri,
    tracks: [
      {
        media: 'video',
        controlUri: `${base}trackID=1?camera=2&audio=1`,
        payloads: [
          {
            payloadType: 96,
            encoding: 'H264',
            clockRate: 90000,
            channels: undefined,
            formatParameters: sps
          }
        ]
      },
      {
        media: 'audio',
        controlUri: `${base}trackID=2?camera=2&audio=1`,
        payloads: [
          {
            payloadType: 97,
            encoding: 'MPEG4-GENERIC',
            clockRate: 16000,
            channels: 1,
            formatParameters: aac
          }
        ]
      }
    ]
  });
});

test('uses Content-Base before Content-Location and the request URI', () => {
  const lines = [
    'v=0',
    'a=control:*',
    'm=video 0 RTP/AVP 26',
    'a=control:track=1'
  ];
  const location = 'rtsp://camera/other/';
  for (const [headers, expected] of [
    [{ 'content-base': base, 'content-location': location }, base],
    [{ 'content-location': location }, location],
    [{ 'content-location': '/other/' }, location],
    [{}, uri]
  ]) {
    const result = describe(lines, headers);
    assert.equal(result.aggregateControlUri, expected);
    assert.equal(
      result.tracks[0].controlUri,
      new URL('track=1', expected).href
    );
  }
});

test('resolves media controls against the description base, not aggregate control', () => {
  const result = describe(
    [
      'v=0',
      'a=control:aggregate',
      'm=video 0 RTP/AVP 26',
      'a=control:video',
      'm=audio 0 RTP/AVP 0',
      'a=control:rtsp://camera:554/absolute/audio'
    ],
    { 'content-base': base }
  );
  assert.equal(result.aggregateControlUri, `${base}aggregate`);
  assert.equal(result.tracks[0].controlUri, `${base}video`);
  assert.equal(result.tracks[1].controlUri, 'rtsp://camera:554/absolute/audio');
});

test('uses the description base for a single track without control attributes', () => {
  const result = describe(['v=0', 'm=video 0 RTP/AVP 26']);
  assert.equal(result.aggregateControlUri, undefined);
  assert.equal(result.tracks[0].controlUri, uri);
});

test('uses aggregate control for a single track without its own control', () => {
  const result = describe(['v=0', 'a=control:aggregate', 'm=video 0 RTP/AVP 26'], {
    'content-base': base
  });
  assert.equal(result.aggregateControlUri, `${base}aggregate`);
  assert.equal(result.tracks[0].controlUri, `${base}aggregate`);
});

test('preserves the absence of aggregate control when tracks have their own URLs', () => {
  const result = describe([
    'v=0',
    'm=video 0 RTP/AVP 26',
    'a=control:video',
    'm=audio 0 RTP/AVP 0',
    'a=control:audio'
  ]);
  assert.equal(result.aggregateControlUri, undefined);
  assert.equal(result.tracks[0].controlUri, new URL('video', uri).href);
  assert.equal(result.tracks[1].controlUri, new URL('audio', uri).href);
});

test('rejects missing or duplicate control URLs in multi-track presentations', () => {
  for (const session of [['v=0'], ['v=0', 'a=control:*']]) {
    for (const lines of [
      ['m=video 0 RTP/AVP 26', 'm=audio 0 RTP/AVP 0'],
      ['m=video 0 RTP/AVP 26', 'a=control:video', 'm=audio 0 RTP/AVP 0'],
      ['m=video 0 RTP/AVP 26', 'm=audio 0 RTP/AVP 0', 'a=control:audio'],
      ['m=application 0 UDP example', 'm=video 0 RTP/AVP 26']
    ]) {
      assert.throws(
        () => describe([...session, ...lines]),
        /Missing SDP media control attribute/
      );
    }
    assert.throws(
      () =>
        describe([
          ...session,
          'm=video 0 RTP/AVP 26',
          'a=control:track',
          'm=audio 0 RTP/AVP 0',
          `a=control:${new URL('track', uri).href}`
        ]),
      /Duplicate SDP media control URI/
    );
  }
});

test('accepts valid media ports and rejects invalid ports and counts', () => {
  for (const port of ['0', '1', '65535', '5000/2']) {
    assert.equal(
      describe(['v=0', `m=video ${port} RTP/AVP 26`]).tracks.length,
      1
    );
  }
  for (const port of [
    '65536',
    '999999999999999999999',
    '-1',
    '1.5',
    '5000/0',
    '5000/65537',
    '5000/999999999999999999999'
  ]) {
    assert.throws(
      () => describe(['v=0', `m=video ${port} RTP/AVP 26`]),
      /Invalid SDP media/
    );
  }
});

test('preserves every advertised payload type and its own parameters', () => {
  const result = describe([
    'v=0',
    'm=video 0 RTP/AVP 96 97 98',
    'a=rtpmap:97 JPEG/90000',
    'a=fmtp:96 packetization-mode=1',
    'a=rtpmap:96 H264/90000',
    'a=fmtp:97 sampling=YCbCr-4:2:2'
  ]);
  const payloads = result.tracks[0].payloads;
  assert.deepEqual(
    payloads.map((payload) => payload.payloadType),
    [96, 97, 98]
  );
  assert.equal(payloads[0].encoding, 'H264');
  assert.equal(payloads[0].formatParameters, 'packetization-mode=1');
  assert.equal(payloads[1].encoding, 'JPEG');
  assert.equal(payloads[1].formatParameters, 'sampling=YCbCr-4:2:2');
  assert.deepEqual(payloads[2], { payloadType: 98 });
});

test('reads static JPEG and G711 assignments without inventing unknown encodings', () => {
  const result = describe([
    'v=0',
    'm=video 0 RTP/AVP 26 0',
    'a=control:video',
    'm=audio 0 RTP/AVP 0 8 26',
    'a=control:audio',
    'm=application 0 RTP/AVP 26',
    'a=control:data'
  ]);
  assert.deepEqual(result.tracks[0].payloads, [
    { payloadType: 26, encoding: 'JPEG', clockRate: 90000 },
    { payloadType: 0 }
  ]);
  assert.deepEqual(result.tracks[1].payloads, [
    { payloadType: 0, encoding: 'PCMU', clockRate: 8000, channels: 1 },
    { payloadType: 8, encoding: 'PCMA', clockRate: 8000, channels: 1 },
    { payloadType: 26 }
  ]);
  assert.deepEqual(result.tracks[2].payloads, [{ payloadType: 26 }]);
});

test('defaults audio to one channel and retains an explicit stereo channel count', () => {
  const result = describe([
    'v=0',
    'm=audio 0 RTP/AVP 96 97',
    'a=rtpmap:96 MPEG4-GENERIC/16000',
    'a=rtpmap:97 MPEG4-GENERIC/48000/2'
  ]);
  assert.equal(result.tracks[0].payloads[0].channels, 1);
  assert.equal(result.tracks[0].payloads[1].channels, 2);
});

test('keeps reused payload numbers independent between tracks', () => {
  const result = describe([
    'v=0',
    'm=video 0 RTP/AVP 96',
    'a=control:video',
    'a=rtpmap:96 H264/90000',
    'm=audio 0 RTP/AVP 96',
    'a=control:audio',
    'a=rtpmap:96 MPEG4-GENERIC/48000/2'
  ]);
  assert.equal(result.tracks[0].payloads[0].clockRate, 90000);
  assert.equal(result.tracks[1].payloads[0].clockRate, 48000);
});

test('ignores unsupported transport profiles without leaking their attributes', () => {
  const result = describe([
    'v=0',
    'a=control:*',
    'm=application 0 UDP example',
    'a=control:ignored',
    'm=video 0 RTP/AVP/TCP 26',
    'a=control:video'
  ]);
  assert.equal(result.aggregateControlUri, uri);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].controlUri, new URL('video', uri).href);
});

test('rejects invalid responses, description versions and control URLs', () => {
  assert.throws(() => describe(['v=0'], {}, 401), /Expected/);
  assert.throws(
    () => describe(['v=0'], { 'content-type': 'text/html' }),
    /Expected/
  );
  assert.throws(() => describe(['v=1']), /version/);
  for (const control of [
    '',
    'http://camera/video',
    'rtsp:///video',
    'rtsp://user:pass@camera/video',
    'bad url',
    'track#fragment'
  ]) {
    assert.throws(
      () => describe(['v=0', `a=control:${control}`]),
      /control URI/
    );
  }
  assert.throws(
    () => describe(['v=0', 'a=control:*', 'a=control:other']),
    /Duplicate/
  );
});

test('rejects malformed media lines and invalid or duplicate payload attributes', () => {
  for (const lines of [
    ['m=video 0 RTP/AVP'],
    ['m=video 0 RTP/AVP 128'],
    ['m=video 0 RTP/AVP 96 96'],
    ['m=video 0 RTP/AVP 96', 'a=rtpmap:97 H264/90000'],
    ['m=video 0 RTP/AVP 96', 'a=rtpmap:96 H264/0'],
    ['m=audio 0 RTP/AVP 96', 'a=rtpmap:96 MPEG4-GENERIC/16000/0'],
    [
      'm=video 0 RTP/AVP 96',
      'a=rtpmap:96 H264/90000',
      'a=rtpmap:96 JPEG/90000'
    ],
    ['m=video 0 RTP/AVP 96', 'a=fmtp:97 key=value'],
    ['m=video 0 RTP/AVP 96', 'a=fmtp:96 key=one', 'a=fmtp:96 key=two']
  ]) {
    assert.throws(() => describe(['v=0', ...lines]), /SDP/);
  }
});

test('retains frame dimensions by video payload type', () => {
  const result = describe([
    'v=0',
    'm=video 0 RTP/AVP 26 96 97',
    'a=framesize:26 3840-2160',
    'a=framesize:96 1280-720',
    'a=rtpmap:96 H264/90000'
  ]);
  const [jpeg, h264, unknown] = result.tracks[0].payloads;
  assert.equal(jpeg.encoding, 'JPEG');
  assert.deepEqual(jpeg.frameSize, { width: 3840, height: 2160 });
  assert.deepEqual(h264.frameSize, { width: 1280, height: 720 });
  assert.equal(unknown.frameSize, undefined);
});

test('rejects invalid or duplicate frame dimensions', () => {
  for (const attributes of [
    ['a=framesize:26 0-720'],
    ['a=framesize:26 1280-0'],
    ['a=framesize:26 65536-720'],
    ['a=framesize:26 1280-65536'],
    ['a=framesize:26 1280x720'],
    ['a=framesize:97 1280-720'],
    ['a=framesize:26 1280-720', 'a=framesize:26 640-480']
  ]) {
    assert.throws(
      () => describe(['v=0', 'm=video 0 RTP/AVP 26', ...attributes]),
      /SDP framesize/
    );
  }
});
