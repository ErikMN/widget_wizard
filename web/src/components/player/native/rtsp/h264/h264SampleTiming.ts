/* H.264 sample timing
 *
 * RTP supplies presentation timestamps. Construct a decode schedule for
 * progressive pictures using the reordering and timing fields in Annex E.
 * The schedule is for MP4 playback, not a reconstruction of sender DTS.
 */
import type { H264AccessUnit } from './h264AccessUnit';
import type { H264Configuration } from './h264Configuration';
import { H264_CLOCK_RATE } from './h264Timing';

export interface H264TimedSample {
  readonly unit: H264AccessUnit;
  /* All times are in 90 kHz ticks on the presentation clock's timeline. */
  readonly presentationTimestamp: number;
  readonly decodeTimestamp: number;
  readonly duration: number;
  readonly compositionOffset: number;
}

interface PendingSample {
  readonly unit: H264AccessUnit;
  readonly presentationTimestamp: number;
}

const timedSample = (
  sample: PendingSample,
  decodeTimestamp: number,
  duration: number
): H264TimedSample => {
  const compositionOffset = sample.presentationTimestamp - decodeTimestamp;
  /* MP4 version zero trun stores durations and offsets as unsigned 32-bit values. */
  if (
    !Number.isSafeInteger(decodeTimestamp) ||
    !Number.isSafeInteger(compositionOffset) ||
    compositionOffset > 0xffffffff ||
    !Number.isInteger(duration) ||
    duration < 1 || duration > 0xffffffff ||
    !Number.isSafeInteger(decodeTimestamp + duration) ||
    !Number.isSafeInteger(sample.presentationTimestamp + duration)
  ) {
    throw new Error('Invalid H.264 sample timing');
  }
  return { ...sample, decodeTimestamp, duration, compositionOffset };
};

/* BigInt division truncates towards zero. Negative decode times need floor. */
const floorDivide = (numerator: bigint, denominator: bigint): bigint => {
  if (numerator < 0n) {
    return -((-numerator + denominator - 1n) / denominator);
  }
  return numerator / denominator;
};

/* One timeline per uninterrupted run of pictures with the same configuration.
 * Start with an IDR. Use the extended RTP clock for presentationTimestamp.
 * A rejected sample closes the timeline and discards pending data.
 * On loss, source change or configuration change, create another timeline.
 * Do not extend a pending sample across loss.
 */
export const createH264SampleTimeline = (configuration: H264Configuration) => {
  const { frameMbsOnly, vui } = configuration.sps.info;
  const reorder = vui?.maxNumReorderFrames;
  if (!frameMbsOnly || vui?.picStructPresent || reorder === undefined) {
    throw new Error('Unsupported H.264 picture timing');
  }

  /* For reordered pictures require an explicitly declared fixed cadence.
   * A progressive frame without pic_struct spans two VUI clock ticks.
   */
  let cadence: { numerator: bigint; denominator: bigint } | undefined;
  if (reorder > 0) {
    const timing = vui?.timing;
    if (!timing?.fixedFrameRate) {
      throw new Error('H.264 reordered pictures require fixed frame timing');
    }
    const numerator = BigInt(timing.numUnitsInTick) * BigInt(2 * H264_CLOCK_RATE);
    const denominator = BigInt(timing.timeScale);
    if (numerator < denominator || denominator <= 0n) {
      throw new Error('Invalid H.264 frame cadence');
    }
    cadence = { numerator, denominator };
  }

  let source: number | undefined;
  let anchor = 0;
  let pending: PendingSample | undefined;
  let decodeIndex = 0n;
  let nextPresentationIndex = 0n;
  const waiting = new Set<bigint>();
  let closed = false;

  const pushSample = (
    unit: H264AccessUnit,
    presentationTimestamp: number
  ): H264TimedSample | undefined => {
    if (
      unit.configuration.sps !== configuration.sps ||
      unit.configuration.pps !== configuration.pps ||
      (source !== undefined && (unit.ssrc !== source || unit.discontinuity))
    ) {
      throw new Error('H.264 sample timeline requires a new run');
    }
    if (!Number.isSafeInteger(presentationTimestamp)) {
      throw new Error('Invalid H.264 presentation timestamp');
    }
    if (source === undefined) {
      if (!unit.isIdr) {
        throw new Error('H.264 sample timeline must start with an IDR');
      }
      source = unit.ssrc;
      anchor = presentationTimestamp;
    }
    const sample = { unit, presentationTimestamp };

    if (!cadence) {
      /* Without reordering, use the next presentation time for duration. */
      const result = pending && timedSample(
        pending,
        pending.presentationTimestamp,
        presentationTimestamp - pending.presentationTimestamp
      );
      pending = sample;
      return result;
    }

    const { numerator, denominator } = cadence;
    const relative = BigInt(presentationTimestamp) - BigInt(anchor);
    if (relative < 0n) {
      throw new Error('H.264 presentation time precedes the IDR');
    }
    const scaled = relative * denominator;
    const index = (scaled + numerator / 2n) / numerator;
    const difference = scaled - index * numerator;
    /* Allow less than one RTP tick of quantization error relative to the IDR. */
    if (difference <= -denominator || difference >= denominator) {
      throw new Error('H.264 presentation time does not match fixed cadence');
    }
    if (index < nextPresentationIndex || waiting.has(index)) {
      throw new Error('Duplicate H.264 presentation time');
    }
    if (index > nextPresentationIndex && waiting.size >= reorder) {
      throw new Error('H.264 picture exceeds the declared reorder bound');
    }

    /* Schedule decode ahead of presentation by the declared reorder bound.
     * Round each boundary, not each duration, to avoid accumulating error.
     */
    const decodeOffset = decodeIndex - BigInt(reorder);
    const start = floorDivide(decodeOffset * numerator, denominator);
    const end = floorDivide((decodeOffset + 1n) * numerator, denominator);
    const result = timedSample(sample, Number(BigInt(anchor) + start), Number(end - start));
    if (result.compositionOffset < 0) {
      throw new Error('H.264 picture exceeds the declared reorder bound');
    }

    waiting.add(index);
    while (waiting.delete(nextPresentationIndex)) {
      nextPresentationIndex++;
    }
    decodeIndex++;
    return result;
  };

  const close = () => {
    closed = true;
    pending = undefined;
    waiting.clear();
  };

  const push = (
    unit: H264AccessUnit,
    presentationTimestamp: number
  ): H264TimedSample | undefined => {
    if (closed) {
      throw new Error('H.264 sample timeline is closed');
    }
    try {
      return pushSample(unit, presentationTimestamp);
    } catch (error) {
      close();
      throw error;
    }
  };

  /* Only call at a clean end. Without a known final duration, the last
   * non-reordered sample cannot be timed. An interrupted run is discarded.
   */
  const finish = (lastDuration?: number): H264TimedSample | undefined => {
    if (closed) {
      return undefined;
    }
    const incomplete = cadence !== undefined && waiting.size !== 0;
    const last = pending;
    close();
    if (incomplete) {
      throw new Error('Incomplete H.264 presentation sequence');
    }
    if (last && lastDuration !== undefined) {
      return timedSample(last, last.presentationTimestamp, lastDuration);
    }
    return undefined;
  };

  return { push, finish };
};
