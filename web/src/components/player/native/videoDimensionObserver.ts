type MediaElement = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

/* Keep observers and event listeners attached to the current media element. */
export const createVideoDimensionObserver = (onChange: () => void) => {
  let current:
    | {
        container: HTMLElement;
        media: MediaElement;
        disconnect: () => void;
      }
    | undefined;

  const disconnect = () => {
    current?.disconnect();
    current = undefined;
  };

  const observe = (
    container: HTMLElement | null,
    media: MediaElement | null
  ) => {
    if (current && current.container === container && current.media === media) {
      return;
    }

    disconnect();
    if (!container || !media) {
      return;
    }

    let active = true;
    const notify = () => {
      if (active) {
        onChange();
      }
    };

    const resizeObserver = new ResizeObserver(notify);
    resizeObserver.observe(container);
    resizeObserver.observe(media);

    /* Intrinsic dimensions can change without changing the element's CSS size. */
    const events =
      media.tagName === 'VIDEO'
        ? ['loadedmetadata', 'resize']
        : media.tagName === 'IMG'
          ? ['load']
          : [];
    for (const event of events) {
      media.addEventListener(event, notify);
    }

    const canvasObserver =
      media.tagName === 'CANVAS' ? new MutationObserver(notify) : undefined;
    canvasObserver?.observe(media, {
      attributes: true,
      attributeFilter: ['width', 'height']
    });

    current = {
      container,
      media,
      disconnect: () => {
        active = false;
        resizeObserver.disconnect();
        canvasObserver?.disconnect();
        for (const event of events) {
          media.removeEventListener(event, notify);
        }
      }
    };
  };

  return { observe, disconnect };
};
