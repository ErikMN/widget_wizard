import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DateTime, Duration } from 'luxon';
import { VapixParameters, VideoProperties, Format } from 'media-stream-player';
import { PlayerSettings } from './PlayerSettings';
import { CustomStyledIconButton } from './../CustomComponents';
import { darkTheme } from '../../theme';
/* MUI */
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PauseCircleOutlineOutlinedIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import Tooltip from '@mui/material/Tooltip';

function isHTMLMediaElement(el: HTMLElement): el is HTMLMediaElement {
  return (el as HTMLMediaElement).buffered !== undefined;
}

const controlAreaStyle = {
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'sans',
  width: '100%'
} as const;

const controlBarStyle = {
  width: '100%',
  height: '42px',
  background: 'rgb(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  boxSizing: 'border-box'
} as const;

const progressStyle = {
  flexGrow: '2',
  padding: '0 32px',
  display: 'flex',
  alignItems: 'center'
} as const;

const progressBarContainerStyle = {
  margin: '0',
  width: '100%',
  height: '24px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
} as const;

const progressBarStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  height: '2px',
  position: 'relative',
  width: '100%'
} as const;

const progressBarPlayedStyle = (fraction = 0) =>
  ({
    transform: `scaleX(${fraction})`,
    backgroundColor: 'rgb(240, 180, 0)',
    height: '100%',
    position: 'absolute',
    top: '0',
    transformOrigin: '0 0',
    width: '100%'
  }) as const;

const progressBarBufferedStyle = (fraction = 0) =>
  ({
    transform: `scaleX(${fraction})`,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: '100%',
    position: 'absolute',
    top: '0',
    transformOrigin: '0 0',
    width: '100%'
  }) as const;

const progressBarTimestampStyle = (left = 0) =>
  ({
    left: `${left}px`,
    backgroundColor: 'rgb(56, 55, 51)',
    borderRadius: '3px',
    bottom: '200%',
    color: '#fff',
    fontSize: '9px',
    padding: '5px',
    position: 'absolute',
    textAlign: 'center'
  }) as const;

const progressIndicatorStyle = {
  color: 'rgb(240, 180, 0)',
  paddingLeft: '24px',
  fontSize: '10px',
  whiteSpace: 'nowrap'
} as const;

interface ControlsProps {
  readonly play?: boolean;
  readonly videoProperties?: VideoProperties;
  readonly startTime?: string; // 2021-02-03T12:21:57.465715Z
  readonly duration?: number;
  readonly src?: string;
  readonly parameters: VapixParameters;
  readonly onPlay: () => void;
  readonly onStop: () => void;
  readonly onRefresh: () => void;
  readonly onSeek: (offset: number) => void;
  readonly onScreenshot: () => void;
  readonly onFormat: (format: Format) => void;
  readonly onVapix: (key: string, value: string) => void;
  readonly labels?: {
    readonly play?: string;
    readonly pause?: string;
    readonly stop?: string;
    readonly refresh?: string;
    readonly screenshot?: string;
    readonly settings?: string;
    readonly volume?: string;
  };
  readonly showStatsOverlay: boolean;
  readonly toggleStats: () => void;
  readonly format: Format;
  readonly volume?: number;
  readonly setVolume?: (v: number) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  play,
  videoProperties,
  duration,
  startTime,
  src,
  parameters,
  onPlay,
  onStop,
  onRefresh,
  onSeek,
  onScreenshot,
  onFormat,
  onVapix,
  labels,
  showStatsOverlay,
  toggleStats,
  format,
  volume,
  setVolume
}) => {
  const controlArea = useRef(null);

  const [settings, setSettings] = useState(false);
  const toggleSettings = useCallback(() => setSettings((s) => !s), []);

  const onVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (setVolume) setVolume(parseFloat(e.target.value));
    },
    [setVolume]
  );

  const [totalDuration, setTotalDuration] = useState(duration);
  const __mediaTimeline = useRef({
    startDateTime: startTime ? DateTime.fromISO(startTime) : undefined
  });

  /**
   * Progress
   *
   * Compute progress of played and buffered amounts of media. This includes any
   * media before the actual start of the video.
   *
   * The range on videoProperties specifies where we started to play (meaning,
   * the time corresponding to currentTime = 0), and where the playback stops.
   * To avoid having to collect extra data about the actual media length, we
   * treat the end of the range as the end of the actual media (i.e. a simple
   * way to establish the duration).
   *
   * Example:
   *  - range = [0, undefined] => start from the beginning, unknown end
   *  - range = [8, 19] => start from 8s into the media, stop at 19s in which
   *    case currentTime = 0 is actually 8s. In this case the media is actually
   *    25s long, but we cannot display that in our progress. So this system
   *    only works correctly when playing back from any starting point till the
   *    end of the media (i.e. no "chunks" within).
   *
   *    media        0 ------------------------------------------------- 25s
   *    range                     8s ----------------------------- 19s
   *    currentTime               0s ----------------------------- 11s
   *    progress     0 ------------------------------------------- 19s
   *
   *  So we treat the start of the range as offset for total progress, and the
   *  end of the range as total duration. That means we do not handle situations
   *  where the duration is longer than the end of the range.
   *
   * When computing progress, if the duration is Infinity (live playback), we
   * use the total buffered time as a (temporary) duration.
   */
  const [progress, setProgress] = useState({
    playedFraction: 0,
    bufferedFraction: 0,
    counter: ''
  });
  useEffect(() => {
    if (videoProperties === undefined) {
      return;
    }
    const { el, pipeline, range } = videoProperties;
    if (el === null || pipeline === undefined) {
      return;
    }

    // Extract range and update duration accordingly.
    const [start = 0, end = duration] = range ?? [0, duration];
    const __duration = duration ?? end ?? Infinity;
    setTotalDuration(__duration);

    const updateProgress = () => {
      const played = start + pipeline.currentTime;
      const buffered =
        isHTMLMediaElement(el) && el.buffered.length > 0
          ? start + el.buffered.end(el.buffered.length - 1)
          : played;
      const total = __duration === Infinity ? buffered : __duration;

      const counter = `${Duration.fromMillis(played * 1000).toFormat(
        'h:mm:ss'
      )} / ${Duration.fromMillis(total * 1000).toFormat('h:mm:ss')}`;
      setProgress({
        playedFraction: played / total,
        bufferedFraction: buffered / total,
        counter
      });
    };
    updateProgress();

    // Use progress events on media elements
    if (isHTMLMediaElement(el)) {
      el.addEventListener('ended', updateProgress);
      el.addEventListener('progress', updateProgress);
      el.addEventListener('timeupdate', updateProgress);
      return () => {
        el.removeEventListener('timeupdate', updateProgress);
        el.removeEventListener('progress', updateProgress);
        el.removeEventListener('ended', updateProgress);
      };
    }

    // Use polling when not a media element
    const id = setInterval(updateProgress, 1000);
    return () => clearInterval(id);
  }, [videoProperties, duration, startTime]);

  const seek = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (totalDuration === undefined) {
        return;
      }

      const { left, width } = e.currentTarget.getBoundingClientRect();
      const fraction = (e.pageX - left) / width;

      onSeek(fraction * totalDuration);
    },
    [totalDuration, onSeek]
  );

  const [timestamp, setTimestamp] = useState({ left: 0, label: '' });
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startTime) {
      __mediaTimeline.current.startDateTime = DateTime.fromISO(startTime);
    }
    const el = barRef.current;
    if (!el || totalDuration === undefined) return;

    const { left, width } = el.getBoundingClientRect();
    const showTimestamp = (e: PointerEvent) => {
      const offset = e.pageX - left;
      const offsetMillis = (offset / width) * totalDuration * 1000;

      setTimestamp({
        left: offset,
        label: __mediaTimeline.current.startDateTime
          ? __mediaTimeline.current.startDateTime
              .plus(offsetMillis)
              .toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS)
          : Duration.fromMillis(offsetMillis).toFormat('h:mm:ss')
      });
    };
    const start = () => el.addEventListener('pointermove', showTimestamp);
    const stop = () => {
      setTimestamp({ left: 0, label: '' });
      el.removeEventListener('pointermove', showTimestamp);
    };

    el.addEventListener('pointerover', start);
    el.addEventListener('pointerout', stop);
    return () => {
      el.removeEventListener('pointerout', stop);
      el.removeEventListener('pointerover', start);
    };
  }, [startTime, totalDuration]);

  return (
    <div style={controlAreaStyle} ref={controlArea}>
      <div style={controlBarStyle}>
        {play ? (
          <Tooltip title={labels?.pause} arrow placement="top">
            <CustomStyledIconButton
              color="inherit"
              aria-label={labels?.pause}
              onClick={onPlay}
              edge="end"
              sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
            >
              <PauseCircleOutlineOutlinedIcon />
            </CustomStyledIconButton>
          </Tooltip>
        ) : (
          <Tooltip title={labels?.play} arrow placement="top">
            <CustomStyledIconButton
              color="inherit"
              aria-label={labels?.play}
              onClick={onPlay}
              edge="end"
              sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
            >
              <PlayCircleOutlineOutlinedIcon />
            </CustomStyledIconButton>
          </Tooltip>
        )}
        {src && (
          <Tooltip title={labels?.stop} arrow placement="top">
            <CustomStyledIconButton
              color="inherit"
              aria-label={labels?.stop}
              onClick={onStop}
              edge="end"
              sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
            >
              <StopCircleOutlinedIcon />
            </CustomStyledIconButton>
          </Tooltip>
        )}
        {src && (
          <Tooltip title={labels?.refresh} arrow placement="top">
            <CustomStyledIconButton
              color="inherit"
              aria-label={labels?.refresh}
              onClick={onRefresh}
              edge="end"
              sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
            >
              <RefreshOutlinedIcon />
            </CustomStyledIconButton>
          </Tooltip>
        )}
        {src && (
          <Tooltip title={labels?.screenshot} arrow placement="top">
            <CustomStyledIconButton
              color="inherit"
              aria-label={labels?.screenshot}
              onClick={onScreenshot}
              edge="end"
              sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
            >
              <CameraAltOutlinedIcon />
            </CustomStyledIconButton>
          </Tooltip>
        )}
        {volume !== undefined && (
          <div style={{ marginLeft: '8px' }} title={labels?.volume}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              onChange={onVolumeChange}
              value={volume ?? 0}
            />
          </div>
        )}
        <div style={progressStyle}>
          <div style={progressBarContainerStyle} onClick={seek} ref={barRef}>
            <div style={progressBarStyle}>
              <div style={progressBarPlayedStyle(progress.playedFraction)} />
              <div
                style={progressBarBufferedStyle(progress.bufferedFraction)}
              />
              {timestamp.left !== 0 && (
                <div style={progressBarTimestampStyle(timestamp.left)}>
                  {timestamp.label}
                </div>
              )}
            </div>
          </div>
          <div style={progressIndicatorStyle}>
            {totalDuration === Infinity ? '∙ LIVE' : progress.counter}
          </div>
        </div>
        <Tooltip title={labels?.settings} arrow placement="top">
          <CustomStyledIconButton
            color="inherit"
            aria-label={labels?.settings}
            onClick={toggleSettings}
            edge="end"
            sx={{ marginRight: '0px', color: darkTheme.palette.text.primary }}
          >
            <SettingsOutlinedIcon />
          </CustomStyledIconButton>
        </Tooltip>
      </div>
      {settings && (
        <PlayerSettings
          vapixParameters={parameters}
          format={format}
          onFormat={onFormat}
          onVapix={onVapix}
          showStatsOverlay={showStatsOverlay}
          toggleStats={toggleStats}
        />
      )}
    </div>
  );
};
