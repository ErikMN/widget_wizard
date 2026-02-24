/**
 * VideoPlayer
 *
 * Main video player component that handles authorization, fullscreen toggling,
 * and dimension tracking. The actual video playback is handled by the CustomPlayer.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from './AppContext';
import { Dimensions } from './appInterface';
import { CustomPlayer } from './player/CustomPlayer';
import type { PlayerNativeElement } from 'media-stream-player';
import BBoxSurface from './BBoxSurface';
import { serverGet } from '../helpers/cgihelper';

interface VapixConfig {
  compression: string;
  resolution: string;
}

/* PTZ speed value used for each arrow key direction (pan, tilt) */
const PTZ_SPEED = 30;

/* Map each arrow key to a [pan, tilt] speed tuple for continuouspantiltmove */
const PTZ_KEY_MAP: Record<string, [number, number]> = {
  ArrowLeft: [-PTZ_SPEED, 0],
  ArrowRight: [PTZ_SPEED, 0],
  ArrowUp: [0, PTZ_SPEED],
  ArrowDown: [0, -PTZ_SPEED]
};

const sendPtzMove = (
  pan: number,
  tilt: number,
  currentChannel: string
): void => {
  serverGet(
    `/axis-cgi/com/ptz.cgi?camera=${currentChannel}&continuouspantiltmove=${pan},${tilt}`
  ).catch((err) => console.error('PTZ command failed:', err));
};

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
  const { appSettings, currentTheme, currentChannel } = useAppContext();

  /* Refs */
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<PlayerNativeElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const currentChannelRef = useRef(currentChannel);

  /* Navigation */
  const location = useLocation();
  const inWidgetsRoute = location.pathname.endsWith('/widgets');
  const inOverlaysRoute = location.pathname.endsWith('/overlays');
  const inSettingsRoute = location.pathname.endsWith('/settings');

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

  /* Listen for fullscreen changes
   *
   * Updates local state (isFullscreen) whenever the document enters or exits
   * fullscreen. The state is driven by the presence of document.fullscreenElement.
   * Cleanup removes the event listener on unmount.
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  /* Sync currentChannel ref so keyboard handlers always use latest value */
  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  /* PTZ keyboard control
   *
   * Arrow keys start continuous pan/tilt movement via "continuouspantiltmove".
   * The camera moves until a keyup sends the stop command (0,0).
   * Repeated keydown events (key held) are ignored - the device keeps moving
   * after the initial start command is issued.
   */
  useEffect(() => {
    const activeKeys = new Set<string>();
    /* Compute combined pan/tilt vector from all active keys */
    const sendCombinedMove = () => {
      if (!currentChannelRef.current) {
        return;
      }
      let pan = 0;
      let tilt = 0;
      activeKeys.forEach((key) => {
        const move = PTZ_KEY_MAP[key];
        if (move) {
          pan += move[0];
          tilt += move[1];
        }
      });
      sendPtzMove(pan, tilt, currentChannelRef.current);
    };
    /* Start moving when key is pressed */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!currentChannelRef.current) {
        return;
      }
      const move = PTZ_KEY_MAP[event.key];
      if (!move) {
        return;
      }
      /* Ignore if typing in an input/textarea/contenteditable */
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      /* Only send the start command on the first press, not on key-repeat */
      if (!activeKeys.has(event.key)) {
        activeKeys.add(event.key);
        sendCombinedMove();
      }
    };
    /* Stop movement when key is released */
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!currentChannelRef.current) {
        return;
      }
      if (!PTZ_KEY_MAP[event.key]) {
        return;
      }
      if (!activeKeys.has(event.key)) {
        return;
      }
      activeKeys.delete(event.key);
      /* Stop movement only when all PTZ keys are released */
      sendCombinedMove();
    };
    /* Stop movement when window loses focus */
    const handleBlur = () => {
      if (activeKeys.size > 0 && currentChannelRef.current) {
        activeKeys.clear();
        sendPtzMove(0, 0, currentChannelRef.current);
      }
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      /* Ensure the camera stops if the component unmounts while a key is held */
      if (activeKeys.size > 0 && currentChannelRef.current) {
        sendPtzMove(0, 0, currentChannelRef.current);
      }
    };
  }, []);

  /* Function to log and send video element's dimensions
   * NOTE: This is very important since a lot of other functionalities in the app
   * depends on having the correct dimensions available.
   */
  const logVideoDimensions = () => {
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
      /* Video element pixel dimensions
       *
       * We track TWO coordinate spaces:
       *
       * 1) Stream space (videoWidth/videoHeight)
       *    - The decoded media resolution provided by the stream (e.g. 1920x1080).
       *
       * 2) Screen space (pixelWidth/pixelHeight + offsetX/offsetY)
       *    - The exact on-screen rectangle where the video content
       *      is visible, in CSS pixels, relative to the container.
       *
       * Screen space explicitly excludes any black bars and defines
       * the maximum drawable area for bounding boxes and overlays.
       */
      const videoRect = el.getBoundingClientRect();
      const containerRect = playerContainerRef.current.getBoundingClientRect();

      /* Element border-box size in CSS pixels (includes any internal black bars) */
      const elementPixelWidth = videoRect.width;
      const elementPixelHeight = videoRect.height;

      /* Default assumption: content fills the element (no letterbox/pillarbox) */
      let pixelWidth = elementPixelWidth;
      let pixelHeight = elementPixelHeight;

      /* Element top-left relative to the container (CSS pixels) */
      let offsetX = videoRect.left - containerRect.left;
      let offsetY = videoRect.top - containerRect.top;

      /* If the element preserves aspect ratio, its box may include black bars.
       * Compare aspect ratios to find the visible content box:
       *
       * - element wider than stream -> pillarbox (bars left/right)
       * - element taller than stream -> letterbox (bars top/bottom)
       *
       * Update pixelWidth/pixelHeight to the visible content size and shift offsetX/offsetY
       * to the content’s top-left corner.
       */
      if (
        videoWidth > 0 &&
        videoHeight > 0 &&
        elementPixelWidth > 0 &&
        elementPixelHeight > 0
      ) {
        const streamAspect = videoWidth / videoHeight;
        const elementAspect = elementPixelWidth / elementPixelHeight;

        if (elementAspect > streamAspect) {
          /* Element is wider than stream: pillarboxing (black bars left/right) */
          pixelHeight = elementPixelHeight;
          pixelWidth = elementPixelHeight * streamAspect;
          offsetX += (elementPixelWidth - pixelWidth) / 2;
        } else if (elementAspect < streamAspect) {
          /* Element is taller than stream: letterboxing (black bars top/bottom) */
          pixelWidth = elementPixelWidth;
          pixelHeight = elementPixelWidth / streamAspect;
          offsetY += (elementPixelHeight - pixelHeight) / 2;
        }
      }
      /* Set stream and pixel dimensions
       *
       * The resulting values describe the visible video content only.
       * Any consumer of these dimensions (e.g. BBoxSurface) can rely on:
       * - pixelWidth/pixelHeight being fully visible on screen
       * - offsetX/offsetY pointing to the top-left corner of that area
       */
      setDimensions({
        videoWidth, // Stream width
        videoHeight, // Stream height
        pixelWidth, // Pixel width (visible content only)
        pixelHeight, // Pixel height (visible content only)
        offsetX, // Offset X (left margin of the video content in the container)
        offsetY // Offset Y (top margin of the video content in the container)
      });
    }
  };

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
  }, [authorized]);

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
      {/* Bounding boxes for widgets and overlays */}
      <BBoxSurface
        dimensions={dimensions}
        showWidgets={inWidgetsRoute || inSettingsRoute}
        showOverlays={inOverlaysRoute || inSettingsRoute}
      />
    </div>
  );
};

export default VideoPlayer;
