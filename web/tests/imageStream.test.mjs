import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let startImageStream;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ startImageStream } = await server.ssrLoadModule(
    '/src/components/player/native/imageStream.ts'
  ));
});

after(async () => {
  await server?.close();
});

class TestImage extends EventTarget {
  naturalWidth = 0;
  naturalHeight = 0;
  src;

  removeAttribute(name) {
    assert.equal(name, 'src');
    this.src = undefined;
  }

  load(width, height) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.dispatchEvent(new Event('load'));
  }
}

const src = 'https://camera/mjpg/video.mjpg?textstring=A%20B&timestamp=0';

test('reports actual image dimensions without audio support', () => {
  const image = new TestImage();
  const reports = [];
  const stop = startImageStream(
    image,
    src,
    (properties) => reports.push(properties),
    () => assert.fail('Unexpected image error')
  );

  image.load(0, 0);
  assert.equal(reports.length, 0);
  image.load(1920, 1080);
  assert.deepEqual(reports, [
    { el: image, width: 1920, height: 1080 }
  ]);
  stop();
});

test('reports dimension changes but not repeated loads of the same size', () => {
  const image = new TestImage();
  const reports = [];
  const stop = startImageStream(
    image,
    src,
    (properties) => reports.push(properties),
    () => assert.fail('Unexpected image error')
  );

  image.load(1920, 1080);
  image.load(1920, 1080);
  image.load(1080, 1920);
  assert.deepEqual(
    reports.map(({ width, height }) => [width, height]),
    [
      [1920, 1080],
      [1080, 1920]
    ]
  );
  stop();
});

test('removes the source and ignores later load events after stopping', () => {
  const image = new TestImage();
  let reports = 0;
  const stop = startImageStream(
    image,
    src,
    () => reports++,
    () => assert.fail('Unexpected image error')
  );

  assert.ok(image.src);
  stop();
  assert.equal(image.src, undefined);
  image.load(1920, 1080);
  assert.equal(reports, 0);
});

test('restarting the same URL creates a fresh request', () => {
  const image = new TestImage();
  const stop = startImageStream(
    image,
    src,
    () => {},
    () => assert.fail('Unexpected image error')
  );
  const first = image.src;
  stop();

  const stopAgain = startImageStream(
    image,
    src,
    () => {},
    () => assert.fail('Unexpected image error')
  );
  assert.notEqual(image.src, first);
  assert.ok(image.src.startsWith(`${src}&cachebust=`));
  assert.equal(new URL(image.src).searchParams.get('textstring'), 'A B');
  stopAgain();
});

test('cleans up and reports errors once, before or after the first load', () => {
  for (const loaded of [false, true]) {
    const image = new TestImage();
    let reports = 0;
    let errors = 0;
    const stop = startImageStream(
      image,
      src,
      () => reports++,
      () => errors++
    );

    if (loaded) {
      image.load(1920, 1080);
    }
    image.dispatchEvent(new Event('error'));
    assert.equal(image.src, undefined);
    image.dispatchEvent(new Event('error'));
    image.load(640, 480);
    stop();
    assert.equal(errors, 1);
    assert.equal(reports, loaded ? 1 : 0);
  }
});

test('stopping an image request does not report an error', () => {
  const image = new TestImage();
  const stop = startImageStream(
    image,
    src,
    () => assert.fail('Unexpected load'),
    () => assert.fail('Unexpected image error')
  );

  stop();
  image.dispatchEvent(new Event('error'));
});
