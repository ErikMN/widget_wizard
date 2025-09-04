export type VapixResolution = { width: number; height: number };

export function readVapixCoord(
  defaults: VapixResolution = { width: 1920, height: 1080 }
): VapixResolution {
  try {
    if (typeof window === 'undefined') {
      return defaults;
    }

    const raw = window.localStorage.getItem('vapix');
    if (!raw) {
      return defaults;
    }

    const obj = JSON.parse(raw);
    const res: string | undefined = obj?.resolution;

    if (res && /^[0-9]+x[0-9]+$/i.test(res)) {
      const [w, h] = res
        .toLowerCase()
        .split('x')
        .map((n: string) => parseInt(n, 10));
      if (w > 0 && h > 0) {
        return { width: w, height: h };
      }
    }
  } catch {
    /* ignore */
  }
  return defaults;
}
