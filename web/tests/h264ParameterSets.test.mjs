import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let H264BitReader;
let readParameterSet;
let parseH264Sps;
let parseH264Pps;
let parseH264Format;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ H264BitReader, readParameterSet } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Bits.ts'
  ));
  ({ parseH264Sps, parseH264Pps } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264ParameterSets.ts'
  ));
  ({ parseH264Format } = await server.ssrLoadModule(
    '/src/components/player/native/rtsp/h264/h264Format.ts'
  ));
});

after(async () => {
  await server?.close();
});

const bytes = (...values) => Uint8Array.of(...values);
const decode = (value) => Uint8Array.from(Buffer.from(value, 'base64'));
const encode = (value) => Buffer.from(value).toString('base64');

/* SPS fixtures generated with libx264 and checked with ffprobe. The last
 * progressive fixture uses the JVT quantization matrix. The preceding one
 * uses interlaced coding. All contain real encoded picture data in the source.
 */
const fixtures = [
  ['Z0LADNkBQZ6iP/BZAFlxAAADAAEAAAMAMg8UKkg=', 318, 178, 'avc1.42c00c', 1, 8, true],
  ['Z01AHuygUBf8uAiAAAADAIAAABkHixbL', 640, 360, 'avc1.4d401e', 1, 8, true],
  ['Z2QAKKzZQHgCJ+XARAAAAwAEAAADAMg8YMZY', 1920, 1080, 'avc1.640028', 1, 8, true],
  ['Z24ADKbNlBQZ+fARAAADAAEAAAMAMg8UKZY=', 320, 180, 'avc1.6e000c', 1, 10, true],
  ['Z3oADLzZQUGeo7/wWYBZcQAAAwABAAADADIPFCmW', 318, 179, 'avc1.7a000c', 2, 8, true],
  ['Z/QADJGbKCgz1Hf+FmAWbiAAAAMAIAAABkHihTLA', 319, 179, 'avc1.f4000c', 3, 8, true],
  ['Z2QAFazZQUM/JgIgAAADACAAAAZD4oUywA==', 320, 180, 'avc1.640015', 1, 8, false],
  ['Z2QADKzZQUGeoj/wWQBZcQAAAwABAAADADIPFCmW', 318, 178, 'avc1.64000c', 1, 8, true]
];

/* Build small parameter set fixtures for fields that real encoders rarely use.
 * Apply RBSP trailing bits and emulation prevention as defined by H.264.
 */
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
const sps = (options = {}) => {
  const {
    profile = 100, compatibility = 0, id = 0, chroma = 1,
    separate = false, depth = 0, scaling = '0', poc = 0,
    pocFields = poc === 0 ? ue(4) : '', frameNum = 0,
    widthMbs = 20, heightUnits = 12, interlaced = false,
    crop = [0, 1, 0, 1], vui = '0', refFrames = 1
  } = options;
  let syntax = bits(profile, 8) + bits(compatibility, 8) + bits(31, 8) + ue(id);
  if (profile === 100 || profile === 244) {
    syntax += ue(chroma) + (chroma === 3 ? bits(Number(separate), 1) : '') +
      ue(depth) + ue(depth) + '0' + scaling;
  }
  syntax += ue(frameNum) + ue(poc) + pocFields + ue(refFrames) + '0' +
    ue(widthMbs - 1) + ue(heightUnits - 1) + (interlaced ? '01' : '1') + '1';
  syntax += crop ? '1' + crop.map(ue).join('') : '0';
  return nal(0x67, syntax + vui);
};
const ppsSyntax = (id = 0, spsId = 0, flags = '00', options = {}) => {
  const {
    groups = 1, groupMap = '', l0 = 0, l1 = 0, weighted = false,
    bipred = 0, qp = 0, qs = 0, chromaQp = 0, tail = '100'
  } = options;
  return ue(id) + ue(spsId) + flags + ue(groups - 1) + groupMap +
    ue(l0) + ue(l1) + bits(Number(weighted), 1) + bits(bipred, 2) +
    se(qp) + se(qs) + se(chromaQp) + tail;
};
const pps = (id = 0, spsId = 0, flags = '00', options = {}) =>
  nal(0x68, ppsSyntax(id, spsId, flags, options));

test('reads unsigned fixed-width fields and Exp-Golomb values across bytes', () => {
  const reader = new H264BitReader(bytes(0xff, 0xff, 0xff, 0xff), 32);
  assert.equal(reader.readBits(32), 0xffffffff);
  assert.equal(reader.remaining, 0);
  assert.throws(() => reader.readBits(1), /bit field/);
  const syntax = [0, 1, 2, 15, 255, 65535, 0xffffffff].map(ue).join('') +
    [0, -1, 1, -127, 127].map(se).join('');
  const codes = readParameterSet(nal(0x67, syntax), 7);
  for (const value of [0, 1, 2, 15, 255, 65535, 0xffffffff]) {
    assert.equal(codes.readUnsigned(), value);
  }
  for (const value of [0, -1, 1, -127, 127]) {
    assert.equal(codes.readSigned(), value);
  }
  assert.equal(codes.remaining, 0);
});

test('rejects invalid bit lengths, incomplete codes and oversized values', () => {
  assert.throws(() => new H264BitReader(bytes(1), 9), /bitstream length/);
  const reader = new H264BitReader(bytes(1), 8);
  for (const count of [-1, 1.5, 33, 9]) {
    assert.throws(() => reader.readBits(count), /bit field/);
  }
  assert.throws(() => reader.readUnsigned(), /bit field/);
  assert.throws(() => readParameterSet(nal(0x67, '0'.repeat(33) + '1'), 7).readUnsigned(), /too large/);
  assert.throws(() => readParameterSet(nal(0x67, ue(32)), 7).readUnsigned(31), /out of range/);
});

test('removes emulation prevention bytes and excludes the RBSP stop bit', () => {
  const reader = readParameterSet(bytes(0x67, 0, 0, 3, 0, 0, 3, 3, 0x80), 7);
  assert.equal(reader.readBits(32), 0);
  assert.equal(reader.readBits(8), 3);
  assert.equal(reader.remaining, 0);
  for (const malformed of [
    bytes(0x67, 0, 0, 1, 0x80), bytes(0x67, 0, 0, 2, 0x80),
    bytes(0x67, 0, 0, 3), bytes(0x67, 0, 0, 3, 4, 0x80),
    bytes(0x67, 0), bytes(0x67, 0x80, 0)
  ]) {
    assert.throws(() => readParameterSet(malformed, 7));
  }
});

test('matches real SPS dimensions, profile, chroma and bit depth', () => {
  for (const [value, width, height, codec, chroma, depth, progressive] of fixtures) {
    const info = parseH264Sps(decode(value));
    assert.equal(info.width, width);
    assert.equal(info.height, height);
    assert.equal(info.codec, codec);
    assert.equal(info.chromaFormatIdc, chroma);
    assert.equal(info.bitDepthLuma, depth);
    assert.equal(info.bitDepthChroma, depth);
    assert.equal(info.frameMbsOnly, progressive);
    assert.equal(info.codedWidth, Math.ceil(width / 16) * 16);
    const heightUnit = progressive ? 16 : 32;
    assert.equal(info.codedHeight, Math.ceil(height / heightUnit) * heightUnit);
  }
});

test('reads explicit scaling lists including the default-list shortcut', () => {
  /* First list selects the default, second has all 16 deltas, seventh has
   * all 64 deltas. Remaining scaling-list flags are zero.
   */
  const scaling = '1' + '1' + se(-8) + '1' + se(1).repeat(16) +
    '0000' + '1' + se(-1).repeat(7) + se(1).repeat(57) + '0';
  const info = parseH264Sps(sps({ scaling }));
  assert.equal(info.width, 318);
  assert.equal(info.height, 190);
  assert.equal(info.log2MaxFrameNum, 4);
});

test('handles all chroma crop units including separate colour planes and fields', () => {
  for (const [chroma, separate, x, y] of [
    [0, false, 1, 1], [1, false, 2, 2], [2, false, 2, 1],
    [3, false, 1, 1], [3, true, 1, 1]
  ]) {
    for (const interlaced of [false, true]) {
      const info = parseH264Sps(sps({ profile: 244, chroma, separate, interlaced, crop: [1, 2, 3, 4] }));
      const factor = interlaced ? 2 : 1;
      assert.equal(info.width, 320 - 3 * x);
      assert.equal(info.height, 192 * factor - 7 * y * factor);
      assert.equal(info.separateColourPlane, separate);
      assert.equal(info.frameMbsOnly, !interlaced);
    }
  }
});

test('reads SPS identifiers and all picture order count branches', () => {
  const first = parseH264Sps(sps({ id: 31, frameNum: 12, poc: 0, pocFields: ue(12) }));
  assert.equal(first.id, 31);
  assert.equal(first.log2MaxFrameNum, 16);
  assert.equal(first.log2MaxPicOrderCntLsb, 16);
  for (const flag of [0, 1]) {
    const pocFields = bits(flag, 1) + se(-2) + se(3) + ue(2) + se(1) + se(-1);
    const info = parseH264Sps(sps({ poc: 1, pocFields }));
    assert.equal(info.deltaPicOrderAlwaysZero, Boolean(flag));
    assert.equal(info.picOrderCntType, 1);
    assert.equal(info.log2MaxPicOrderCntLsb, undefined);
    assert.equal(info.width, 318);
  }
  const last = parseH264Sps(sps({ poc: 2, crop: null }));
  assert.equal(last.picOrderCntType, 2);
  assert.equal(last.width, 320);
  assert.equal(last.height, 192);
});

test('rejects invalid SPS bounds and truncated required syntax', () => {
  for (const options of [
    { profile: 1 }, { compatibility: 1 }, { id: 32 }, { chroma: 4 },
    { depth: 7 }, { frameNum: 13 }, { poc: 3 }, { pocFields: ue(13) },
    { poc: 1, pocFields: '0' + se(0) + se(0) + ue(256) },
    { widthMbs: 4097 }, { crop: [0, 160, 0, 0] },
    { crop: [0, 0, 0, 96] }, { scaling: '11' + se(128) }, { vui: '1' }
  ]) {
    assert.throws(() => parseH264Sps(sps(options)));
  }
  const valid = sps();
  for (let i = 0; i < valid.length; i++) {
    assert.throws(() => parseH264Sps(valid.subarray(0, i)));
  }
});

test('rejects wrong parameter set headers and oversized configuration records', () => {
  for (const header of [0xe7, 0x07, 0x68, 0x65]) {
    const data = sps();
    data[0] = header;
    assert.throws(() => parseH264Sps(data), /parameter set/);
  }
  const oversized = new Uint8Array(65536);
  oversized[0] = 0x67;
  assert.throws(() => parseH264Sps(oversized), /parameter set/);
  assert.throws(() => parseH264Pps(sps()), /parameter set/);
});

test('reads mandatory PPS fields and retains slice parsing information', () => {
  assert.deepEqual(parseH264Pps(decode('aOvjyyLA')), {
    id: 0, spsId: 0, entropyCodingMode: true, bottomFieldPicOrderInFramePresent: false,
    numSliceGroups: 1, sliceGroupMapType: undefined, sliceGroupChangeRate: undefined,
    numRefIdxL0DefaultActive: 3, numRefIdxL1DefaultActive: 1,
    weightedPred: true, weightedBipredIdc: 2,
    picInitQpMinus26: -3, picInitQsMinus26: 0, chromaQpIndexOffset: -2,
    deblockingFilterControlPresent: true, constrainedIntraPred: false,
    redundantPicCntPresent: false
  });
  assert.deepEqual(parseH264Pps(pps(255, 31, '11', {
    l0: 31, l1: 31, weighted: true, bipred: 1,
    qp: -62, qs: 25, chromaQp: 12, tail: '011'
  })), {
    id: 255, spsId: 31, entropyCodingMode: true, bottomFieldPicOrderInFramePresent: true,
    numSliceGroups: 1, sliceGroupMapType: undefined, sliceGroupChangeRate: undefined,
    numRefIdxL0DefaultActive: 32, numRefIdxL1DefaultActive: 32,
    weightedPred: true, weightedBipredIdc: 1,
    picInitQpMinus26: -62, picInitQsMinus26: 25, chromaQpIndexOffset: 12,
    deblockingFilterControlPresent: false, constrainedIntraPred: true,
    redundantPicCntPresent: true
  });
  for (const malformed of [pps(256), pps(0, 32), nal(0x68, '11'), nal(0x68, '1100')]) {
    assert.throws(() => parseH264Pps(malformed));
  }
});

test('rejects truncation anywhere in the mandatory PPS syntax', () => {
  const syntax = ppsSyntax(4, 3, '11', { l0: 2, l1: 1, qp: -3, chromaQp: 2 });
  for (let i = 0; i < syntax.length; i++) {
    assert.throws(() => parseH264Pps(nal(0x68, syntax.slice(0, i))));
  }
  const truncated = bytes(0x68, 0xcc);
  assert.throws(() => parseH264Pps(truncated));
  assert.throws(() => parseH264Format(`sprop-parameter-sets=${encode(truncated)}`));
});

test('bounds SPS reference frames independently of the decoded picture buffer level', () => {
  for (const refFrames of [0, 1, 16]) {
    assert.equal(parseH264Sps(sps({ profile: 66, refFrames })).maxNumRefFrames, refFrames);
  }
  assert.throws(() => parseH264Sps(sps({ profile: 66, refFrames: 17 })), /out of range/);
});

test('reads each mandatory PPS slice group map syntax', () => {
  for (const [type, groups, syntax, rate] of [
    [0, 8, ue(0).repeat(8), undefined],
    [1, 3, '', undefined],
    [2, 3, ue(0) + ue(2) + ue(3) + ue(5), undefined],
    [3, 2, '0' + ue(5), 6],
    [4, 2, '1' + ue(6), 7],
    [5, 2, '0' + ue(7), 8],
    [6, 3, ue(2) + '000110', undefined],
    [6, 8, ue(1) + '111000', undefined]
  ]) {
    const info = parseH264Pps(pps(0, 0, '00', {
      groups, groupMap: ue(type) + syntax, l0: 2, l1: 1, qp: -5, tail: '101'
    }));
    assert.equal(info.numSliceGroups, groups);
    assert.equal(info.sliceGroupMapType, type);
    assert.equal(info.sliceGroupChangeRate, rate);
    assert.equal(info.numRefIdxL0DefaultActive, 3);
    assert.equal(info.numRefIdxL1DefaultActive, 2);
    assert.equal(info.picInitQpMinus26, -5);
    assert.equal(info.redundantPicCntPresent, true);
  }
});

test('rejects invalid PPS group counts, map types and map entries', () => {
  for (const options of [
    { groups: 9 },
    { groups: 2, groupMap: ue(7) },
    { groups: 2, groupMap: ue(2) + ue(3) + ue(2) },
    { groups: 3, groupMap: ue(3) + '0' + ue(0) },
    { groups: 3, groupMap: ue(4) + '0' + ue(0) },
    { groups: 3, groupMap: ue(5) + '0' + ue(0) },
    { groups: 3, groupMap: ue(6) + ue(0) + '11' },
    { groups: 2, groupMap: ue(6) + ue(0xffffffff) }
  ]) {
    assert.throws(() => parseH264Pps(pps(0, 0, '00', options)));
  }
  const syntax = ppsSyntax(0, 0, '00', { groups: 2, groupMap: ue(0) + ue(2) + ue(3) });
  for (let i = 0; i < syntax.length; i++) {
    assert.throws(() => parseH264Pps(nal(0x68, syntax.slice(0, i))));
  }
});

test('validates PPS reference indices, prediction mode and quantization bounds', () => {
  for (const options of [
    { l0: 32 }, { l1: 32 }, { bipred: 3 },
    { qp: -63 }, { qp: 26 }, { qs: -27 }, { qs: 26 },
    { chromaQp: -13 }, { chromaQp: 13 }
  ]) {
    assert.throws(() => parseH264Pps(pps(0, 0, '00', options)));
  }
  const info = parseH264Pps(pps(0, 0, '00', { qp: 25, qs: -26, chromaQp: -12 }));
  assert.equal(info.picInitQpMinus26, 25);
  assert.equal(info.picInitQsMinus26, -26);
  assert.equal(info.chromaQpIndexOffset, -12);
});

test('uses mode zero by default and permits in-band configuration', () => {
  assert.deepEqual(parseH264Format(), {
    packetizationMode: 0, profileLevelId: undefined,
    sequenceParameterSets: [], pictureParameterSets: []
  });
  assert.deepEqual(parseH264Format('packetization-mode=1; profile-level-id=640029;'), {
    packetizationMode: 1, profileLevelId: '640029',
    sequenceParameterSets: [], pictureParameterSets: []
  });
});

test('reads multiple parameter sets by identifier instead of position', () => {
  const first = sps({ id: 3 });
  const second = sps({ id: 7 });
  const a = pps(9, 7);
  const b = pps(4, 3);
  const value = [a, first, b, second].map(encode).join(',');
  const format = parseH264Format(` Packetization-Mode = 1 ; PROFILE-LEVEL-ID=64002A; sprop-parameter-sets=${value}`);
  assert.equal(format.packetizationMode, 1);
  assert.equal(format.profileLevelId, '64002a');
  assert.deepEqual(format.sequenceParameterSets.map(({ info }) => info.id), [3, 7]);
  assert.deepEqual(format.pictureParameterSets.map(({ info }) => info.spsId), [7, 3]);
  assert.deepEqual(format.sequenceParameterSets[0].nal, first);
  assert.deepEqual(format.pictureParameterSets[0].nal, a);
  assert.equal(format.sequenceParameterSets[0].info.codec, 'avc1.64001f');
});

test('retains separately advertised SPS or PPS for later in-band resolution', () => {
  const value = encode(pps(4, 3));
  const format = parseH264Format(`sprop-parameter-sets=${value}`);
  assert.equal(format.sequenceParameterSets.length, 0);
  assert.equal(format.pictureParameterSets[0].info.spsId, 3);
});

test('rejects invalid SDP parameters, unsupported modes and ambiguous parameter sets', () => {
  const encodedSps = encode(sps());
  const encodedPps = encode(pps());
  for (const value of [
    'packetization-mode=2', 'packetization-mode=', 'packetization-mode=1;packetization-mode=0',
    'profile-level-id=12345', 'profile-level-id=GG0000', 'packetization-mode',
    'sprop-parameter-sets=', 'sprop-parameter-sets=***', 'sprop-parameter-sets=Z',
    'sprop-parameter-sets=Z===', 'sprop-parameter-sets=ZQ==',
    `sprop-parameter-sets=${encodedSps},`,
    `sprop-parameter-sets=${encodedSps},${encodedSps}`,
    `sprop-parameter-sets=${encodedPps},${encodedPps}`
  ]) {
    assert.throws(() => parseH264Format(value));
  }
});
