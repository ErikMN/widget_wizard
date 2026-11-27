import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let utils;
let api;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  utils = await server.ssrLoadModule(
    '/src/components/privacymask/privacyMaskUtils.ts'
  );
  api = await server.ssrLoadModule(
    '/src/components/privacymask/privacyMaskApi.ts'
  );
});

after(async () => {
  await server?.close();
});

const frame = { source: 0, width: 1920, height: 1080 };

test('maps reference points to rotated streams like the device does', () => {
  /* Values reported by a device for the same mask at each rotation */
  const point = { x: 948, y: 314 };
  assert.deepEqual(utils.referenceToStream(point, frame, 90, 1080, 1920), {
    x: 766,
    y: 948
  });
  assert.deepEqual(utils.referenceToStream(point, frame, 180, 1920, 1080), {
    x: 972,
    y: 766
  });
  assert.deepEqual(utils.referenceToStream(point, frame, 270, 1080, 1920), {
    x: 314,
    y: 972
  });
});

test('right half of the sensor becomes the top half at 270 degrees', () => {
  const big = { source: 0, width: 3840, height: 2160 };
  const mapped = [
    { x: 1920, y: 0 },
    { x: 3839, y: 2159 }
  ].map((p) => utils.referenceToStream(p, big, 270, 1080, 1920));
  assert.ok(mapped.every((p) => p.y <= 960));
});

test('stream to reference round-trips and scales to the stream size', () => {
  const original = { x: 400, y: 200 };
  for (const rotation of [0, 90, 180, 270]) {
    const size = utils.getRotatedSize(frame, rotation);
    const streamW = size.width / 2;
    const streamH = size.height / 2;
    const stream = utils.referenceToStream(
      original,
      frame,
      rotation,
      streamW,
      streamH
    );
    assert.deepEqual(
      utils.streamToReference(stream, frame, rotation, streamW, streamH),
      original,
      `rotation ${rotation}`
    );
  }
});

test('stream to reference clamps points inside the image', () => {
  assert.deepEqual(
    utils.streamToReference({ x: 1920, y: 1080 }, frame, 0, 1920, 1080),
    { x: 1919, y: 1079 }
  );
});

test('parses listpxjson and prefers the complete polygon', () => {
  const masks = utils.parseMaskList({
    listpx: [
      {
        id: 3,
        name: 'Door',
        enabled: false,
        zoomlowlimit: 0,
        all_position: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 }
        ],
        position: [{ x: 1, y: 2 }]
      }
    ]
  });
  assert.deepEqual(masks, [
    {
      id: 3,
      name: 'Door',
      enabled: false,
      zoomLowLimit: 0,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 }
      ]
    }
  ]);
  assert.equal(utils.parseMaskList({ nope: [] }), null);
});

test('picks the largest resolution as reference frame', () => {
  assert.deepEqual(utils.getMaxResolution('1920x1080,3840x2160,640x480'), {
    width: 3840,
    height: 2160
  });
});

test('generates the next free mask name', () => {
  assert.equal(utils.generateMaskName(['Mask 1', 'Mask 3']), 'Mask 4');
  assert.equal(utils.generateMaskName(['Door']), 'Mask 2');
});

test('add sends reference frame params and surfaces CGI errors', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response(
      'Error:\nprivacy_mask: 0103 Max number of corners exceeded\n'
    );
  });

  await assert.rejects(
    api.apiAddPrivacyMask({ source: 0, width: 3840, height: 2160 }, 'Mask 1', [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 }
    ]),
    { message: '0103 Max number of corners exceeded' }
  );

  const params = new URL(urls[0], 'http://camera').searchParams;
  assert.equal(params.get('action'), 'add');
  assert.equal(params.get('imagesource'), '0');
  assert.equal(params.get('imagerotation'), '0');
  assert.equal(params.get('imageresolution'), '3840x2160');
  assert.equal(params.get('name'), 'Mask 1');
  assert.equal(params.get('pxpolygon'), '1,2:3,4:5,6');
});

test('enable toggles the MaskWindows parameter by mask id', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response('OK');
  });

  await api.apiSetPrivacyMaskEnabled(0, 6, false);

  const params = new URL(urls[0], 'http://camera').searchParams;
  assert.equal(
    params.get('root.Image.I0.Overlay.MaskWindows.M6.Enabled'),
    'no'
  );
});
