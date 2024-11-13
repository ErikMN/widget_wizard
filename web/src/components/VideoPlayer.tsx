import React, { useEffect, useState, useRef } from 'react';
import { Player, Format } from 'media-stream-player';
import { useWidgetContext } from './WidgetContext';

interface VapixConfig {
  compression: string;
  resolution: string;
}

interface VideoPlayerProps {
  onDimensionsUpdate: (
    videoWidth: number,
    videoHeight: number,
    pixelWidth: number,
    pixelHeight: number,
    offsetX: number,
    offsetY: number
  ) => void;
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

/* OPTIONAL: Set default Vapix params if not already set */
const setDefaultParams = (): void => {
  const existingVapixJSON = localStorage.getItem('vapix');
  if (!existingVapixJSON) {
    /* Detect the browser using userAgent */
    const userAgent =
      typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    let vapixConfig: Partial<VapixConfig> = {};
    /* Set specific parameters based on the browser */
    if (userAgent.includes('firefox')) {
      vapixConfig = {
        compression: '20',
        resolution: '1920x1080'
      };
    }
    const vapixJSON = JSON.stringify(vapixConfig);
    localStorage.setItem('vapix', vapixJSON);
    console.log('Setting Vapix params for browser:', userAgent, vapixJSON);
  }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ onDimensionsUpdate }) => {
  /* Local state */
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  /* Global context */
  const { appSettings, currentTheme } = useWidgetContext();

  /* Refs */
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
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

  /* Function to log and send video element's dimensions */
  const logVideoDimensions = () => {
    if (videoElementRef.current && playerContainerRef.current) {
      const { videoWidth, videoHeight } = videoElementRef.current;

      /* Video element pixel dimensions */
      const videoRect = videoElementRef.current.getBoundingClientRect();
      const containerRect = playerContainerRef.current.getBoundingClientRect();

      const offsetX = videoRect.left - containerRect.left;
      const offsetY = videoRect.top - containerRect.top;

      /* Check if any of the values are 0, and retry after a short delay */
      if (
        videoWidth === 0 ||
        videoHeight === 0 ||
        videoRect.width === 0 ||
        videoRect.height === 0
      ) {
        if (appSettings.debug) {
          console.warn('Video dimensions not ready, retrying...');
        }
        /* Retry after a short delay (e.g., 500ms) */
        setTimeout(() => {
          setRetryCount((count) => count + 1);
          logVideoDimensions();
        }, 500);

        return;
      }

      /* Send both stream and pixel dimensions, and offsets to the parent via callback */
      onDimensionsUpdate(
        videoWidth, // Stream width
        videoHeight, // Stream height
        videoRect.width, // Pixel width
        videoRect.height, // Pixel height
        offsetX, // Offset X (left margin of the video in the container)
        offsetY // Offset Y (top margin of the video in the container)
      );
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
    setDefaultParams();
  }, []);

  useEffect(() => {
    if (authorized && playerContainerRef.current) {
      const videoElement = playerContainerRef.current.querySelector(
        'video'
      ) as HTMLVideoElement | null;
      videoElementRef.current = videoElement;

      if (videoElement) {
        /* Log initial dimensions */
        logVideoDimensions();

        /* Set up ResizeObserver to monitor changes in video container or video element size */
        resizeObserverRef.current = new ResizeObserver(() => {
          logVideoDimensions();
        });

        /* Observe both the player container and the video element */
        resizeObserverRef.current.observe(playerContainerRef.current);
        resizeObserverRef.current.observe(videoElement);

        /* Log video dimensions once metadata (e.g., width/height) is loaded */
        videoElement.addEventListener('loadedmetadata', logVideoDimensions);

        return () => {
          /* Cleanup ResizeObserver and event listeners */
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
          }
          videoElement.removeEventListener(
            'loadedmetadata',
            logVideoDimensions
          );
        };
      }
    }
  }, [authorized, retryCount]);

  if (!authorized) {
    return null;
  }

  return (
    <div
      ref={playerContainerRef}
      style={{
        flexGrow: 1,
        backgroundColor:
          currentTheme === 'dark' ? 'rgb(61, 61, 61)' : 'rgb(0, 0, 0)',
        padding: '3px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Player
        hostname={window.location.host}
        initialFormat={
          appSettings.wsDefault ? Format.RTP_H264 : Format.MP4_H264
        }
        autoPlay
        autoRetry
        vapixParams={vapixParams}
      />
    </div>
  );
};

export default VideoPlayer;
