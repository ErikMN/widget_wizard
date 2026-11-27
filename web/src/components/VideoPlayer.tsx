/**
 * VideoPlayer
 *
 * Main video player component that handles authorization, fullscreen toggling,
 * and dimension tracking. The actual video playback is handled by the CustomPlayer.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppSettingsContext, useThemeContext } from './context/AppContext';
import { Dimensions } from './appInterface';
import { CustomPlayer } from './player/CustomPlayer';
import {
  calculateVideoDimensions,
  dimensionsEqual
} from './player/native/videoDimensions';
import type { PlayerNativeElement } from 'media-stream-player';
import OverlaySurface from './OverlaySurface';
import MessageOverlay from './MessageOverlay';
import { usePTZControl } from '../helpers/usePTZControl';

interface VapixConfig {
  compression: string;
  resolution: string;
}

/* Force a login by fetching usergroup */
const authorize = async (): Promise<void> => {
  try {
    await window.fetch('/axis-cgi/usergroup.cgi', {
      credentials: 'include',
      mode: 'no-cors'
    });
  } catch (err) {
    console.error(err);
  }
};

const VideoPlayer: React.FC = () => {
  /* Local state */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState<Dimensions>({
    videoWidth: 0,
    videoHeight: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    offsetX: 0,
    offsetY: 0
  });

  /* Global context */
  const { appSettings } = useAppSettingsContext();
  const { currentTheme } = useThemeContext();

  /* PTZ keyboard control */
  usePTZControl();

  /* Refs */
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<PlayerNativeElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  let vapixParams: Partial<VapixConfig> = {};
  const vapixData = window.localStorage.getItem('vapix');
  if (vapixData) {
    try {
      vapixParams = JSON.parse(vapixData);
    } catch (err) {
      console.warn('Failed to parse VAPIX parameters:', err);
      window.localStorage.removeItem('vapix');
    }
  }

  /* Toggle fullscreen
   *
   * Requests fullscreen on the player container when not already in fullscreen,
   * otherwise exits fullscreen. Uses the standard Fullscreen API and guards for
   * missing methods (older browsers) with optional chaining "?.()".
   */
  const toggleFullscreen = useCallback(() => {
    const element = playerContainerRef.current;
    if (!element) return;

    if (!document.fullscreenElement) {
      /* Enter fullscreen on the container element */
      element.requestFullscreen?.().catch((err) => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      /* Exit fullscreen */
      document.exitFullscreen?.().catch((err) => {
        console.error('Failed to exit fullscreen:', err);
      });
    }
  }, []);

  /* Function to log and send video element's dimensions
   * NOTE: This is very important since a lot of other functionalities in the app
   * depends on having the correct dimensions available.
   */
  const logVideoDimensions = useCallback(() => {
    if (videoRef.current && playerContainerRef.current) {
      const el = videoRef.current as HTMLElement;
      let videoWidth = 0;
      let videoHeight = 0;

      /* Determine stream dimensions depending on element type */
      if (el instanceof HTMLVideoElement) {
        videoWidth = el.videoWidth;
        videoHeight = el.videoHeight;
        if (appSettings.debug) {
          console.warn('HTMLVideoElement', videoWidth, 'x', videoHeight);
        }
      } else if (el instanceof HTMLImageElement) {
        videoWidth = el.naturalWidth;
        videoHeight = el.naturalHeight;
        if (appSettings.debug) {
          console.warn('HTMLImageElement', videoWidth, 'x', videoHeight);
        }
      } else if (el instanceof HTMLCanvasElement) {
        videoWidth = el.width;
        videoHeight = el.height;
        if (appSettings.debug) {
          console.warn('HTMLCanvasElement', videoWidth, 'x', videoHeight);
        }
      }
      const next = calculateVideoDimensions(
        videoWidth,
        videoHeight,
        el.getBoundingClientRect(),
        playerContainerRef.current.getBoundingClientRect()
      );
      setDimensions((prev) => (dimensionsEqual(prev, next) ? prev : next));
    }
  }, [appSettings.debug]);

  /* Re-measure after fullscreen layout settles so bbox bounds use the new size. */
  useEffect(() => {
    const measureAfterLayout = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(logVideoDimensions);
      });
    };
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      measureAfterLayout();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', measureAfterLayout);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', measureAfterLayout);
    };
  }, [logVideoDimensions]);

  useEffect(() => {
    authorize()
      .then(() => {
        setAuthorized(true);
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      /* Reset dimensions to 0 on unmount */
      // console.log('VideoPlayer unmounted: Set dimensions to 0');
      setDimensions({
        videoWidth: 0,
        videoHeight: 0,
        pixelWidth: 0,
        pixelHeight: 0,
        offsetX: 0,
        offsetY: 0
      });
    };
  }, []);

  useEffect(() => {
    if (authorized && playerContainerRef.current && videoRef.current) {
      logVideoDimensions();

      /* React to size changes of video */
      resizeObserverRef.current = new ResizeObserver(() => {
        logVideoDimensions();
      });

      /* Watch container box and video */
      if (playerContainerRef.current) {
        resizeObserverRef.current.observe(playerContainerRef.current);
      }
      if (videoRef.current) {
        resizeObserverRef.current.observe(videoRef.current);
      }

      if (videoRef.current instanceof HTMLVideoElement) {
        videoRef.current.addEventListener('loadedmetadata', logVideoDimensions);
      }

      return () => {
        /* Cleanup ResizeObserver and event listeners */
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
        if (videoRef.current instanceof HTMLVideoElement) {
          videoRef.current.removeEventListener(
            'loadedmetadata',
            logVideoDimensions
          );
        }
      };
    }
  }, [authorized, logVideoDimensions]);

  /* Not authorized: return */
  if (!authorized) {
    return null;
  }

  return (
    <div
      ref={playerContainerRef}
      style={{
        flexGrow: 1,
        backgroundColor:
          currentTheme === 'dark' ? 'rgb(31, 31, 31)' : 'rgb(0, 0, 0)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <CustomPlayer
        ref={videoRef}
        hostname={window.location.host}
        autoPlay
        autoRetry
        vapixParams={vapixParams}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onStreamChange={logVideoDimensions}
      />
      {/* Web-drawn overlays */}
      <OverlaySurface dimensions={dimensions} />
      {/* Videoplayer messages overlay */}
      <MessageOverlay />
    </div>
  );
};

export default VideoPlayer;
