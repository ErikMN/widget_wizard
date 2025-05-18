import React, { ChangeEventHandler, useCallback } from 'react';
import { VapixParameters, Format } from 'media-stream-player';
import { CustomSwitch } from '../CustomComponents';

interface PlayerSettingsProps {
  readonly parameters: VapixParameters;
  readonly format: Format;
  readonly onFormat: (format: Format) => void;
  readonly onVapix: (key: string, value: string) => void;
  readonly showStatsOverlay: boolean;
  readonly toggleStats: (newValue?: boolean) => void;
}

export const PlayerSettings: React.FC<PlayerSettingsProps> = ({
  parameters,
  format,
  onFormat,
  onVapix,
  showStatsOverlay,
  toggleStats
}) => {
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
    (e) => onVapix('camera', e.target.value),
    [onVapix]
  );

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
      {/* TODO: Make dynamic */}
      <div>Camera</div>
      <select value={parameters['camera'] ?? '1'} onChange={changeCamera}>
        {[1, 2, 3, 4].map((num) => (
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
      <select value={parameters['resolution']} onChange={changeResolution}>
        <option value="">default</option>
        <option value="1920x1080">1920 x 1080 (FHD)</option>
        <option value="1280x720">1280 x 720 (HD)</option>
        <option value="800x600">800 x 600 (VGA)</option>
      </select>

      <div>Compression</div>
      <select value={parameters['compression']} onChange={changeCompression}>
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
