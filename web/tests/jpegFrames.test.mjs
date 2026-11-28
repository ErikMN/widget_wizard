import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseRtpPacket;
let createJpegFrameAssembler;
let makeQuantizationTables;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ parseRtpPacket } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/rtp.ts'
  ));
  ({ createJpegFrameAssembler } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/jpeg/jpegFrame.ts'
  ));
  ({ makeQuantizationTables } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/jpeg/jpegHeaders.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const assembler = (frameSize) =>
  createJpegFrameAssembler({ payloadType: 26, encoding: 'JPEG', frameSize });

const packet = (scan, options = {}) => {
  const {
    offset = 0, sequence = 1, timestamp = 100, source = 1,
    marker = true, type = 1, quality = 50, width = 4, height = 2,
    typeSpecific = 0, payloadType = 26, restartInterval = 1,
    tables = bytes(), precision = 0
  } = options;
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header[0] = 0x80;
  header[1] = payloadType | (marker ? 0x80 : 0);
  view.setUint16(2, sequence);
  view.setUint32(4, timestamp);
  view.setUint32(8, source);
  const jpeg = bytes(typeSpecific, offset >> 16, offset >> 8, offset,
    type, quality, width, height);
  const restart = type >= 64 ? bytes(restartInterval >> 8, restartInterval, 0xff, 0xff) : bytes();
  const quantization = quality >= 128 && offset === 0
    ? bytes(0, precision, tables.length >> 8, tables.length, ...tables)
    : bytes();
  const data = new Uint8Array(header.length + jpeg.length + restart.length + quantization.length + scan.length);
  let position = 0;
  for (const part of [header, jpeg, restart, quantization, scan]) {
    data.set(part, position);
    position += part.length;
  }
  return parseRtpPacket(data);
};

/* Inspect the JPEG segments independently of the header writer. */
const inspect = (data) => {
  assert.deepEqual(data.subarray(0, 2), bytes(0xff, 0xd8));
  const segments = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  while (offset < data.length) {
    assert.equal(data[offset], 0xff);
    const marker = data[offset + 1];
    const length = view.getUint16(offset + 2);
    assert.ok(length >= 2 && offset + 2 + length <= data.length);
    segments.push({ marker, body: data.subarray(offset + 4, offset + 2 + length) });
    offset += 2 + length;
    if (marker === 0xda) {
      return { segments, scan: data.subarray(offset) };
    }
  }
  assert.fail('Missing JPEG scan header');
};

/* Generated with Pillow using a 32 by 16 RGB pattern, quality 50, standard
 * Huffman tables and both sampling modes, with and without restart markers.
 */
const fixtures = [
  [0, '5y00/pxWvDY7Yycc9BXXSrclKUuyZpSldou21gFGSAAOSTUN4nn4VAfLHA9z61yYebVKUuyKzDEqFNU09ZfkW7TT+nFaYseFXHvXLVrcuGl5nLQlqRXzxQKIzMkak4dmIAz6Z/OsubVNOhcKrtMynBEa/rk4BH0q405vCWit2v8AP9DjmquMxL5PhWl+nn+J'],
  [1, '5y00/pxWvDY7Yycc9BWlaaf04rTFjwq496PrfsqEpXCjUu0Y9tYBRkgADkk1DeJ5+FQHyxwPc+tbN88UCiMzJGpOHZiAM+mfzrLm1TToXCq7TMpwRGv65OAR9KzpTnHDuaWr0XzMsVi6leXsaKuluQ=='],
  [64, '5y00/pxWvDY7Yycc9BXXSrclKUuyZpSldo//0FtrAKMkAAckmobxPPwqA+WOB7n1ow82qUpdkbZhiVCmqaesvyP/0ZrTT+nFaYseFXHvXLVrcuGl5mdCWp//0tS+eKBRGZkjUnDsxAGfTP51lzapp0LhVdpmU4IjX9cnAI+lYRpzeEtFbtf5/oefNVcZiXyfCtL9PP8AEw=='],
  [65, '5y00/pxWvDY7Yycc9BWlaaf04rTFjwq496PrfsqEpXCjUu0f/9BbawCjJAAHJJqG8Tz8KgPljge59a2b54oFEZmSNScOzEAZ9M/nWXNqmnQuFV2mZTgiNf1ycAj6VnSnOOHc0tXovmZYrF1K8vY0VdLc']
];

test('reconstructs both sampling modes with and without restart markers', () => {
  for (const [type, encoded] of fixtures) {
    const scan = Uint8Array.from(Buffer.from(encoded, 'base64'));
    const push = assembler();
    assert.equal(push(packet(scan.subarray(0, 13), { type, marker: false })), undefined);
    const frame = push(packet(scan.subarray(13), { type, offset: 13, sequence: 2 }));
    assert.equal(frame.width, 32);
    assert.equal(frame.height, 16);
    assert.equal(frame.timestamp, 100);
    const image = inspect(frame.data);
    assert.deepEqual(image.scan, bytes(...scan, 0xff, 0xd9));
    assert.deepEqual(image.segments.map(({ marker }) => marker), [
      0xdb, 0xdb, ...(type >= 64 ? [0xdd] : []), 0xc0,
      0xc4, 0xc4, 0xc4, 0xc4, 0xda
    ]);
    const sof = image.segments.find(({ marker }) => marker === 0xc0).body;
    assert.deepEqual(sof, bytes(8, 0, 16, 0, 32, 3, 1,
      type === 0 || type === 64 ? 0x21 : 0x22, 0,
      2, 0x11, 1, 3, 0x11, 1));
    if (type >= 64) {
      assert.deepEqual(image.segments.find(({ marker }) => marker === 0xdd).body, bytes(0, 1));
    }
  }
});

test('generates quantization tables in JPEG coefficient order', () => {
  const standard = makeQuantizationTables(50).data;
  assert.deepEqual(standard.subarray(0, 8), bytes(16, 11, 12, 14, 12, 10, 16, 14));
  assert.deepEqual(standard.subarray(64, 72), bytes(17, 18, 18, 24, 21, 24, 47, 26));
  assert.equal(makeQuantizationTables(25).data[0], 32);
  assert.equal(makeQuantizationTables(75).data[0], 8);
  assert.equal(makeQuantizationTables(1).data[0], 255);
  assert.equal(makeQuantizationTables(99).data[0], 1);
});

test('uses inline tables and reuses them only within the same source', () => {
  const tables = new Uint8Array(128).fill(7);
  const push = assembler();
  assert.equal(push(packet(bytes(1), { quality: 128 })), undefined);
  const first = push(packet(bytes(1), { quality: 128, tables }));
  const next = push(packet(bytes(1), { quality: 128, timestamp: 101 }));
  assert.deepEqual(next.data, first.data);
  assert.deepEqual(inspect(first.data).segments[0].body, bytes(0, ...tables.subarray(0, 64)));
  assert.equal(push(packet(bytes(1), { quality: 128, source: 2 })), undefined);
  assert.equal(assembler()(packet(bytes(1), { quality: 128 })), undefined);
});

test('requires new tables for dynamic Q and handles mixed precision tables', () => {
  const push = assembler();
  const tables = new Uint8Array(192).fill(1);
  const first = push(packet(bytes(1), { quality: 255, precision: 1, tables }));
  const { segments } = inspect(first.data);
  assert.equal(segments[0].body[0], 0x10);
  assert.equal(segments[0].body.length, 129);
  assert.equal(segments[1].body[0], 1);
  assert.equal(segments[1].body.length, 65);
  assert.equal(segments[2].marker, 0xc1);
  assert.equal(push(packet(bytes(1), { quality: 255 })), undefined);
  tables.fill(2);
  const next = push(packet(bytes(1), { quality: 255, precision: 2, tables }));
  const updated = inspect(next.data).segments;
  assert.equal(updated[0].body[0], 0);
  assert.equal(updated[1].body[0], 0x11);
  assert.equal(updated[1].body.length, 129);
});

test('rejects zero quantization coefficients without poisoning the table cache', () => {
  for (const precision of [0, 1, 2, 3]) {
    const lumaSize = precision & 1 ? 128 : 64;
    const chromaSize = precision & 2 ? 128 : 64;
    const tables = new Uint8Array(lumaSize + chromaSize);
    const view = new DataView(tables.buffer);
    const locations = [];
    let offset = 0;
    for (const size of [lumaSize, chromaSize]) {
      const wide = size === 128;
      const step = wide ? 2 : 1;
      locations.push({ offset, step }, { offset: offset + size - step, step });
      for (let i = 0; i < 64; i++) {
        if (wide) {
          /* Both zero high bytes and zero low bytes can encode valid values. */
          view.setUint16(offset, i % 2 === 0 ? 1 : 256);
        } else {
          tables[offset] = i + 1;
        }
        offset += step;
      }
    }
    for (const { offset, step } of locations) {
      const invalid = tables.slice();
      invalid.fill(0, offset, offset + step);
      const push = assembler();
      const options = { quality: 128, precision };
      assert.equal(push(packet(bytes(1), { ...options, tables: invalid })), undefined);
      assert.equal(push(packet(bytes(1), options)), undefined);
      const valid = push(packet(bytes(1), { ...options, tables }));
      assert.ok(valid);
      assert.equal(push(packet(bytes(1), { ...options, tables: invalid })), undefined);
      assert.deepEqual(push(packet(bytes(1), options)).data, valid.data);
      assert.equal(push(packet(bytes(1), { quality: 255, precision, tables: invalid })), undefined);
    }
  }
});

test('uses SDP dimensions only for zero dimensions in the JPEG header', () => {
  const push = assembler({ width: 3840, height: 2160 });
  const large = push(packet(bytes(1), { width: 0, height: 0 }));
  assert.equal(large.width, 3840);
  assert.equal(large.height, 2160);
  assert.deepEqual(inspect(large.data).segments[2].body.subarray(1, 5), bytes(8, 112, 15, 0));
  const mixed = push(packet(bytes(1), { width: 0, height: 2 }));
  assert.equal(mixed.width, 3840);
  assert.equal(mixed.height, 16);
  assert.equal(assembler()(packet(bytes(1), { width: 0 })), undefined);
});

test('preserves an existing end marker even when split across packets', () => {
  const push = assembler();
  push(packet(bytes(3, 0xff), { marker: false, sequence: 65535 }));
  const frame = push(packet(bytes(0xd9), { offset: 2, sequence: 0 }));
  assert.deepEqual(inspect(frame.data).scan, bytes(3, 0xff, 0xd9));
  assert.deepEqual(inspect(push(packet(bytes(3, 0xff, 0xd9))).data).scan, bytes(3, 0xff, 0xd9));
});

test('discards gaps, overlaps, changed timestamps and inconsistent headers', () => {
  for (const options of [
    { offset: 3 }, { offset: 1 }, { sequence: 3 }, { timestamp: 101 },
    { type: 0 }, { quality: 51 }, { width: 5 }, { height: 3 },
    { typeSpecific: 1 }, { source: 2 }
  ]) {
    const push = assembler();
    push(packet(bytes(1, 2), { marker: false }));
    assert.equal(push(packet(bytes(3), { offset: 2, sequence: 2, ...options })), undefined);
    const recovered = push(packet(bytes(9), { timestamp: 102 }));
    assert.deepEqual(inspect(recovered.data).scan, bytes(9, 0xff, 0xd9));
  }
});

test('starts a new frame when the previous marker was missing', () => {
  const push = assembler();
  push(packet(bytes(1, 2), { marker: false }));
  const frame = push(packet(bytes(4), { sequence: 3, timestamp: 200 }));
  assert.deepEqual(inspect(frame.data).scan, bytes(4, 0xff, 0xd9));
  assert.equal(frame.timestamp, 200);
});

test('ignores other payload types and cannot complete a frame without its start', () => {
  const push = assembler();
  assert.equal(push(packet(bytes(4), { offset: 1 })), undefined);
  push(packet(bytes(1), { marker: false }));
  assert.equal(push(packet(bytes(9), { payloadType: 97 })), undefined);
  const frame = push(packet(bytes(2), { offset: 1, sequence: 2 }));
  assert.deepEqual(inspect(frame.data).scan, bytes(1, 2, 0xff, 0xd9));
});

test('discards malformed JPEG headers and reserved types or quality values', () => {
  const push = assembler();
  for (const options of [
    { type: 2 }, { type: 128 }, { quality: 0 }, { quality: 100 },
    { quality: 127 }, { type: 64, restartInterval: 0 },
    { quality: 128, tables: bytes(1) }, { quality: 255 }
  ]) {
    assert.equal(push(packet(bytes(1), options)), undefined);
  }
  const first = packet(bytes(1), { quality: 128, tables: new Uint8Array(128).fill(1) });
  for (const length of [0, 7, 8, 11, 20]) {
    assert.equal(push({ ...first, payload: first.payload.subarray(0, length) }), undefined);
  }
  const restart = packet(bytes(1), { type: 65 });
  assert.equal(push({ ...restart, payload: restart.payload.subarray(0, 11) }), undefined);
  assert.equal(push(packet(bytes())), undefined);
});

test('rejects inconsistent restart intervals', () => {
  const push = assembler();
  push(packet(bytes(1), { type: 64, marker: false }));
  assert.equal(push(packet(bytes(2), { type: 64, offset: 1, sequence: 2, restartInterval: 2 })), undefined);
  assert.ok(push(packet(bytes(3))));
});

test('enforces the maximum scan size while assembling a frame', () => {
  const limit = 2 ** 24;
  const chunk = new Uint8Array(32768);
  for (const extra of [0, 1]) {
    const push = assembler();
    let offset = 0;
    let sequence = 0;
    while (offset < limit - chunk.length) {
      assert.equal(push(packet(chunk, { offset, sequence, marker: false })), undefined);
      offset += chunk.length;
      sequence++;
    }
    const frame = push(packet(new Uint8Array(chunk.length + extra), { offset, sequence }));
    if (extra === 0) {
      assert.equal(inspect(frame.data).scan.length, limit + 2);
    } else {
      assert.equal(frame, undefined);
    }
    assert.ok(push(packet(bytes(3), { timestamp: 200 })));
  }
});

test('enforces the maximum retained fragment count', () => {
  const limit = 65536;
  for (const extra of [0, 1]) {
    const push = assembler();
    for (let i = 0; i < limit + extra - 1; i++) {
      assert.equal(push(packet(bytes(1), { offset: i, sequence: i & 0xffff, marker: false })), undefined);
    }
    const offset = limit + extra - 1;
    const frame = push(packet(bytes(2), { offset, sequence: offset & 0xffff }));
    if (extra === 0) {
      assert.equal(inspect(frame.data).scan.length, limit + 2);
    } else {
      assert.equal(frame, undefined);
    }
    assert.ok(push(packet(bytes(3), { timestamp: 200 })));
  }
});

test('keeps completed frames and table caches independent', () => {
  const push = assembler();
  const tables = new Uint8Array(128).fill(7);
  const input = packet(bytes(1), { quality: 128, tables });
  const first = push(input);
  input.payload.fill(0);
  const next = push(packet(bytes(2), { quality: 128 }));
  assert.deepEqual(inspect(first.data).scan, bytes(1, 0xff, 0xd9));
  assert.deepEqual(inspect(next.data).segments[0].body, bytes(0, ...tables.subarray(0, 64)));
});

test('bounds retained packet storage even when scan data is small', () => {
  const push = assembler();
  const first = packet(bytes(1), { marker: false });
  const storage = new Uint8Array(32 * 1024 * 1024);
  storage.set(first.payload);
  push({ ...first, payload: storage.subarray(0, first.payload.length) });
  assert.equal(push(packet(bytes(2), { offset: 1, sequence: 2 })), undefined);
  assert.ok(push(packet(bytes(3))));
});
