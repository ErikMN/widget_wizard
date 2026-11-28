/* H.264 video usability information (Annex E)
 *
 * Retain the clock and picture reordering information needed for media
 * timing. Read the intervening syntax without retaining unrelated fields.
 * An absent restriction is not a declaration of zero reordering.
 */
import type { H264BitReader } from './h264Bits';

export interface H264HrdTiming {
  readonly cpbCount: number;
  readonly initialCpbRemovalDelayLength: number;
  readonly cpbRemovalDelayLength: number;
  readonly dpbOutputDelayLength: number;
  readonly timeOffsetLength: number;
}

export interface H264Vui {
  readonly timing?: {
    readonly numUnitsInTick: number;
    readonly timeScale: number;
    readonly fixedFrameRate: boolean;
  };
  readonly nalHrd?: H264HrdTiming;
  readonly vclHrd?: H264HrdTiming;
  readonly lowDelayHrd?: boolean;
  readonly picStructPresent: boolean;
  readonly maxNumReorderFrames?: number;
  readonly maxDecFrameBuffering?: number;
}

const readHrd = (reader: H264BitReader): H264HrdTiming => {
  const count = reader.readUnsigned(31) + 1;
  reader.readBits(4); /* bit_rate_scale */
  reader.readBits(4); /* cpb_size_scale */
  let previousBitRate = -1;
  let previousCpbSize = 0xfffffffe;
  for (let i = 0; i < count; i++) {
    const bitRate = reader.readUnsigned(0xfffffffe); /* bit_rate_value_minus1 */
    const cpbSize = reader.readUnsigned(0xfffffffe); /* cpb_size_value_minus1 */
    reader.readFlag(); /* cbr_flag */
    if (bitRate <= previousBitRate || cpbSize > previousCpbSize) {
      throw new Error('Invalid H.264 HRD buffer schedule');
    }
    previousBitRate = bitRate;
    previousCpbSize = cpbSize;
  }
  return {
    cpbCount: count,
    initialCpbRemovalDelayLength: reader.readBits(5) + 1,
    cpbRemovalDelayLength: reader.readBits(5) + 1,
    dpbOutputDelayLength: reader.readBits(5) + 1,
    timeOffsetLength: reader.readBits(5)
  };
};

export const readH264Vui = (reader: H264BitReader, maxNumRefFrames: number): H264Vui => {
  if (reader.readFlag()) { /* aspect_ratio_info_present_flag */
    if (reader.readBits(8) === 255) {
      reader.readBits(16); /* sar_width */
      reader.readBits(16); /* sar_height */
    }
  }
  if (reader.readFlag()) { /* overscan_info_present_flag */
    reader.readFlag(); /* overscan_appropriate_flag */
  }
  if (reader.readFlag()) { /* video_signal_type_present_flag */
    reader.readBits(3); /* video_format */
    reader.readFlag(); /* video_full_range_flag */
    if (reader.readFlag()) { /* colour_description_present_flag */
      reader.readBits(8); /* colour_primaries */
      reader.readBits(8); /* transfer_characteristics */
      reader.readBits(8); /* matrix_coefficients */
    }
  }
  if (reader.readFlag()) { /* chroma_loc_info_present_flag */
    reader.readUnsigned(5); /* chroma_sample_loc_type_top_field */
    reader.readUnsigned(5); /* chroma_sample_loc_type_bottom_field */
  }

  let timing: H264Vui['timing'];
  if (reader.readFlag()) { /* timing_info_present_flag */
    const numUnitsInTick = reader.readBits(32);
    const timeScale = reader.readBits(32);
    const fixedFrameRate = reader.readFlag();
    if (numUnitsInTick === 0 || timeScale === 0) {
      throw new Error('Invalid H.264 VUI clock');
    }
    timing = { numUnitsInTick, timeScale, fixedFrameRate };
  }

  const nalHrd = reader.readFlag() ? readHrd(reader) : undefined;
  const vclHrd = reader.readFlag() ? readHrd(reader) : undefined;
  /* Annex E.2.2 requires the delay lengths to agree when both HRDs exist. */
  if (nalHrd && vclHrd && (
    nalHrd.initialCpbRemovalDelayLength !== vclHrd.initialCpbRemovalDelayLength ||
    nalHrd.cpbRemovalDelayLength !== vclHrd.cpbRemovalDelayLength ||
    nalHrd.dpbOutputDelayLength !== vclHrd.dpbOutputDelayLength ||
    nalHrd.timeOffsetLength !== vclHrd.timeOffsetLength
  )) {
    throw new Error('Conflicting H.264 HRD delay lengths');
  }
  const lowDelayHrd = nalHrd || vclHrd ? reader.readFlag() : undefined;
  if (lowDelayHrd && (
    timing?.fixedFrameRate ||
    (nalHrd && nalHrd.cpbCount !== 1) ||
    (vclHrd && vclHrd.cpbCount !== 1)
  )) {
    throw new Error('Invalid H.264 low-delay HRD parameters');
  }
  const picStructPresent = reader.readFlag();

  let maxNumReorderFrames: number | undefined;
  let maxDecFrameBuffering: number | undefined;
  if (reader.readFlag()) { /* bitstream_restriction_flag */
    reader.readFlag(); /* motion_vectors_over_pic_boundaries_flag */
    reader.readUnsigned(16); /* max_bytes_per_pic_denom */
    reader.readUnsigned(16); /* max_bits_per_mb_denom */
    /* Older H.264 editions permitted 16 for both motion vector fields. */
    reader.readUnsigned(16); /* log2_max_mv_length_horizontal */
    reader.readUnsigned(16); /* log2_max_mv_length_vertical */
    maxNumReorderFrames = reader.readUnsigned(16);
    maxDecFrameBuffering = reader.readUnsigned(16);
    if (maxNumReorderFrames > maxDecFrameBuffering || maxNumRefFrames > maxDecFrameBuffering) {
      throw new Error('Invalid H.264 VUI decoded picture buffer bounds');
    }
  }
  return { timing, nalHrd, vclHrd, lowDelayHrd, picStructPresent, maxNumReorderFrames, maxDecFrameBuffering };
};
