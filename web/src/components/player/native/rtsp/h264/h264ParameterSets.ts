/* H.264 parameter set information
 *
 * Read the SPS fields needed for AVC decoder configuration, cropped picture
 * dimensions and subsequent slice header parsing. Read the mandatory PPS
 * syntax and retain fields needed by slice headers. This is not a full
 * bitstream validator; VUI, optional PPS extensions, constraints that depend
 * on the referenced SPS and slice data are not interpreted here.
 *
 * See H.264 sections 7.3.2.1.1, 7.3.2.2 and 7.4.2.1.1. The Axis
 * media-stream-library-js v13.3.3 SPS parser and h264Settings helper are
 * references for the decoder configuration fields.
 */
import { readParameterSet, type H264BitReader } from './h264Bits';

const EXTENDED_PROFILES = [44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244];

export interface H264Sps {
  readonly id: number;
  readonly profileIdc: number;
  readonly profileCompatibility: number;
  readonly levelIdc: number;
  readonly codec: string;
  readonly chromaFormatIdc: number;
  readonly separateColourPlane: boolean;
  readonly bitDepthLuma: number;
  readonly bitDepthChroma: number;
  readonly log2MaxFrameNum: number;
  readonly picOrderCntType: number;
  readonly log2MaxPicOrderCntLsb?: number;
  readonly deltaPicOrderAlwaysZero?: boolean;
  readonly maxNumRefFrames: number;
  readonly frameMbsOnly: boolean;
  readonly mbAdaptiveFrameField: boolean;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly width: number;
  readonly height: number;
}

export interface H264Pps {
  readonly id: number;
  readonly spsId: number;
  readonly entropyCodingMode: boolean;
  readonly bottomFieldPicOrderInFramePresent: boolean;
  readonly numSliceGroups: number;
  readonly sliceGroupMapType?: number;
  readonly sliceGroupChangeRate?: number;
  readonly sliceGroupRunLengths?: readonly number[];
  readonly sliceGroupRectangles?: readonly { topLeft: number; bottomRight: number }[];
  readonly sliceGroupMapUnits?: number;
  readonly numRefIdxL0DefaultActive: number;
  readonly numRefIdxL1DefaultActive: number;
  readonly weightedPred: boolean;
  readonly weightedBipredIdc: number;
  readonly picInitQpMinus26: number;
  readonly picInitQsMinus26: number;
  readonly chromaQpIndexOffset: number;
  readonly deblockingFilterControlPresent: boolean;
  readonly constrainedIntraPred: boolean;
  readonly redundantPicCntPresent: boolean;
}

/* Scaling lists use signed deltas. A zero next scale ends the deltas but
 * does not end the list (H.264 section 7.3.2.1.1.1).
 */
const skipScalingList = (reader: H264BitReader, size: number) => {
  let lastScale = 8;
  let nextScale = 8;
  for (let i = 0; i < size; i++) {
    if (nextScale !== 0) {
      const delta = reader.readSigned();
      if (delta < -128 || delta > 127) {
        throw new Error('Invalid H.264 scaling list delta');
      }
      nextScale = (lastScale + delta + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
};

export const parseH264Sps = (nal: Uint8Array): H264Sps => {
  const reader = readParameterSet(nal, 7);
  const profileIdc = reader.readBits(8);
  const profileCompatibility = reader.readBits(8);
  const levelIdc = reader.readBits(8);
  if (profileCompatibility & 3) {
    throw new Error('Invalid H.264 reserved constraint bits');
  }
  const id = reader.readUnsigned(31);
  let chromaFormatIdc = 1;
  let separateColourPlane = false;
  let bitDepthLuma = 8;
  let bitDepthChroma = 8;
  if (EXTENDED_PROFILES.includes(profileIdc)) {
    chromaFormatIdc = reader.readUnsigned(3);
    if (chromaFormatIdc === 3) {
      separateColourPlane = reader.readFlag();
    }
    bitDepthLuma += reader.readUnsigned(6);
    bitDepthChroma += reader.readUnsigned(6);
    reader.readFlag(); /* qpprime_y_zero_transform_bypass_flag */
    if (reader.readFlag()) {
      const count = chromaFormatIdc === 3 ? 12 : 8;
      for (let i = 0; i < count; i++) {
        if (reader.readFlag()) {
          skipScalingList(reader, i < 6 ? 16 : 64);
        }
      }
    }
  } else if (![66, 77, 88].includes(profileIdc)) {
    throw new Error('Unsupported H.264 SPS profile');
  }

  const log2MaxFrameNum = reader.readUnsigned(12) + 4;
  const picOrderCntType = reader.readUnsigned(2);
  let log2MaxPicOrderCntLsb: number | undefined;
  let deltaPicOrderAlwaysZero: boolean | undefined;
  if (picOrderCntType === 0) {
    log2MaxPicOrderCntLsb = reader.readUnsigned(12) + 4;
  } else if (picOrderCntType === 1) {
    deltaPicOrderAlwaysZero = reader.readFlag();
    reader.readSigned(); /* offset_for_non_ref_pic */
    reader.readSigned(); /* offset_for_top_to_bottom_field */
    const count = reader.readUnsigned(255);
    for (let i = 0; i < count; i++) {
      reader.readSigned(); /* offset_for_ref_frame */
    }
  }
  const maxNumRefFrames = reader.readUnsigned(16);
  reader.readFlag(); /* gaps_in_frame_num_value_allowed_flag */
  const codedWidth = (reader.readUnsigned(4095) + 1) * 16;
  const heightInMapUnits = reader.readUnsigned(4095) + 1;
  const frameMbsOnly = reader.readFlag();
  const mbAdaptiveFrameField = !frameMbsOnly && reader.readFlag();
  reader.readFlag(); /* direct_8x8_inference_flag */
  const frameFactor = frameMbsOnly ? 1 : 2;
  const codedHeight = heightInMapUnits * 16 * frameFactor;
  let width = codedWidth;
  let height = codedHeight;
  if (reader.readFlag()) {
    const left = reader.readUnsigned();
    const right = reader.readUnsigned();
    const top = reader.readUnsigned();
    const bottom = reader.readUnsigned();
    /* ChromaArrayType is zero for monochrome or separate colour planes. */
    const chromaArrayType = separateColourPlane ? 0 : chromaFormatIdc;
    const cropUnitX = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1;
    const cropUnitY = (chromaArrayType === 1 ? 2 : 1) * frameFactor;
    width -= (left + right) * cropUnitX;
    height -= (top + bottom) * cropUnitY;
  }
  if (width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error('Invalid H.264 picture dimensions');
  }
  const vuiPresent = reader.readFlag();
  if ((!vuiPresent && reader.remaining !== 0) || (vuiPresent && reader.remaining === 0)) {
    throw new Error('Invalid H.264 SPS ending');
  }
  const profileLevelId = [profileIdc, profileCompatibility, levelIdc]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return {
    id,
    profileIdc,
    profileCompatibility,
    levelIdc,
    codec: `avc1.${profileLevelId}`,
    chromaFormatIdc,
    separateColourPlane,
    bitDepthLuma,
    bitDepthChroma,
    log2MaxFrameNum,
    picOrderCntType,
    log2MaxPicOrderCntLsb,
    deltaPicOrderAlwaysZero,
    maxNumRefFrames,
    frameMbsOnly,
    mbAdaptiveFrameField,
    codedWidth,
    codedHeight,
    width,
    height
  };
};

export const parseH264Pps = (nal: Uint8Array): H264Pps => {
  const reader = readParameterSet(nal, 8);
  const id = reader.readUnsigned(255);
  const spsId = reader.readUnsigned(31);
  const entropyCodingMode = reader.readFlag();
  const bottomFieldPicOrderInFramePresent = reader.readFlag();
  const numSliceGroups = reader.readUnsigned(7) + 1;
  let sliceGroupMapType: number | undefined;
  let sliceGroupChangeRate: number | undefined;
  let sliceGroupRunLengths: number[] | undefined;
  let sliceGroupRectangles: { topLeft: number; bottomRight: number }[] | undefined;
  let sliceGroupMapUnits: number | undefined;
  if (numSliceGroups > 1) {
    sliceGroupMapType = reader.readUnsigned(6);
    if (sliceGroupMapType === 0) {
      sliceGroupRunLengths = [];
      for (let i = 0; i < numSliceGroups; i++) {
        sliceGroupRunLengths.push(reader.readUnsigned() + 1);
      }
    } else if (sliceGroupMapType === 2) {
      sliceGroupRectangles = [];
      for (let i = 0; i < numSliceGroups - 1; i++) {
        const topLeft = reader.readUnsigned();
        const bottomRight = reader.readUnsigned();
        if (topLeft > bottomRight) {
          throw new Error('Invalid H.264 slice group rectangle');
        }
        sliceGroupRectangles.push({ topLeft, bottomRight });
      }
    } else if (sliceGroupMapType >= 3 && sliceGroupMapType <= 5) {
      if (numSliceGroups !== 2) {
        throw new Error('Invalid H.264 changing slice groups');
      }
      reader.readFlag(); /* slice_group_change_direction_flag */
      sliceGroupChangeRate = reader.readUnsigned() + 1;
    } else if (sliceGroupMapType === 6) {
      const mapUnits = reader.readUnsigned() + 1;
      sliceGroupMapUnits = mapUnits;
      const bitsPerId = Math.ceil(Math.log2(numSliceGroups));
      if (mapUnits > Math.floor(reader.remaining / bitsPerId)) {
        throw new Error('Truncated H.264 slice group map');
      }
      for (let i = 0; i < mapUnits; i++) {
        if (reader.readBits(bitsPerId) >= numSliceGroups) {
          throw new Error('Invalid H.264 slice group identifier');
        }
      }
    }
  }
  const numRefIdxL0DefaultActive = reader.readUnsigned(31) + 1;
  const numRefIdxL1DefaultActive = reader.readUnsigned(31) + 1;
  const weightedPred = reader.readFlag();
  const weightedBipredIdc = reader.readBits(2);
  if (weightedBipredIdc > 2) {
    throw new Error('Invalid H.264 weighted biprediction mode');
  }
  const picInitQpMinus26 = reader.readSigned();
  const picInitQsMinus26 = reader.readSigned();
  const chromaQpIndexOffset = reader.readSigned();
  /* The lower QP bound depends on luma bit depth, which is at most 14. */
  if (
    picInitQpMinus26 < -62 || picInitQpMinus26 > 25 ||
    picInitQsMinus26 < -26 || picInitQsMinus26 > 25 ||
    chromaQpIndexOffset < -12 || chromaQpIndexOffset > 12
  ) {
    throw new Error('Invalid H.264 PPS quantization parameter');
  }
  const deblockingFilterControlPresent = reader.readFlag();
  const constrainedIntraPred = reader.readFlag();
  const redundantPicCntPresent = reader.readFlag();
  return {
    id,
    spsId,
    entropyCodingMode,
    bottomFieldPicOrderInFramePresent,
    numSliceGroups,
    sliceGroupMapType,
    sliceGroupChangeRate,
    sliceGroupRunLengths,
    sliceGroupRectangles,
    sliceGroupMapUnits,
    numRefIdxL0DefaultActive,
    numRefIdxL1DefaultActive,
    weightedPred,
    weightedBipredIdc,
    picInitQpMinus26,
    picInitQsMinus26,
    chromaQpIndexOffset,
    deblockingFilterControlPresent,
    constrainedIntraPred,
    redundantPicCntPresent
  };
};
