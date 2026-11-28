/* H.264 picture identification
 *
 * Parse slice header fields through redundant_pic_cnt (H.264 section 7.3.3).
 * The active PPS and SPS determine which fields are present. This reads
 * picture identification, not the remaining slice header or coded pixels.
 */
import { readSlicePrefix, type H264BitReader } from './h264Bits';
import type { H264Configuration } from './h264Configuration';

export interface H264SliceHeader {
  readonly configuration: H264Configuration;
  readonly firstMbInSlice: number;
  /* Slice types zero to four: P, B, I, SP, SI. */
  readonly sliceType: number;
  readonly colourPlaneId: number;
  readonly frameNum: number;
  readonly fieldPic: boolean;
  readonly bottomField: boolean;
  readonly nalRefIdc: number;
  readonly isIdr: boolean;
  readonly idrPicId?: number;
  readonly picOrderCntLsb?: number;
  readonly deltaPicOrderCntBottom: number;
  readonly deltaPicOrderCnt0: number;
  readonly deltaPicOrderCnt1: number;
  readonly redundantPicCnt: number;
}

const readPicOrderDelta = (reader: H264BitReader): number => {
  const value = reader.readSigned();
  if (value > 0x7fffffff) {
    throw new Error('H.264 picture order delta is out of range');
  }
  return value;
};

export const parseH264SliceHeader = (
  nal: Uint8Array,
  resolve: (ppsId: number) => H264Configuration | undefined
): H264SliceHeader | undefined => {
  const reader = readSlicePrefix(nal);
  const firstMbInSlice = reader.readUnsigned();
  const sliceType = reader.readUnsigned(9) % 5;
  const ppsId = reader.readUnsigned(255);
  const configuration = resolve(ppsId);
  if (!configuration) {
    return undefined;
  }
  const { sps: { info: sps }, pps: { info: pps } } = configuration;
  const isIdr = (nal[0] & 0x1f) === 5;
  const nalRefIdc = (nal[0] >> 5) & 3;
  if ((isIdr || sps.maxNumRefFrames === 0) && sliceType !== 2 && sliceType !== 4) {
    throw new Error('Invalid H.264 intra picture slice type');
  }
  const colourPlaneId = sps.separateColourPlane ? reader.readBits(2) : 0;
  if (colourPlaneId === 3) {
    throw new Error('Invalid H.264 colour plane identifier');
  }
  const frameNum = reader.readBits(sps.log2MaxFrameNum);
  if (isIdr && frameNum !== 0) {
    throw new Error('Invalid H.264 IDR frame number');
  }
  const fieldPic = !sps.frameMbsOnly && reader.readFlag();
  const bottomField = fieldPic && reader.readFlag();
  const mbaffFrame = sps.mbAdaptiveFrameField && !fieldPic;
  const pictureMbs = (sps.codedWidth / 16) * (sps.codedHeight / 16) / (fieldPic ? 2 : 1);
  if (firstMbInSlice * (mbaffFrame ? 2 : 1) >= pictureMbs) {
    throw new Error('H.264 first macroblock is outside the picture');
  }
  const idrPicId = isIdr ? reader.readUnsigned(65535) : undefined;
  let picOrderCntLsb: number | undefined;
  let deltaPicOrderCntBottom = 0;
  let deltaPicOrderCnt0 = 0;
  let deltaPicOrderCnt1 = 0;
  const readBottomOrder = pps.bottomFieldPicOrderInFramePresent && !fieldPic;
  if (sps.picOrderCntType === 0) {
    picOrderCntLsb = reader.readBits(sps.log2MaxPicOrderCntLsb!);
    if (readBottomOrder) {
      deltaPicOrderCntBottom = readPicOrderDelta(reader);
    }
  } else if (sps.picOrderCntType === 1 && !sps.deltaPicOrderAlwaysZero) {
    deltaPicOrderCnt0 = readPicOrderDelta(reader);
    if (readBottomOrder) {
      deltaPicOrderCnt1 = readPicOrderDelta(reader);
    }
  }
  const redundantPicCnt = pps.redundantPicCntPresent ? reader.readUnsigned(127) : 0;
  if (reader.remaining === 0) {
    throw new Error('Truncated H.264 slice header');
  }
  return {
    configuration,
    firstMbInSlice,
    sliceType,
    colourPlaneId,
    frameNum,
    fieldPic,
    bottomField,
    nalRefIdc,
    isIdr,
    idrPicId,
    picOrderCntLsb,
    deltaPicOrderCntBottom,
    deltaPicOrderCnt0,
    deltaPicOrderCnt1,
    redundantPicCnt
  };
};

/* Compare primary coded picture slices as specified by H.264 7.4.1.2.4.
 * The first macroblock address alone does not identify picture boundaries.
 * This comparison is not proof that all slices of either picture arrived.
 */
export const startsNewH264Picture = (previous: H264SliceHeader, next: H264SliceHeader): boolean => {
  if (previous.redundantPicCnt !== 0 || next.redundantPicCnt !== 0) {
    throw new Error('H.264 picture comparison requires primary slices');
  }
  if (
    previous.frameNum !== next.frameNum ||
    previous.configuration.pps.info.id !== next.configuration.pps.info.id ||
    previous.fieldPic !== next.fieldPic ||
    (previous.fieldPic && next.fieldPic && previous.bottomField !== next.bottomField) ||
    (previous.nalRefIdc === 0) !== (next.nalRefIdc === 0) ||
    previous.isIdr !== next.isIdr ||
    (previous.isIdr && next.isIdr && previous.idrPicId !== next.idrPicId)
  ) {
    return true;
  }
  const previousPoc = previous.configuration.sps.info.picOrderCntType;
  const nextPoc = next.configuration.sps.info.picOrderCntType;
  if (previousPoc === 0 && nextPoc === 0) {
    return previous.picOrderCntLsb !== next.picOrderCntLsb ||
      previous.deltaPicOrderCntBottom !== next.deltaPicOrderCntBottom;
  }
  if (previousPoc === 1 && nextPoc === 1) {
    return previous.deltaPicOrderCnt0 !== next.deltaPicOrderCnt0 ||
      previous.deltaPicOrderCnt1 !== next.deltaPicOrderCnt1;
  }
  return false;
};
