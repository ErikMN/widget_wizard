import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let startHttpMp4Stream;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ startHttpMp4Stream } = await server.ssrLoadModule(
    '/src/components/player/native/httpMp4Stream.ts'
  ));
});

after(async () => {
  await server?.close();
});

const mime = 'video/mp4; codecs="avc1.640029"';
const av1Mime = 'video/mp4; codecs="av01.0.08M.08"';
const originals = {
  fetch: globalThis.fetch,
  MediaSource: globalThis.MediaSource,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL
};

class TestBuffer extends EventTarget {
  ranges = [];
  operations = [];
  updating = false;
  complete = true;
  quotaFailures = 0;
  buffered = {
    get length() {
      return this.owner.ranges.length;
    },
    owner: this,
    start: (index) => this.ranges[index][0],
    end: (index) => this.ranges[index][1]
  };

  update(operation) {
    assert.equal(this.updating, false);
    this.updating = true;
    this.operations.push(operation);
    if (this.complete) {
      queueMicrotask(() => this.finish());
    }
  }

  finish() {
    this.updating = false;
    this.dispatchEvent(new Event('updateend'));
  }

  appendBuffer(bytes) {
    if (this.quotaFailures > 0) {
      this.quotaFailures--;
      throw new DOMException('Buffer full', 'QuotaExceededError');
    }
    this.update(['append', ...bytes]);
  }

  remove(start, end) {
    this.update(['remove', start, end]);
    this.ranges = [[end, this.ranges[0][1]]];
  }
}

class TestMediaSource extends EventTarget {
  buffer = new TestBuffer();
  ended = false;

  static isTypeSupported(type) {
    return type === mime || type === av1Mime;
  }

  addSourceBuffer(type) {
    assert.ok(TestMediaSource.isTypeSupported(type));
    this.mime = type;
    return this.buffer;
  }

  endOfStream() {
    assert.equal(this.buffer.updating, false);
    this.ended = true;
  }
}

class TestVideo extends EventTarget {
  currentTime = 0;
  paused = false;
  loaded = false;

  pause() {
    this.paused = true;
  }

  removeAttribute(name) {
    assert.equal(name, 'src');
    this.src = undefined;
  }

  load() {
    this.loaded = true;
  }
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Expected stream operation did not complete');
}

function setup({ contentType = mime, status = 200, open = true } = {}) {
  let source;
  let revoked = 0;
  const endReports = [];
  let request;
  let streamController;
  const body = new ReadableStream({
    start(controller) {
      streamController = controller;
    }
  });
  const video = new TestVideo();
  globalThis.MediaSource = TestMediaSource;
  globalThis.fetch = async (src, options) => {
    request = { src, ...options };
    options.signal.addEventListener('abort', () => {
      streamController.error(options.signal.reason);
    });
    return new Response(body, {
      status,
      headers: { 'Content-Type': contentType }
    });
  };
  URL.createObjectURL = (value) => {
    source = value;
    if (open) {
      queueMicrotask(() => source.dispatchEvent(new Event('sourceopen')));
    }
    return 'blob:test';
  };
  URL.revokeObjectURL = (url) => {
    assert.equal(url, 'blob:test');
    revoked++;
  };
  const stop = startHttpMp4Stream(video, 'https://camera/stream', (retry) => {
    endReports.push(retry);
  });

  return {
    stop,
    video,
    body,
    get source() {
      return source;
    },
    get request() {
      return request;
    },
    get revoked() {
      return revoked;
    },
    get ended() {
      return endReports.length;
    },
    endReports,
    push: (...bytes) => streamController.enqueue(Uint8Array.from(bytes)),
    finish: () => streamController.close(),
    fail: () => streamController.error(new Error('Connection lost'))
  };
}

afterEach(() => {
  globalThis.fetch = originals.fetch;
  globalThis.MediaSource = originals.MediaSource;
  URL.createObjectURL = originals.createObjectURL;
  URL.revokeObjectURL = originals.revokeObjectURL;
});

test('uses the response MIME type and appends data in order before ending', async () => {
  const stream = setup();
  stream.push(1, 2);
  stream.push(3, 4);
  stream.finish();
  await until(() => stream.ended === 1);
  assert.equal(stream.request.credentials, 'include');
  assert.deepEqual(stream.source.buffer.operations, [
    ['append', 1, 2],
    ['append', 3, 4]
  ]);
  assert.equal(stream.source.ended, true);
  assert.deepEqual(stream.endReports, [true]);
  assert.equal(stream.body.locked, false);
  assert.equal(stream.revoked, 1);
  stream.stop();
  assert.equal(stream.video.src, undefined);
  assert.equal(stream.revoked, 1);
});

test('stopping before MediaSource opens revokes the URL and cancels the request', async () => {
  const stream = setup({ open: false });
  await until(() => stream.video.src === 'blob:test');
  stream.stop();
  stream.stop();
  await until(() => !stream.body.locked);
  stream.source.dispatchEvent(new Event('sourceopen'));
  assert.equal(stream.request.signal.aborted, true);
  assert.equal(stream.video.src, undefined);
  assert.equal(stream.revoked, 1);
  assert.equal(stream.ended, 0);
});

test('stopping during an append does not start another append or retry', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.source.buffer.complete = false;
  stream.push(1);
  stream.push(2);
  await until(() => stream.source.buffer.updating);
  stream.stop();
  await until(() => !stream.body.locked);
  stream.source.buffer.finish();
  assert.deepEqual(stream.source.buffer.operations, [['append', 1]]);
  assert.equal(stream.ended, 0);
});

test('rejects unsuccessful and unsupported responses without retrying', async () => {
  for (const options of [
    { status: 401 },
    { contentType: 'text/html' },
    { contentType: 'video/mp4; codecs="unsupported"' }
  ]) {
    const stream = setup(options);
    await until(() => stream.request.signal.aborted);
    assert.equal(stream.source, undefined);
    assert.deepEqual(stream.endReports, [false]);
    assert.equal(stream.body.locked, false);
  }
});

test('signals a connection failure once and releases the stream', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.fail();
  await until(() => stream.ended === 1 && !stream.body.locked);
  assert.equal(stream.request.signal.aborted, true);
  assert.equal(stream.video.src, undefined);
  assert.deepEqual(stream.endReports, [true]);
  stream.stop();
  assert.equal(stream.ended, 1);
});

test('waits for playback to advance and removes old buffered media', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.source.buffer.ranges = [[0, 25]];
  stream.push(1);
  await until(() => stream.source.buffer.operations.length === 1);
  stream.push(2);
  assert.deepEqual(stream.source.buffer.operations, [['append', 1]]);
  stream.video.currentTime = 15;
  stream.video.dispatchEvent(new Event('timeupdate'));
  await until(() => stream.source.buffer.operations.length === 3);
  assert.deepEqual(stream.source.buffer.operations, [
    ['append', 1],
    ['remove', 0, 5],
    ['append', 2]
  ]);
  stream.stop();
  await until(() => !stream.body.locked);
});

test('reclaims older played media and retries a quota-limited append once', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.video.currentTime = 15;
  stream.source.buffer.ranges = [[5, 20]];
  stream.source.buffer.quotaFailures = 1;
  stream.push(1);
  await until(() => stream.source.buffer.operations.length === 2);
  assert.deepEqual(stream.source.buffer.operations, [
    ['remove', 0, 10],
    ['append', 1]
  ]);
  assert.equal(stream.ended, 0);
  stream.stop();
  await until(() => !stream.body.locked);
});

test('reports quota exhaustion without retrying the connection', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.video.currentTime = 15;
  stream.source.buffer.ranges = [[5, 20]];
  stream.source.buffer.quotaFailures = 2;
  stream.push(1);
  await until(() => stream.ended === 1 && !stream.body.locked);
  assert.deepEqual(stream.source.buffer.operations, [['remove', 0, 10]]);
  assert.deepEqual(stream.endReports, [false]);
  assert.equal(stream.video.src, undefined);
});

test('does not remove unplayed media when quota is exhausted', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.source.buffer.ranges = [[0, 4]];
  stream.source.buffer.quotaFailures = 1;
  stream.push(1);
  await until(() => stream.ended === 1 && !stream.body.locked);
  assert.deepEqual(stream.source.buffer.operations, []);
  assert.deepEqual(stream.endReports, [false]);
});

test('reports a decoding error once without retrying', async () => {
  const stream = setup();
  await until(() => stream.revoked === 1);
  stream.video.dispatchEvent(new Event('error'));
  stream.video.dispatchEvent(new Event('error'));
  await until(() => stream.ended === 1 && !stream.body.locked);
  assert.deepEqual(stream.endReports, [false]);
  assert.equal(stream.video.src, undefined);
});

test('uses the AV1 response MIME type with the same MP4 stream helper', async () => {
  const stream = setup({ contentType: av1Mime });
  stream.push(1, 2);
  stream.finish();
  await until(() => stream.ended === 1);
  assert.equal(stream.source.mime, av1Mime);
  assert.deepEqual(stream.source.buffer.operations, [['append', 1, 2]]);
  assert.deepEqual(stream.endReports, [true]);
  stream.stop();
});
