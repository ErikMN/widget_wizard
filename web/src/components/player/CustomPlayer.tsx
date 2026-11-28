/**
 * CustomPlayer
 *
 * Manages playback settings, controls and the player layout.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { VideoProperties } from 'media-stream-player';
import {
  getAvailableStreamFormats,
  getStreamFormat,
  type PlaybackRequest,
  type PlayerNativeElement,
  type StreamFormat,
  type VapixParameters
} from './native/types';
import { useAppSettingsContext } from '../context/AppContext';
import { useParameters } from '../context/ParametersContext';
import { Feedback } from './Feedback';
import { NoVideoIndicator } from './NoVideoIndicator';
import { Container, Layer } from './PlayerContainer';
import { Limiter } from './Limiter';
import { PlayerControls } from './PlayerControls';
import { SystemStatsOverlay } from './SystemStatsOverlay';
import { getImageURL } from './GetImageURL';
import { PlaybackArea } from './native/PlaybackArea';
import {
  getPlayableResolution,
  getSupportedResolutions
} from './native/streamResolutions';
import { usePlaybackProperties } from './native/usePlaybackProperties';
import { StreamStats } from './native/StreamStats';
import { readLegacyStreamMetrics } from './native/legacyStreamStats';

import {
  useSwitch,
  useScreenSizes,
  useLocalStorage
} from '../../helpers/hooks';

const DEFAULT_FORMAT: StreamFormat = 'MP4_H264';

interface CustomPlayerProps {
  /**
   * Callback from Controls to toggle fullscreen mode on the outer player container.
   * Expected to call requestFullscreen() or exitFullscreen on the container element.
   * If omitted, the fullscreen button should be hidden/disabled by the parent.
   */
  readonly onToggleFullscreen?: () => void;
  /**
   * True when the outer player container is currently in fullscreen.
   * Derived by the parent from !!document.fullscreenElement via the
   * 'fullscreenchange' event and passed down for UI state (icon/text).
   */
  readonly isFullscreen?: boolean;

  /* Notify parent to update dimensions */
  readonly onStreamChange?: () => void;

  readonly hostname: string;
  readonly vapixParams?: VapixParameters;
  readonly initialFormat?: StreamFormat;
  readonly autoPlay?: boolean;
  /**
   * Set to true if the camera requires a secure
   * connection, "https" and "wss" protocols.
   */
  readonly secure?: boolean;
  readonly aspectRatio?: number;
  readonly className?: string;
  /**
   * When playing a recording, the time the video started
   * (used for labeling with an absolute time) formatted
   * as an ISO time, e.g.: 2021-02-03T12:21:57.465715Z
   */
  readonly startTime?: string;
  /**
   * When playing a recording, the total duration of the video
   * if known by the user (and not reported from backend) in
   * seconds.
   */
  readonly duration?: number;

  /**
   * Activate automatic retries on RTSP errors.
   */
  readonly autoRetry?: boolean;
}

export const CustomPlayer = forwardRef<PlayerNativeElement, CustomPlayerProps>(
  (
    {
      hostname,
      vapixParams = {},
      initialFormat = DEFAULT_FORMAT,
      autoPlay = false,
      secure,
      className,
      startTime,
      duration,
      autoRetry = false,
      onToggleFullscreen,
      isFullscreen,
      onStreamChange
    },
    ref
  ) => {
    const [play, setPlay] = useState(autoPlay);
    const [offset, setOffset] = useState(0);
    const [refresh, setRefresh] = useState(0);
    const [host, setHost] = useState(hostname);
    const [expanded, setExpanded] = useState(true);

    /**
     * Playback intent is separate from the temporary stream state.
     *
     * Visibility changes stop the actual stream connection while the page is hidden,
     * but they must not turn an explicit user Stop into an automatic restart later.
     */
    const playbackRequestedRef = useRef(autoPlay);

    /* Global app context */
    const { appSettings } = useAppSettingsContext();

    /* Global parameter list */
    const { parameters: globalParameters } = useParameters();
    const backendAvailable =
      globalParameters?.['root.Widget_wizard.ApplicationRunning'];

    const [savedFormat, setFormat] = useLocalStorage(
      'streamFormat',
      initialFormat,
      false
    ) as [unknown, (v: StreamFormat) => void];
    const deviceFormats = globalParameters?.['root.Properties.Image.Format'];
    const availableFormats = useMemo(
      () => getAvailableStreamFormats(deviceFormats),
      [deviceFormats]
    );
    const format = getStreamFormat(savedFormat, initialFormat, availableFormats);

    /**
     * VAPIX parameters
     */
    const [vapixParameters, setVapixParameters] = useState(vapixParams);
    const camera = vapixParameters['camera'];
    const supportedResolutions = useMemo(
      () => getSupportedResolutions(globalParameters, format, camera),
      [globalParameters, format, camera]
    );
    const resolution = getPlayableResolution(
      vapixParameters['resolution'],
      supportedResolutions
    );
    const playbackParameters = useMemo(() => {
      if (resolution === vapixParameters['resolution']) {
        return vapixParameters;
      }

      const parameters = { ...vapixParameters };
      delete parameters.resolution;
      return parameters;
    }, [resolution, vapixParameters]);

    useEffect(() => {
      /**
       * Check if localStorage actually exists, since if you
       * server side render, localStorage won't be available.
       */
      if (window?.localStorage !== undefined) {
        window.localStorage.setItem('vapix', JSON.stringify(vapixParameters));
      }
    }, [vapixParameters]);

    /**
     * Stats overlay
     */
    const [showStatsOverlay, toggleStatsOverlay] = useSwitch(
      window?.localStorage !== undefined
        ? window.localStorage.getItem('stats-overlay') === 'on'
        : false
    ) as [boolean, (state?: boolean) => void];

    useEffect(() => {
      if (window?.localStorage !== undefined) {
        window.localStorage.setItem(
          'stats-overlay',
          showStatsOverlay ? 'on' : 'off'
        );
      }
    }, [showStatsOverlay]);

    /**
     * System stats overlay
     */
    const [showSystemStatsOverlay, toggleSystemStatsOverlay] = useSwitch(
      window?.localStorage !== undefined
        ? window.localStorage.getItem('system-stats-overlay') === 'on'
        : false
    ) as [boolean, (state?: boolean) => void];

    useEffect(() => {
      if (window?.localStorage !== undefined) {
        window.localStorage.setItem(
          'system-stats-overlay',
          showSystemStatsOverlay ? 'on' : 'off'
        );
      }
    }, [showSystemStatsOverlay]);

    const systemStatsVisible =
      (appSettings.debug || backendAvailable !== undefined) &&
      showSystemStatsOverlay;

    /**
     * Controls
     */
    const onRefresh = useCallback(() => {
      playbackRequestedRef.current = true;
      setPlay(true);
      setRefresh((value) => value + 1);
    }, []);

    /**
     * Retry an ended stream only while playback is still requested.
     */
    const retryEndedStream = useCallback(() => {
      if (
        autoRetry &&
        playbackRequestedRef.current &&
        document.visibilityState === 'visible'
      ) {
        onRefresh();
      }
    }, [autoRetry, onRefresh]);

    /* A new request invalidates properties even if the resolution is unchanged. */
    const playbackRequest = useMemo<PlaybackRequest>(
      () => ({
        play,
        format,
        refresh,
        offset,
        host,
        secure,
        parameters: playbackParameters
      }),
      [play, format, refresh, offset, host, secure, playbackParameters]
    );
    const {
      videoProperties,
      waiting,
      ended,
      naturalAspectRatio,
      volume,
      setVolume,
      onPlaying,
      onEnded
    } = usePlaybackProperties<VideoProperties>(
      play && host ? playbackRequest : undefined,
      retryEndedStream
    );
    const readMetrics = useCallback(
      () => (videoProperties ? readLegacyStreamMetrics(videoProperties) : {}),
      [videoProperties]
    );

    /* Screen size */
    const { isMobile } = useScreenSizes();

    const onPlayStop = useCallback(() => {
      if (host) {
        playbackRequestedRef.current = false;
        setPlay(false);
        setHost('');
      } else {
        playbackRequestedRef.current = true;
        setHost(hostname);
        setPlay(true);
      }
    }, [host, hostname]);

    const onScreenshot = useCallback(() => {
      if (videoProperties === undefined) {
        return undefined;
      }

      const { el, width, height } = videoProperties;
      const imageURL = getImageURL(el, { width, height });
      const link = document.createElement('a');
      const event = new window.MouseEvent('click');

      link.download = `snapshot_${Date.now()}.jpg`;
      link.href = imageURL;
      link.dispatchEvent(event);
    }, [videoProperties]);

    const onVapix = useCallback(
      (key: string, value: string) => {
        setVapixParameters((p: typeof vapixParams) => {
          const newParams = { ...p, [key]: value };
          if (value === '') {
            delete newParams[key];
          }
          return newParams;
        });
        setRefresh((refreshCount) => refreshCount + 1);
      },
      []
    );

    /**
     * Reconnect playback after the page becomes visible again.
     *
     * Hiding the page closes the current stream but keeps the user's play/stop choice.
     * When the page becomes visible, a new stream is opened only if playback is still requested.
     */
    useEffect(() => {
      const cb = () => {
        if (document.visibilityState === 'visible') {
          if (!playbackRequestedRef.current) {
            return;
          }

          setPlay(true);
          setHost(hostname);
          setRefresh((value) => value + 1);
        } else if (document.visibilityState === 'hidden') {
          setPlay(false);
          setHost('');
        }
      };

      document.addEventListener('visibilitychange', cb);

      return () => document.removeEventListener('visibilitychange', cb);
    }, [hostname]);

    /**
     * Limit video size.
     *
     * The video size should not expand outside the available container, and
     * should be recomputed on resize.
     */
    const limiterRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      if (naturalAspectRatio === undefined || limiterRef.current === null) {
        return;
      }

      const observer = new window.ResizeObserver(([entry]) => {
        const element = entry.target as HTMLElement;
        if (!isMobile) {
          const maxWidth = element.clientHeight * naturalAspectRatio;
          element.style.maxWidth = `${maxWidth}px`;
        } else {
          /* Mobile mode: no width limit */
          element.style.maxWidth = '100%';
        }
        /* Available player space can move the video without changing its size. */
        onStreamChange?.();
      });
      observer.observe(limiterRef.current);

      return () => observer.disconnect();
    }, [naturalAspectRatio, isMobile, onStreamChange]);

    /**
     * Volume control on the VideoElement (h264 only)
     */
    useEffect(() => {
      if (videoProperties?.volume !== undefined && volume !== undefined) {
        const videoEl = videoProperties.el as HTMLVideoElement;
        videoEl.muted = volume === 0;
        videoEl.volume = volume;
      }
    }, [videoProperties, volume]);

    /* Measure after React commits stream and layout changes. */
    useLayoutEffect(() => {
      onStreamChange?.();
    }, [
      format,
      refresh,
      host,
      play,
      videoProperties,
      naturalAspectRatio,
      isMobile,
      isFullscreen,
      showStatsOverlay,
      expanded,
      onStreamChange
    ]);

    /**
     * Toggle expand stats
     */
    const handleExpandStats = useCallback((_value: boolean) => {
      setExpanded((prev) => !prev);
    }, []);

    /**
     * Render
     *
     * Each layer is positioned exactly on top of the visible image, since the
     * aspect ratio is carried over to the container, and the layers match the
     * container size.
     *
     * There is a layer for the spinner (feedback), a statistics overlay, and a
     * control bar with play/pause/stop/refresh and a settings menu.
     */
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
        className={className}
      >
        {/* Client stream data */}
        {showStatsOverlay && videoProperties && (
          <div style={{ position: 'static', zIndex: 10 }}>
            <StreamStats
              format={format}
              width={videoProperties.width}
              height={videoProperties.height}
              readMetrics={readMetrics}
              refresh={refresh}
              volume={volume}
              expanded={expanded}
              onToggleExpanded={handleExpandStats}
            />
          </div>
        )}
        <SystemStatsOverlay visible={systemStatsVisible}>
          <Limiter ref={limiterRef}>
            <Container aspectRatio={naturalAspectRatio}>
              <Layer>
                <PlaybackArea
                  ref={ref}
                  request={playbackRequest}
                  onPlaying={onPlaying}
                  onEnded={onEnded}
                  autoRetry={autoRetry}
                />
              </Layer>
              <Layer>
                {/*
                  Show Feedback only while the stream is starting:
                  - host: a real backend endpoint is set
                  - play: the user has requested playback
                  - waiting: the playback component has not yet emitted onPlaying
                  This prevents the spinner from appearing after Stop or during teardown.
                */}
                <Feedback waiting={!!host && play && waiting} />
              </Layer>
              {/* No video indicator */}
              <Layer>{(!host || ended) && <NoVideoIndicator />}</Layer>
            </Container>
          </Limiter>
        </SystemStatsOverlay>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <PlayerControls
            videoProperties={videoProperties}
            src={host}
            parameters={playbackParameters}
            supportedResolutions={supportedResolutions}
            onPlay={onPlayStop}
            onRefresh={onRefresh}
            onScreenshot={onScreenshot}
            onFormat={setFormat}
            onVapix={onVapix}
            onSeek={setOffset}
            labels={{
              play: 'Play',
              pause: 'Pause',
              stop: 'Stop',
              refresh: 'Refresh',
              settings: 'Settings',
              screenshot: 'Take a snapshot',
              volume: 'Volume'
            }}
            showStatsOverlay={showStatsOverlay}
            toggleStats={toggleStatsOverlay}
            showSystemStatsOverlay={showSystemStatsOverlay}
            toggleSystemStats={toggleSystemStatsOverlay}
            format={format}
            availableFormats={availableFormats}
            volume={volume}
            setVolume={setVolume}
            startTime={startTime}
            duration={duration}
            onToggleFullscreen={onToggleFullscreen}
            isFullscreen={isFullscreen}
            waiting={waiting}
          />
        </div>
      </div>
    );
  }
);

CustomPlayer.displayName = 'Player';
