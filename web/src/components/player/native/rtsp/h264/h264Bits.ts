/* H.264 bitstream reading
 *
 * Read fixed-width values and Exp-Golomb codes without reading past the
 * available bits. Parameter set RBSPs exclude emulation prevention bytes
 * and the trailing stop bit, which is not part of the syntax data.
 */
export class H264BitReader {
  private position = 0;

  constructor(
    private readonly data: Uint8Array,
    private readonly bitLength: number
  ) {
    if (!Number.isInteger(bitLength) || bitLength < 0 || bitLength > data.length * 8) {
      throw new Error('Invalid H.264 bitstream length');
    }
  }

  get remaining(): number {
    return this.bitLength - this.position;
  }

  readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > 32 || count > this.remaining) {
      throw new Error('Truncated or invalid H.264 bit field');
    }
    let value = 0;
    for (let i = 0; i < count; i++) {
      const bit = (this.data[this.position >> 3] >> (7 - (this.position & 7))) & 1;
      value = value * 2 + bit;
      this.position++;
    }
    return value;
  }

  readFlag(): boolean {
    return this.readBits(1) === 1;
  }

  readUnsigned(maximum = 0xffffffff): number {
    let zeros = 0;
    while (!this.readFlag()) {
      if (++zeros > 32) {
        throw new Error('H.264 Exp-Golomb value is too large');
      }
    }
    const value = 2 ** zeros - 1 + this.readBits(zeros);
    if (value > maximum) {
      throw new Error('H.264 Exp-Golomb value is out of range');
    }
    return value;
  }

  readSigned(): number {
    const value = this.readUnsigned();
    return value % 2 === 0 ? 0 - value / 2 : (value + 1) / 2;
  }
}

/* Decode at most the requested number of RBSP bytes. Slice inspection only
 * needs a short prefix; parameter sets need their entire syntax payload.
 */
const readRbsp = (nal: Uint8Array, limit: number, allowCabacPadding = false) => {
  const rbsp = new Uint8Array(Math.min(nal.length - 1, limit));
  let size = 0;
  let zeros = 0;
  let i = 1;
  for (; i < nal.length && size < rbsp.length; i++) {
    const byte = nal[i];
    if (zeros === 2) {
      if (byte === 3) {
        if (
          (i + 1 === nal.length && !allowCabacPadding) ||
          (i + 1 < nal.length && nal[i + 1] > 3)
        ) {
          throw new Error('Invalid H.264 emulation prevention byte');
        }
        zeros = 0;
        continue;
      }
      if (byte < 3) {
        throw new Error('Missing H.264 emulation prevention byte');
      }
    }
    rbsp[size++] = byte;
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return { data: rbsp.subarray(0, size), complete: i === nal.length };
};

const syntaxBitLength = (data: Uint8Array): number => {
  const last = data[data.length - 1];
  if (!last) {
    throw new Error('Missing H.264 RBSP stop bit');
  }
  let trailing = 1;
  while ((last & (1 << (trailing - 1))) === 0) {
    trailing++;
  }
  return data.length * 8 - trailing;
};

/* Parameter sets must fit in the 16-bit lengths used by AVC configuration. */
export const readParameterSet = (nal: Uint8Array, type: 7 | 8): H264BitReader => {
  if (
    nal.length < 2 ||
    nal.length > 65535 ||
    (nal[0] & 0x80) !== 0 ||
    (nal[0] & 0x60) === 0 ||
    (nal[0] & 0x1f) !== type
  ) {
    throw new Error('Invalid H.264 parameter set');
  }
  const { data } = readRbsp(nal, nal.length - 1);
  return new H264BitReader(data, syntaxBitLength(data));
};

/* The slice header fields through redundant_pic_cnt require at most 287
 * bits, including the maximum 65-bit Exp-Golomb codes. Do not copy slice
 * data just to read the header fields used for picture identification.
 */
const SLICE_PREFIX_BYTES = 36;

export const readSlicePrefix = (nal: Uint8Array): H264BitReader => {
  const type = nal[0] & 0x1f;
  if (
    nal.length < 2 ||
    (nal[0] & 0x80) !== 0 ||
    (type !== 1 && type !== 2 && type !== 5) ||
    (type === 5 && (nal[0] & 0x60) === 0)
  ) {
    throw new Error('Invalid or unsupported H.264 slice');
  }
  /* H.264 section 7.4.1 forbids a zero byte at the end of a NAL unit. */
  if (nal[nal.length - 1] === 0) {
    throw new Error('Invalid H.264 slice trailing padding');
  }
  const { data, complete } = readRbsp(nal, SLICE_PREFIX_BYTES, true);
  if (!complete) {
    return new H264BitReader(data, data.length * 8);
  }
  /* A short CABAC slice may end with cabac_zero_word padding. */
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) {
    end--;
  }
  if ((data.length - end) % 2 !== 0) {
    throw new Error('Invalid H.264 slice trailing padding');
  }
  return new H264BitReader(data, syntaxBitLength(data.subarray(0, end)));
};
