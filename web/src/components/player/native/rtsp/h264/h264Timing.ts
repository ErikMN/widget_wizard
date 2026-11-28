/* H.264 RTP presentation timing
 *
 * RFC 6184 section 5.1 specifies a 90 kHz sampling clock. RFC 3550
 * section 5.1 permits non-monotonic timestamps in transmission order.
 * Extend the unsigned 32-bit timestamps without sorting pictures or
 * treating backwards presentation timestamps as decode durations.
 */
import type { H264AccessUnit } from './h264AccessUnit';

export const H264_CLOCK_RATE = 90000;

const RTP_TIMESTAMP_RANGE = 0x100000000;
const RTP_TIMESTAMP_HALF_RANGE = RTP_TIMESTAMP_RANGE / 2;

/* One clock per negotiated track. Timestamps are relative to the first
 * picture of each source. Keep the clock across loss and configuration
 * changes within a source; create a new clock after a seek or new session.
 * Consecutive timestamps must differ by less than half the RTP clock range.
 */
export const createH264PresentationClock = () => {
  let source: number | undefined;
  let previousTimestamp = 0;
  let presentationTimestamp = 0;

  return (unit: Pick<H264AccessUnit, 'ssrc' | 'timestamp'>): number => {
    const { ssrc, timestamp } = unit;
    if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp >= RTP_TIMESTAMP_RANGE) {
      throw new Error('Invalid H.264 RTP timestamp');
    }
    if (ssrc !== source) {
      source = ssrc;
      previousTimestamp = timestamp;
      presentationTimestamp = 0;
      return presentationTimestamp;
    }

    let delta = timestamp - previousTimestamp;
    if (Math.abs(delta) === RTP_TIMESTAMP_HALF_RANGE) {
      throw new Error('Ambiguous H.264 RTP timestamp difference');
    }
    if (delta > RTP_TIMESTAMP_HALF_RANGE) {
      delta -= RTP_TIMESTAMP_RANGE;
    } else if (delta < -RTP_TIMESTAMP_HALF_RANGE) {
      delta += RTP_TIMESTAMP_RANGE;
    }

    const next = presentationTimestamp + delta;
    if (!Number.isSafeInteger(next)) {
      throw new Error('H.264 presentation timestamp exceeds integer range');
    }
    previousTimestamp = timestamp;
    presentationTimestamp = next;
    return presentationTimestamp;
  };
};
