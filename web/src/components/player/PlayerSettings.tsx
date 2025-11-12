import React, { ChangeEventHandler, useCallback } from 'react';
import { VapixParameters, Format } from 'media-stream-player';
import { CustomSwitch } from '../CustomComponents';
import { useParameters } from '../ParametersContext';
import { useAppContext } from '../AppContext';

interface PlayerSettingsProps {
  readonly vapixParameters: VapixParameters;
  readonly format: Format;
  readonly onFormat: (format: Format) => void;
  readonly onVapix: (key: string, value: string) => void;
  readonly showStatsOverlay: boolean;
  readonly toggleStats: (newValue?: boolean) => void;
}

export const PlayerSettings: React.FC<PlayerSettingsProps> = ({
  vapixParameters,
  format,
  onFormat,
  onVapix,
  showStatsOverlay,
  toggleStats
}) => {
  /* Global state */
  const { setCurrentChannel } = useAppContext();

  /* Global parameter list */
  const { parameters } = useParameters();
  const Resolution = parameters?.['root.Properties.Image.Resolution'];
  const NbrOfSourcesStr = parameters?.['root.ImageSource.NbrOfSources'] ?? '1';
  const NbrOfSources = parseInt(NbrOfSourcesStr, 10);
  const cameraOptions = isNaN(NbrOfSources)
    ? [1]
    : Array.from({ length: NbrOfSources }, (_, i) => i + 1);

  const changeStatsOverlay = useCallback(
    (_e: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
      toggleStats(checked),
    [toggleStats]
  );

  const changeFormat: ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => onFormat(e.target.value as Format),
    [onFormat]
  );

  const changeResolution: ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => onVapix('resolution', e.target.value),
    [onVapix]
  );

  const changeRotation: ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => onVapix('rotation', e.target.value),
    [onVapix]
  );

  const changeCompression: ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => onVapix('compression', e.target.value),
    [onVapix]
  );

  const changeCamera: ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => {
      const value = e.target.value;
      onVapix('camera', value);
      setCurrentChannel(value);
    },
    [onVapix, setCurrentChannel]
  );

  /* Parse supported resolutions */
  const supportedResolutions = React.useMemo(() => {
    if (typeof Resolution !== 'string') return [];
    const list = Resolution.includes('=')
      ? Resolution.split('=', 2)[1]
      : Resolution;
    return list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [Resolution]);

  /* Aspect ratio helper */
  const gcd = (a: number, b: number): number => {
    while (b) [a, b] = [b, a % b];
    return a;
  };

  /* Calculate the aspect ratio of a resolution */
  const aspectOf = (res: string): string => {
    const m = res.match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/);
    if (!m) {
      return '';
    }

    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (!(w > 0 && h > 0)) {
      return '';
    }

    const g = gcd(w, h);
    let a = w / g;
    let b = h / g;

    /* Normalize common naming */
    if (a === 8 && b === 5) {
      return '16:10'; // prefer 16:10 over 8:5
    }

    return `${a}:${b}`;
  };

  return (
    <div
      style={{
        background: 'rgb(16, 16, 16, 0.8)',
        bottom: '32px',
        color: 'white',
        display: 'grid',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        gridTemplateColumns: '30% 70%',
        gridTemplateRows: 'auto',
        marginBottom: '16px',
        marginRight: '8px',
        padding: '8px 12px',
        position: 'absolute',
        right: '0',
        rowGap: '4px',
        width: '320px'
      }}
    >
      <div>Camera</div>
      <select value={vapixParameters['camera'] ?? '1'} onChange={changeCamera}>
        {cameraOptions.map((num) => (
          <option key={num} value={String(num)}>
            Camera {num}
          </option>
        ))}
      </select>

      <div>Format</div>
      <select onChange={changeFormat} defaultValue={format}>
        <option value="RTP_H264">H.264 (RTP over WS)</option>
        <option value="MP4_H264">H.264 (MP4 over HTTP)</option>
        <option value="RTP_JPEG">Motion JPEG</option>
        <option value="JPEG">Still image</option>
      </select>

      <div>Resolution</div>
      <select
        value={vapixParameters['resolution'] ?? ''}
        onChange={changeResolution}
      >
        <option value="">default</option>
        {supportedResolutions.map((res) => (
          <option key={res} value={res}>
            {res.replace(/x/i, ' x ')} ({aspectOf(res)})
          </option>
        ))}
      </select>

      <div>Compression</div>
      <select
        value={vapixParameters['compression']}
        onChange={changeCompression}
      >
        <option value="">default</option>
        {Array.from({ length: 11 }, (_, i) => i * 10).map((val) => (
          <option key={val} value={String(val)}>
            {val}
          </option>
        ))}
      </select>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          whiteSpace: 'nowrap'
        }}
      >
        <span>Stats overlay</span>
        <CustomSwitch
          name="stats"
          checked={showStatsOverlay}
          onChange={changeStatsOverlay}
        />
      </div>
    </div>
  );
};
