/**
 * PlayerSettings
 *
 * Handle the settings for the video player:
 *   - Camera selection
 *   - Video format
 *   - Resolution
 *   - Compression
 *   - FPS
 *   - Stats overlay toggle
 */
import React, { ChangeEventHandler, useCallback, useEffect } from 'react';
import { VapixParameters, Format } from 'media-stream-player';
import { CustomSwitch } from '../CustomComponents';
import { useParameters } from '../ParametersContext';
import { useAppContext } from '../AppContext';
/* MUI */
import { useTheme, alpha } from '@mui/material/styles';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

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
  /* Theme */
  const theme = useTheme();

  /* Global state */
  const { setCurrentChannel } = useAppContext();

  /* Local state */
  const [fpsValue, setFpsValue] = React.useState<string>(
    vapixParameters['fps'] ?? ''
  );
  const [compressionValue, setCompressionValue] = React.useState<string>(
    vapixParameters['compression'] ?? ''
  );

  /* Error state */
  const [fpsError, setFpsError] = React.useState<string>('');
  const [compressionError, setCompressionError] = React.useState<string>('');

  /* Refs */
  const fpsTimerRef = React.useRef<number | null>(null);
  const compressionTimerRef = React.useRef<number | null>(null);

  /* Global parameter list */
  const { parameters } = useParameters();
  const Resolution = parameters?.['root.Properties.Image.Resolution'];
  const NbrOfSourcesStr = parameters?.['root.ImageSource.NbrOfSources'] ?? '1';
  const NbrOfSources = parseInt(NbrOfSourcesStr, 10);
  const cameraOptions = isNaN(NbrOfSources)
    ? [1]
    : Array.from({ length: NbrOfSources }, (_, i) => i + 1);

  useEffect(() => {
    setFpsValue(vapixParameters['fps'] ?? '');
  }, [vapixParameters['fps']]);

  useEffect(() => {
    setCompressionValue(vapixParameters['compression'] ?? '');
  }, [vapixParameters['compression']]);

  const changeStatsOverlay = useCallback(
    (_e: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
      toggleStats(checked),
    [toggleStats]
  );

  const changeFormat: ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = useCallback((e) => onFormat(e.target.value as Format), [onFormat]);

  const changeResolution: ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = useCallback((e) => onVapix('resolution', e.target.value), [onVapix]);

  const changeRotation: ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = useCallback((e) => onVapix('rotation', e.target.value), [onVapix]);

  const changeCompression: ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = useCallback(
    (e) => {
      const raw = e.target.value;
      /* Update local value immediately for realtime typing */
      setCompressionValue(raw);

      /* Allow empty for "default" */
      if (raw === '') {
        setCompressionError('');
        if (compressionTimerRef.current !== null) {
          clearTimeout(compressionTimerRef.current);
        }
        compressionTimerRef.current = window.setTimeout(() => {
          onVapix('compression', '');
        }, 1000);
        return;
      }
      /* Only digits */
      if (!/^\d+$/.test(raw)) {
        setCompressionError('Only digits 0-9 allowed');
        return;
      }
      const num = Number(raw);
      if (num < 0 || num > 100) {
        setCompressionError('Value must be between 0 and 100');
        return;
      }
      setCompressionError('');
      /* Debounce actual apply by 1s */
      if (compressionTimerRef.current !== null) {
        clearTimeout(compressionTimerRef.current);
      }
      compressionTimerRef.current = window.setTimeout(() => {
        onVapix('compression', raw);
      }, 1000);
    },
    [onVapix]
  );

  const changeCamera: ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = useCallback(
    (e) => {
      const value = e.target.value;
      onVapix('camera', value);
      setCurrentChannel(value);
    },
    [onVapix, setCurrentChannel]
  );

  const changeFps: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =
    useCallback(
      (e) => {
        const raw = e.target.value;
        /* Update local value immediately for realtime typing */
        setFpsValue(raw);

        /* Allow empty for "default" */
        if (raw === '') {
          setFpsError('');
          if (fpsTimerRef.current !== null) {
            clearTimeout(fpsTimerRef.current);
          }
          fpsTimerRef.current = window.setTimeout(() => {
            onVapix('fps', '');
          }, 1000);
          return;
        }
        /* Only digits */
        if (!/^\d+$/.test(raw)) {
          setFpsError('Only digits 0-9 allowed');
          return;
        }
        const num = Number(raw);
        if (num < 0 || num > 999) {
          setFpsError('Value must be between 0 and 999');
          return;
        }
        setFpsError('');
        /* Debounce actual apply by 1s */
        if (fpsTimerRef.current !== null) {
          clearTimeout(fpsTimerRef.current);
        }
        fpsTimerRef.current = window.setTimeout(() => {
          onVapix('fps', raw);
        }, 1000);
      },
      [onVapix]
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
        background: alpha(theme.palette.background.paper, 0.8),
        bottom: '32px',
        color: theme.palette.text.primary,
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
        width: '360px',
        alignItems: 'center' /* center labels with controls */
      }}
    >
      <div>Camera</div>
      <TextField
        select
        size="small"
        value={vapixParameters['camera'] ?? '1'}
        onChange={changeCamera}
      >
        {cameraOptions.map((num) => (
          <MenuItem disableRipple key={num} value={String(num)}>
            Camera {num}
          </MenuItem>
        ))}
      </TextField>

      <div>Format</div>
      <TextField select size="small" value={format} onChange={changeFormat}>
        <MenuItem disableRipple value="RTP_H264">
          H.264 (RTP over WS)
        </MenuItem>
        <MenuItem disableRipple value="MP4_H264">
          H.264 (MP4 over HTTP)
        </MenuItem>
        <MenuItem disableRipple value="RTP_JPEG">
          Motion JPEG (MJPEG over WS)
        </MenuItem>
        <MenuItem disableRipple value="MJPEG">
          Motion JPEG (MJPEG over HTTP)
        </MenuItem>
        <MenuItem disableRipple value="JPEG">
          Still image
        </MenuItem>
      </TextField>

      <div>Resolution</div>
      <TextField
        select
        size="small"
        value={vapixParameters['resolution'] ?? ''}
        onChange={changeResolution}
        slotProps={{
          select: {
            displayEmpty: true
          }
        }}
      >
        <MenuItem disableRipple value="">
          Default resolution
        </MenuItem>
        {supportedResolutions.map((res) => (
          <MenuItem disableRipple key={res} value={res}>
            {res.replace(/x/i, ' x ')} ({aspectOf(res)})
          </MenuItem>
        ))}
      </TextField>

      <div>Compression</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <TextField
          variant="outlined"
          size="small"
          value={compressionValue}
          onChange={changeCompression}
          placeholder="Default compression"
          error={compressionError !== ''}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              maxLength: 3
            }
          }}
        />
        {compressionError && (
          <div style={{ color: theme.palette.error.main, fontSize: '12px' }}>
            {compressionError}
          </div>
        )}
      </div>

      <div>FPS (0 = ∞)</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <TextField
          variant="outlined"
          size="small"
          value={fpsValue}
          onChange={changeFps}
          placeholder="Default FPS"
          error={fpsError !== ''}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              maxLength: 3
            }
          }}
        />
        {fpsError && (
          <div style={{ color: theme.palette.error.main, fontSize: '12px' }}>
            {fpsError}
          </div>
        )}
      </div>

      <div>Client stream information</div>
      <CustomSwitch
        name="stats"
        checked={showStatsOverlay}
        onChange={changeStatsOverlay}
        sx={{ justifySelf: 'flex-end', marginRight: '-4px' }}
      />
    </div>
  );
};
