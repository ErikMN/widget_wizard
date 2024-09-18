import React, { useEffect, useState, useRef } from 'react';
import { Player, Format } from 'media-stream-player';

/* Vertical offset */
const OFFSET = 120;

interface VapixConfig {
  compression: string;
  resolution: string;
}

interface VideoPlayerProps {
  height: number;
  onDimensionsUpdate: (
    videoWidth: number,
    videoHeight: number,
    pixelWidth: number,
    pixelHeight: number
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const setDefaultParams = (): void => {
  const existingVapixJSON = localStorage.getItem('vapix');
  if (!existingVapixJSON) {
    const vapixConfig: VapixConfig = {
      compression: '20',
      resolution: '1920x1080'
    };
    const vapixJSON = JSON.stringify(vapixConfig);
    localStorage.setItem('vapix', vapixJSON);
    console.log('Setting Vapix params:', vapixJSON);
  }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  height,
  onDimensionsUpdate
}) => {
  /* Local state */
  const [authorized, setAuthorized] = useState<boolean>(false);

  /* Refs */
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

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
    if (videoElementRef.current) {
      const { videoWidth, videoHeight } = videoElementRef.current;
      // console.log('Video dimensions (stream):', videoWidth, videoHeight);

      /* Video element pixel dimensions */
      const videoRect = videoElementRef.current.getBoundingClientRect();
      // console.log(
      //   'Video element pixel dimensions:',
      //   videoRect.width,
      //   videoRect.height
      // );

      /* Send both stream and pixel dimensions to the parent via callback */
      onDimensionsUpdate(
        videoWidth, // Stream width
        videoHeight, // Stream height
        videoRect.width, // Pixel width
        videoRect.height // Pixel height
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
    // setDefaultParams();
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

        /* Add event listeners for resize */
        window.addEventListener('resize', logVideoDimensions);

        /* Log video dimensions once metadata (e.g., width/height) is loaded */
        videoElement.addEventListener('loadedmetadata', logVideoDimensions);

        return () => {
          window.removeEventListener('resize', logVideoDimensions);
          videoElement.removeEventListener(
            'loadedmetadata',
            logVideoDimensions
          );
        };
      }
    }
  }, [authorized]);

  if (!authorized) {
    return null;
  }

  return (
    <div
      ref={playerContainerRef}
      style={{
        height: `${height - OFFSET}px`,
        backgroundColor: 'black',
        padding: '3px',
        position: 'relative'
      }}
    >
      <Player
        hostname={window.location.host}
        initialFormat={Format.RTP_H264}
        autoPlay
        autoRetry
        vapixParams={vapixParams}
      />
    </div>
  );
};

export default VideoPlayer;
