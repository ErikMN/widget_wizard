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

const VideoPlayer: React.FC<VideoPlayerProps> = ({ height }) => {
  /* Local state */
  const [authorized, setAuthorized] = useState<boolean>(false);

  /* Refs */
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  let vapixParams: Partial<VapixConfig> = {};
  try {
    vapixParams = JSON.parse(window.localStorage.getItem('vapix') || '{}');
  } catch (err) {
    console.warn('No stored VAPIX parameters: ', err);
  }

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
      const videoElement = playerContainerRef.current.querySelector('video');

      if (videoElement) {
        const logVideoDimensions = () => {
          const { videoWidth, videoHeight } = videoElement;
          console.log('Video dimensions:', videoWidth, videoHeight);
        };
        videoElement.addEventListener('loadedmetadata', logVideoDimensions);

        return () => {
          videoElement.removeEventListener(
            'loadedmetadata',
            logVideoDimensions
          );
        };
      }
    }
  }, [authorized]);

  if (!authorized) {
    return;
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
