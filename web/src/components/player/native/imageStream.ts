export interface ImageStreamProperties {
  readonly el: HTMLImageElement;
  readonly width: number;
  readonly height: number;
  readonly formatSupportsAudio: false;
}

/* Each start needs a fresh request, even when the stream URL is unchanged. */
let requestId = Date.now();

export const startImageStream = (
  image: HTMLImageElement,
  src: string,
  onPlaying: (properties: ImageStreamProperties) => void
): (() => void) => {
  let width = 0;
  let height = 0;

  const onLoad = () => {
    const nextWidth = image.naturalWidth;
    const nextHeight = image.naturalHeight;
    if (!nextWidth || !nextHeight) {
      return;
    }
    if (width === nextWidth && height === nextHeight) {
      return;
    }

    width = nextWidth;
    height = nextHeight;
    onPlaying({ el: image, width, height, formatSupportsAudio: false });
  };

  image.addEventListener('load', onLoad);
  /* The stream URL already contains the refresh timestamp. */
  image.src = `${src}&cachebust=${requestId++}`;

  return () => {
    image.removeEventListener('load', onLoad);
    image.removeAttribute('src');
  };
};
