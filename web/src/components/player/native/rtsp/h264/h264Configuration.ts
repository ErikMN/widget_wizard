/* H.264 parameter set storage
 *
 * Each RTP source has its own parameter sets, seeded from SDP and updated
 * by in-band SPS and PPS NAL units. Parse before replacing an entry and
 * retain its identity when the bytes are unchanged. A slice identifies
 * its active configuration by PPS identifier, not by arrival order.
 */
import type { H264Format } from './h264Format';
import {
  parseH264Sps,
  parseH264Pps,
  type H264Sps,
  type H264Pps
} from './h264ParameterSets';

interface ParameterSet<T> {
  readonly nal: Uint8Array;
  readonly info: T;
}

export interface H264Configuration {
  readonly sps: ParameterSet<H264Sps>;
  readonly pps: ParameterSet<H264Pps>;
}

const storeParameterSet = <T extends { readonly id: number }>(
  sets: Map<number, ParameterSet<T>>,
  nal: Uint8Array,
  info: T
) => {
  const previous = sets.get(info.id);
  if (
    previous &&
    previous.nal.length === nal.length &&
    nal.every((byte, index) => byte === previous.nal[index])
  ) {
    return;
  }
  sets.set(info.id, { nal: new Uint8Array(nal), info });
};

export const createH264ParameterSetStore = (format: H264Format) => {
  /* The identifier and NAL size limits in the parsers bound storage. */
  const sequenceSets = new Map<number, ParameterSet<H264Sps>>();
  const pictureSets = new Map<number, ParameterSet<H264Pps>>();

  const update = (nal: Uint8Array) => {
    switch (nal[0] & 0x1f) {
      case 7:
        storeParameterSet(sequenceSets, nal, parseH264Sps(nal));
        break;
      case 8:
        storeParameterSet(pictureSets, nal, parseH264Pps(nal));
        break;
      default:
        throw new Error('Expected an H.264 SPS or PPS');
    }
  };
  for (const set of format.sequenceParameterSets) {
    update(set.nal);
  }
  for (const set of format.pictureParameterSets) {
    update(set.nal);
  }

  const resolve = (ppsId: number): H264Configuration | undefined => {
    const pps = pictureSets.get(ppsId);
    const sps = pps && sequenceSets.get(pps.info.spsId);
    if (!pps || !sps) {
      return undefined;
    }
    /* Validate the pair at activation. Either set may arrive first. */
    const minQp = -26 - 6 * (sps.info.bitDepthLuma - 8);
    if (pps.info.picInitQpMinus26 < minQp) {
      throw new Error('H.264 PPS quantization does not match its SPS');
    }
    const widthInMbs = sps.info.codedWidth / 16;
    const mapUnits = widthInMbs * (sps.info.codedHeight / 16) / (sps.info.frameMbsOnly ? 1 : 2);
    if (pps.info.sliceGroupChangeRate !== undefined && pps.info.sliceGroupChangeRate > mapUnits) {
      throw new Error('H.264 PPS slice group change rate exceeds picture size');
    }
    if (pps.info.sliceGroupRunLengths?.some((length) => length > mapUnits)) {
      throw new Error('H.264 PPS slice group run exceeds picture size');
    }
    for (const rectangle of pps.info.sliceGroupRectangles ?? []) {
      if (
        rectangle.bottomRight >= mapUnits ||
        rectangle.topLeft % widthInMbs > rectangle.bottomRight % widthInMbs
      ) {
        throw new Error('H.264 PPS slice group rectangle exceeds picture bounds');
      }
    }
    if (pps.info.sliceGroupMapUnits !== undefined && pps.info.sliceGroupMapUnits !== mapUnits) {
      throw new Error('H.264 PPS slice group map size does not match its SPS');
    }
    return { sps, pps };
  };

  /* A rejected update may have replaced any identifier of this type.
   * Keep the other type, but require fresh bytes for the affected sets.
   */
  const invalidate = (type: 7 | 8) => {
    if (type === 7) {
      sequenceSets.clear();
    } else {
      pictureSets.clear();
    }
  };

  return { update, resolve, invalidate };
};
