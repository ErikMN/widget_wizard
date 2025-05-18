import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Container,
  Layer,
  PlaybackArea,
  Format,
  VideoProperties,
  VapixParameters
} from 'media-stream-player';
import { Limiter } from './Limiter';
import { Controls } from './Controls';
import { useSwitch } from './useSwitch';
import { getImageURL } from './GetImageURL';

interface CustomPlayerProps {
  hostname: string;
  initialFormat?: Format;
  autoPlay?: boolean;
  autoRetry?: boolean;
  vapixParams?: VapixParameters;
}

const CustomPlayer: React.FC<CustomPlayerProps> = ({
  hostname,
  initialFormat = Format.MP4_H264,
  autoPlay = true,
  autoRetry = true,
  vapixParams = { camera: '0' }
}) => {
  const [play, setPlay] = useState(autoPlay);
  const [refresh, setRefresh] = useState(0);
  const [offset, setOffset] = useState(0);
  const [waiting, setWaiting] = useState(autoPlay);
  const [volume, setVolume] = useState<number>();
  const [format, setFormat] = useState<Format>(initialFormat);

  // Load vapix parameters from localStorage
  const getInitialParams = (): VapixParameters => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('vapix');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { camera: '0' };
  };

  const [parameters, setParameters] =
    useState<VapixParameters>(getInitialParams);
  const [videoProperties, setVideoProperties] =
    useState<VideoProperties | null>(null);

  const [showStatsOverlay, toggleStatsOverlay] = useSwitch(
    typeof window !== 'undefined' &&
      localStorage.getItem('stats-overlay') === 'on'
  );

  const limiterRef = useRef<HTMLDivElement | null>(null);

  const naturalAspectRatio = useMemo(() => {
    if (!videoProperties) return 16 / 9;
    return videoProperties.width / videoProperties.height;
  }, [videoProperties]);

  const onPlaying = useCallback((props: VideoProperties) => {
    setVideoProperties(props);
    setWaiting(false);
    setVolume(props.volume);
  }, []);

  const onVapix = useCallback((key: string, value: string) => {
    setParameters((prev) => {
      const updated = { ...prev, [key]: value };
      if (value === '') delete updated[key];
      return updated;
    });
    setRefresh((r) => r + 1);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vapix', JSON.stringify(parameters));
    }
  }, [parameters]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('stats-overlay', showStatsOverlay ? 'on' : 'off');
    }
  }, [showStatsOverlay]);

  const onPlayPause = useCallback(() => {
    setPlay((prev) => !prev);
    setWaiting((prev) => !prev);
  }, []);

  const onStop = useCallback(() => {
    setPlay(false);
    setWaiting(false);
  }, []);

  const onRefresh = useCallback(() => {
    setPlay(true);
    setWaiting(true);
    setRefresh((r) => r + 1);
  }, []);

  const onScreenshot = useCallback(() => {
    if (!videoProperties) return;

    const { el, width, height } = videoProperties;
    const imageURL = getImageURL(el, { width, height });
    const link = document.createElement('a');
    link.download = `snapshot_${Date.now()}.jpg`;
    link.href = imageURL;
    link.click();
  }, [videoProperties]);

  const onEnded = useCallback(() => {
    if (autoRetry) {
      onRefresh();
    }
  }, [autoRetry, onRefresh]);

  useLayoutEffect(() => {
    if (!naturalAspectRatio || !limiterRef.current) return;
    const el = limiterRef.current;
    const observer = new ResizeObserver(([entry]) => {
      const maxWidth = entry.target.clientHeight * naturalAspectRatio;
      entry.target.style.maxWidth = `${maxWidth}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalAspectRatio]);

  useEffect(() => {
    if (videoProperties?.volume !== undefined && volume !== undefined) {
      const videoEl = videoProperties.el as HTMLVideoElement;
      videoEl.muted = volume === 0;
      videoEl.volume = volume;
    }
  }, [videoProperties, volume]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Limiter ref={limiterRef}>
        <Container aspectRatio={naturalAspectRatio}>
          <Layer>
            <PlaybackArea
              play={play}
              refresh={refresh}
              host={hostname}
              format={format}
              parameters={parameters}
              onPlaying={onPlaying}
              onEnded={onEnded}
              autoRetry={autoRetry}
            />
          </Layer>
          <Layer>
            <Controls
              play={play}
              videoProperties={videoProperties ?? undefined}
              src={hostname}
              parameters={parameters}
              onPlay={onPlayPause}
              onStop={onStop}
              onRefresh={onRefresh}
              onScreenshot={onScreenshot}
              onFormat={setFormat}
              onVapix={onVapix}
              onSeek={setOffset}
              showStatsOverlay={showStatsOverlay}
              toggleStats={toggleStatsOverlay}
              format={format}
              volume={volume}
              setVolume={setVolume}
            />
          </Layer>
        </Container>
      </Limiter>
    </div>
  );
};

export default CustomPlayer;
