import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let readSlicePrefix;
let parseH264Format;
let createH264ParameterSetStore;
let parseH264SliceHeader;
let startsNewH264Picture;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ readSlicePrefix } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Bits.ts'
  ));
  ({ parseH264Format } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Format.ts'
  ));
  ({ createH264ParameterSetStore } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Configuration.ts'
  ));
  ({ parseH264SliceHeader, startsNewH264Picture } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264SliceHeader.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const decode = (value) => Uint8Array.from(Buffer.from(value, 'base64'));
const encode = (value) => Buffer.from(value).toString('base64');
const bits = (value, width) => value.toString(2).padStart(width, '0');
const ue = (value) => {
  const code = (value + 1).toString(2);
  return '0'.repeat(code.length - 1) + code;
};
const se = (value) => ue(value <= 0 ? -2 * value : 2 * value - 1);
const nal = (header, syntax) => {
  let data = syntax + '1';
  data = data.padEnd(Math.ceil(data.length / 8) * 8, '0');
  const output = [header];
  let zeros = 0;
  for (let i = 0; i < data.length; i += 8) {
    const value = parseInt(data.slice(i, i + 8), 2);
    if (zeros === 2 && value <= 3) {
      output.push(3);
      zeros = 0;
    }
    output.push(value);
    zeros = value === 0 ? zeros + 1 : 0;
  }
  return bytes(...output);
};

/* Minimal synthetic SPS and PPS for testing the picture identification fields.
 * The slice fixtures below contain a header prefix, not coded macroblocks.
 */
const sps = (options = {}) => {
  const {
    id = 0, depth = 0, separate = false, poc = 0, alwaysZero = false,
    interlaced = false, mbaff = false, widthMbs = 4, heightUnits = 3, refs = 1
  } = options;
  const chroma = separate ? ue(3) + '1' : ue(1);
  let syntax = bits(100, 8) + bits(0, 8) + bits(31, 8) + ue(id) + chroma +
    ue(depth) + ue(depth) + '00' + ue(0) + ue(poc);
  if (poc === 0) {
    syntax += ue(0);
  } else if (poc === 1) {
    syntax += bits(Number(alwaysZero), 1) + se(0) + se(0) + ue(0);
  }
  syntax += ue(refs) + '0' + ue(widthMbs - 1) + ue(heightUnits - 1) +
    (interlaced ? '0' + bits(Number(mbaff), 1) : '1') + '100';
  return nal(0x67, syntax);
};
const pps = (options = {}) => {
  const { id = 0, spsId = 0, bottom = false, redundant = false,
    qp = 0, groups = 1, groupMap = '' } = options;
  return nal(0x68, ue(id) + ue(spsId) + '0' + bits(Number(bottom), 1) +
    ue(groups - 1) + groupMap + ue(0) + ue(0) + '000' +
    se(qp) + se(0) + se(0) + '10' + bits(Number(redundant), 1));
};
const storeFor = (...nals) => createH264ParameterSetStore(parseH264Format(
  nals.length ? `sprop-parameter-sets=${nals.map(encode).join(',')}` : undefined
));
const slicePrefix = (configuration, options = {}) => {
  const { sps: { info: s }, pps: { info: p } } = configuration;
  const {
    first = 0, type = 0, ppsId = p.id, colour = 0, frame = 0,
    field = false, bottom = false, idr = false, idrId = 0,
    pocLsb = 0, deltaBottom = 0, delta0 = 0, delta1 = 0, redundant = 0
  } = options;
  let syntax = ue(first) + ue(type) + ue(ppsId);
  if (s.separateColourPlane) {
    syntax += bits(colour, 2);
  }
  syntax += bits(frame, s.log2MaxFrameNum);
  if (!s.frameMbsOnly) {
    syntax += bits(Number(field), 1);
    if (field) {
      syntax += bits(Number(bottom), 1);
    }
  }
  if (idr) {
    syntax += ue(idrId);
  }
  if (s.picOrderCntType === 0) {
    syntax += bits(pocLsb, s.log2MaxPicOrderCntLsb);
    if (p.bottomFieldPicOrderInFramePresent && !field) {
      syntax += se(deltaBottom);
    }
  } else if (s.picOrderCntType === 1 && !s.deltaPicOrderAlwaysZero) {
    syntax += se(delta0);
    if (p.bottomFieldPicOrderInFramePresent && !field) {
      syntax += se(delta1);
    }
  }
  if (p.redundantPicCntPresent) {
    syntax += ue(redundant);
  }
  return syntax;
};
const slice = (configuration, options = {}) => {
  const { idr = false, refIdc = idr ? 3 : 2, nalType = idr ? 5 : 1 } = options;
  return nal((refIdc << 5) | nalType, slicePrefix(configuration, options) + '1');
};

test('selects configurations by slice PPS identifier and accepts late SPS or PPS', () => {
  const store = storeFor(sps({ id: 3 }), pps({ id: 4, spsId: 3 }), pps({ id: 7, spsId: 9 }));
  assert.equal(store.resolve(0), undefined);
  assert.equal(store.resolve(7), undefined);
  const first = store.resolve(4);
  assert.equal(first.sps.info.id, 3);
  assert.equal(parseH264SliceHeader(slice(first, { ppsId: 7 }), store.resolve), undefined);
  store.update(sps({ id: 9, widthMbs: 5 }));
  const second = store.resolve(7);
  const parsed = parseH264SliceHeader(slice(second), store.resolve);
  assert.equal(parsed.configuration.sps.info.id, 9);
  assert.equal(parsed.configuration.sps.info.width, 80);
  assert.equal(parsed.configuration.pps.info.id, 7);
  store.update(pps({ id: 8, spsId: 3 }));
  assert.equal(store.resolve(8).sps, first.sps);
});

test('owns parameter set bytes, retains unchanged entries and rejects malformed replacements', () => {
  const originalSps = sps();
  const originalPps = pps();
  const format = parseH264Format(`sprop-parameter-sets=${encode(originalSps)},${encode(originalPps)}`);
  const store = createH264ParameterSetStore(format);
  const first = store.resolve(0);
  format.sequenceParameterSets[0].nal.fill(0);
  format.pictureParameterSets[0].nal.fill(0);
  assert.deepEqual(first.sps.nal, originalSps);
  assert.deepEqual(first.pps.nal, originalPps);
  store.update(originalSps);
  store.update(originalPps);
  assert.equal(store.resolve(0).sps, first.sps);
  assert.equal(store.resolve(0).pps, first.pps);
  assert.throws(() => store.update(bytes(0x68, 0xcc)));
  assert.throws(() => store.update(bytes(0x67, 1)));
  assert.throws(() => store.update(bytes(0x65, 1)), /SPS or PPS/);
  assert.equal(store.resolve(0).sps, first.sps);
  assert.equal(store.resolve(0).pps, first.pps);
  const replacement = sps({ widthMbs: 8 });
  store.update(replacement);
  replacement.fill(0);
  assert.equal(store.resolve(0).sps.info.width, 128);
  assert.notEqual(store.resolve(0).sps, first.sps);
  assert.equal(first.sps.info.width, 64);
  store.update(pps({ bottom: true }));
  assert.notEqual(store.resolve(0).pps, first.pps);
  assert.equal(first.pps.info.bottomFieldPicOrderInFramePresent, false);
});

test('validates SPS-dependent quantization bounds when either set arrives first', () => {
  const store = storeFor(sps(), pps());
  store.update(pps({ qp: -38 }));
  assert.throws(() => store.resolve(0), /quantization/);
  store.update(sps({ depth: 2 }));
  assert.equal(store.resolve(0).pps.info.picInitQpMinus26, -38);
  store.update(pps({ qp: -39 }));
  assert.throws(() => store.resolve(0), /quantization/);
  store.update(pps({ qp: -26 }));
  store.update(sps());
  assert.equal(store.resolve(0).pps.info.picInitQpMinus26, -26);
});

test('validates slice group maps against the SPS dimensions', () => {
  const store = storeFor(sps());
  for (const groupMap of [
    ue(0) + ue(11) + ue(0), ue(2) + ue(0) + ue(11),
    ue(3) + '0' + ue(11), ue(6) + ue(11) + '01'.repeat(6)
  ]) {
    store.update(pps({ groups: 2, groupMap }));
    assert.ok(store.resolve(0));
  }
  for (const groupMap of [
    ue(0) + ue(12) + ue(0), ue(2) + ue(0) + ue(12),
    ue(2) + ue(3) + ue(4), ue(3) + '0' + ue(12),
    ue(6) + ue(10) + '01'.repeat(5) + '0'
  ]) {
    store.update(pps({ groups: 2, groupMap }));
    assert.throws(() => store.resolve(0), /slice group/);
  }
  store.update(sps({ interlaced: true }));
  store.update(pps({ groups: 2, groupMap: ue(6) + ue(11) + '01'.repeat(6) }));
  assert.ok(store.resolve(0));
});

/* Six pictures encoded with libx264, two slices per picture, High profile
 * and B-frames. The expected header fields were checked with trace_headers.
 */
const realPictures = [
  ['ZYiEABD//ubA+ZZVDVd//Wk9K/jNIvk=', 'ZWIhAAQ//ubA+ZZVDVd//Wk9K/jNIvk=', 0, 0, 2, 3],
  ['QZojbEP//rg=', 'QWaI2xD//rg=', 1, 6, 0, 2],
  ['QZ5BeIb/ioE=', 'QWeQXiG/ioE=', 2, 2, 1, 2],
  ['AZ5iakN/ioA=', 'AWeYmpDfioA=', 3, 4, 1, 0],
  ['QZplSahBaJlMFPDf/rk=', 'QWaZUmoQWiZTBTw3//65', 3, 10, 0, 2],
  ['AZ6EakN/ioE=', 'AWehGpDfioE=', 4, 8, 1, 0]
];

test('identifies real multi-slice pictures in decoding order including B-frames', () => {
  const store = storeFor(decode('Z2QACqzZSWwEQAAAAwBAAAAFA8SJZYA='), decode('aOvjyyLA'));
  let previous;
  for (const [a, b, frame, poc, type, refIdc] of realPictures) {
    const first = parseH264SliceHeader(decode(a), store.resolve);
    const last = parseH264SliceHeader(decode(b), store.resolve);
    for (const [header, address] of [[first, 0], [last, 2]]) {
      assert.equal(header.firstMbInSlice, address);
      assert.equal(header.frameNum, frame);
      assert.equal(header.picOrderCntLsb, poc);
      assert.equal(header.sliceType, type);
      assert.equal(header.nalRefIdc, refIdc);
      assert.equal(header.isIdr, frame === 0);
      assert.equal(header.configuration.sps.info.width, 32);
    }
    assert.equal(startsNewH264Picture(first, last), false);
    if (previous) {
      assert.equal(startsNewH264Picture(previous, first), true);
    }
    previous = last;
  }
});

test('reads field flags, colour planes and both picture order delta fields', () => {
  const store = storeFor(sps({ interlaced: true, separate: true, poc: 1 }), pps({ bottom: true, redundant: true }));
  const config = store.resolve(0);
  const frame = parseH264SliceHeader(slice(config, {
    first: 5, frame: 3, colour: 2, delta0: -9, delta1: 6, redundant: 127
  }), store.resolve);
  assert.equal(frame.fieldPic, false);
  assert.equal(frame.colourPlaneId, 2);
  assert.equal(frame.deltaPicOrderCnt0, -9);
  assert.equal(frame.deltaPicOrderCnt1, 6);
  assert.equal(frame.redundantPicCnt, 127);
  const field = parseH264SliceHeader(slice(config, {
    frame: 3, colour: 1, field: true, bottom: true, delta0: 7
  }), store.resolve);
  assert.equal(field.fieldPic, true);
  assert.equal(field.bottomField, true);
  assert.equal(field.deltaPicOrderCnt0, 7);
  assert.equal(field.deltaPicOrderCnt1, 0);
  assert.equal(field.redundantPicCnt, 0);
  assert.throws(() => startsNewH264Picture(frame, field), /primary slices/);
});

test('handles inferred picture order fields for POC types zero, one and two', () => {
  for (const [options, expected] of [
    [{ poc: 0 }, { picOrderCntLsb: 12, deltaPicOrderCntBottom: -3 }],
    [{ poc: 1, alwaysZero: true }, { picOrderCntLsb: undefined, deltaPicOrderCntBottom: 0 }],
    [{ poc: 2 }, { picOrderCntLsb: undefined, deltaPicOrderCntBottom: 0 }]
  ]) {
    const store = storeFor(sps(options), pps({ bottom: true }));
    const header = parseH264SliceHeader(slice(store.resolve(0), { pocLsb: 12, deltaBottom: -3 }), store.resolve);
    assert.equal(header.picOrderCntLsb, expected.picOrderCntLsb);
    assert.equal(header.deltaPicOrderCntBottom, expected.deltaPicOrderCntBottom);
    assert.equal(header.deltaPicOrderCnt0, 0);
    assert.equal(header.deltaPicOrderCnt1, 0);
  }
});

test('compares all primary picture boundary fields without relying on first macroblock order', () => {
  const store = storeFor(sps({ interlaced: true }), pps({ bottom: true }), pps({ id: 1, bottom: true }));
  const a = store.resolve(0);
  const b = store.resolve(1);
  const read = (options, config = a) => parseH264SliceHeader(slice(config, options), store.resolve);
  const first = read({ frame: 3, first: 2, pocLsb: 4 });
  for (const options of [{ first: 0 }, { first: 7 }, { refIdc: 1 }, { type: 5 }]) {
    assert.equal(startsNewH264Picture(first, read({ frame: 3, pocLsb: 4, ...options })), false);
  }
  for (const options of [{ frame: 4 }, { pocLsb: 3 }, { deltaBottom: -1 }, { refIdc: 0 }, { field: true }]) {
    assert.equal(startsNewH264Picture(first, read({ frame: 3, pocLsb: 4, ...options })), true);
  }
  assert.equal(startsNewH264Picture(first, read({ frame: 3, pocLsb: 4 }, b)), true);
  assert.equal(startsNewH264Picture(read({ field: true }), read({ field: true, bottom: true })), true);
  const idr = read({ idr: true, type: 2 });
  assert.equal(startsNewH264Picture(idr, read({ type: 2 })), true);
  assert.equal(startsNewH264Picture(idr, read({ idr: true, type: 2, idrId: 1 })), true);
  assert.equal(startsNewH264Picture(idr, read({ idr: true, type: 7, first: 2 })), false);
  const poc1 = storeFor(sps({ poc: 1, separate: true }), pps({ bottom: true }));
  const readPoc1 = (options) => parseH264SliceHeader(slice(poc1.resolve(0), options), poc1.resolve);
  const same = readPoc1({ delta0: -1, delta1: 2, colour: 1 });
  assert.equal(startsNewH264Picture(same, readPoc1({ delta0: -1, delta1: 2, colour: 2 })), false);
  assert.equal(startsNewH264Picture(same, readPoc1({ delta0: 0, delta1: 2 })), true);
  assert.equal(startsNewH264Picture(same, readPoc1({ delta0: -1, delta1: 3 })), true);
});

test('bounds macroblock addresses for frames, fields and MBAFF pictures', () => {
  for (const [options, field, count] of [
    [{}, false, 12], [{ interlaced: true }, false, 24],
    [{ interlaced: true }, true, 12], [{ interlaced: true, mbaff: true }, false, 12]
  ]) {
    const store = storeFor(sps(options), pps());
    const config = store.resolve(0);
    assert.equal(parseH264SliceHeader(slice(config, { first: count - 1, field }), store.resolve).firstMbInSlice, count - 1);
    assert.throws(() => parseH264SliceHeader(slice(config, { first: count, field }), store.resolve), /macroblock/);
  }
});

test('rejects truncated or invalid picture identification fields', () => {
  const store = storeFor(sps({ poc: 1, separate: true, interlaced: true }), pps({ bottom: true, redundant: true }));
  const config = store.resolve(0);
  const syntax = slicePrefix(config, { idr: true, type: 7, delta0: -3, delta1: 4, redundant: 1 });
  for (let i = 0; i <= syntax.length; i++) {
    assert.throws(() => parseH264SliceHeader(nal(0x65, syntax.slice(0, i)), store.resolve));
  }
  for (const options of [
    { type: 10 }, { colour: 3 }, { idr: true, type: 0 }, { idr: true, type: 2, frame: 1 },
    { idr: true, type: 2, idrId: 65536 }, { redundant: 128 }, { delta0: 2147483648 }
  ]) {
    assert.throws(() => parseH264SliceHeader(slice(config, options), store.resolve));
  }
  for (const header of [0xe5, 0x05, 0x67, 0x63, 0x64, 0x74]) {
    assert.throws(() => parseH264SliceHeader(nal(header, syntax + '1'), store.resolve), /slice/);
  }
  const intra = storeFor(sps({ refs: 0 }), pps());
  assert.throws(() => parseH264SliceHeader(slice(intra.resolve(0)), intra.resolve), /intra/);
  const partA = parseH264SliceHeader(slice(config, { nalType: 2 }), store.resolve);
  assert.equal(partA.isIdr, false);
});

test('reads maximum supported picture order deltas without copying slice payloads', () => {
  const store = storeFor(sps({ poc: 1, separate: true, interlaced: true }), pps({ id: 255, bottom: true, redundant: true }));
  const config = store.resolve(255);
  const options = { idr: true, type: 7, idrId: 65535, delta0: 2147483647, delta1: -2147483647, redundant: 127 };
  const small = slice(config, options);
  const large = new Uint8Array(16 * 1024 * 1024).fill(0xff);
  large.set(small);
  assert.equal(readSlicePrefix(large).remaining, 288);
  for (const data of [small, large]) {
    const header = parseH264SliceHeader(data, store.resolve);
    assert.equal(header.idrPicId, 65535);
    assert.equal(header.deltaPicOrderCnt0, 2147483647);
    assert.equal(header.deltaPicOrderCnt1, -2147483647);
    assert.equal(header.redundantPicCnt, 127);
  }
});

test('preserves valid short slice headers with CABAC trailing padding', () => {
  const store = storeFor(decode('Z2QACqzZSWwEQAAAAwBAAAAFA8SJZYA='), decode('aOvjyyLA'));
  const source = decode(realPictures[2][0]);
  const expected = parseH264SliceHeader(source, store.resolve);
  const padded = bytes(...source, 0, 0, 3);
  assert.deepEqual(parseH264SliceHeader(padded, store.resolve), expected);
  assert.throws(() => readSlicePrefix(bytes(...source, 0)), /padding/);
  assert.throws(() => readSlicePrefix(bytes(...source, 0, 0)), /padding/);
  assert.throws(() => readSlicePrefix(bytes(...source, ...new Uint8Array(36).fill(0xff), 0, 0)), /padding/);
  assert.throws(() => readSlicePrefix(bytes(0x41, 0, 0, 3, 4, 0x80)), /emulation/);
});
