/* H.264 RTP format parameters (RFC 6184, section 8.1)
 *
 * Read the packetization mode and parameter sets advertised in SDP. Keep
 * every SPS and PPS with its identifier instead of assuming their order.
 * Missing parameter sets are valid; the stream may supply them in-band.
 * The actual codec identifier comes from the selected SPS, not the SDP hint.
 */
import {
  parseH264Sps,
  parseH264Pps,
  type H264Sps,
  type H264Pps
} from './h264ParameterSets';

export interface H264Format {
  readonly packetizationMode: 0 | 1;
  readonly profileLevelId?: string;
  readonly sequenceParameterSets: readonly { nal: Uint8Array; info: H264Sps }[];
  readonly pictureParameterSets: readonly { nal: Uint8Array; info: H264Pps }[];
}

const decodeParameterSet = (value: string): Uint8Array => {
  /* AVC configuration records store parameter set lengths in 16 bits. */
  if (!value || value.length > 87380 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid H.264 SDP parameter set encoding');
  }
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
};

export const parseH264Format = (value?: string): H264Format => {
  const parameters = new Map<string, string>();
  for (const entry of (value ?? '').split(';')) {
    if (!entry.trim()) {
      continue;
    }
    const equals = entry.indexOf('=');
    const name = entry.slice(0, equals).trim().toLowerCase();
    if (equals < 1 || !name || parameters.has(name)) {
      throw new Error('Invalid or duplicate H.264 format parameter');
    }
    parameters.set(name, entry.slice(equals + 1).trim());
  }
  const mode = parameters.get('packetization-mode') ?? '0';
  if (mode !== '0' && mode !== '1') {
    throw new Error('Unsupported H.264 packetization mode');
  }
  const profileLevelId = parameters.get('profile-level-id')?.toLowerCase();
  if (profileLevelId !== undefined && !/^[0-9a-f]{6}$/.test(profileLevelId)) {
    throw new Error('Invalid H.264 profile-level-id');
  }
  const sequenceParameterSets: { nal: Uint8Array; info: H264Sps }[] = [];
  const pictureParameterSets: { nal: Uint8Array; info: H264Pps }[] = [];
  const encoded = parameters.get('sprop-parameter-sets');
  if (encoded !== undefined) {
    for (const entry of encoded.split(',')) {
      const nal = decodeParameterSet(entry.trim());
      switch (nal[0] & 0x1f) {
        case 7: {
          const info = parseH264Sps(nal);
          if (sequenceParameterSets.some((set) => set.info.id === info.id)) {
            throw new Error('Duplicate H.264 SPS identifier');
          }
          sequenceParameterSets.push({ nal, info });
          break;
        }
        case 8: {
          const info = parseH264Pps(nal);
          if (pictureParameterSets.some((set) => set.info.id === info.id)) {
            throw new Error('Duplicate H.264 PPS identifier');
          }
          pictureParameterSets.push({ nal, info });
          break;
        }
        default:
          throw new Error('Unsupported H.264 SDP parameter set type');
      }
    }
  }
  return {
    packetizationMode: mode === '1' ? 1 : 0,
    profileLevelId,
    sequenceParameterSets,
    pictureParameterSets
  };
};
