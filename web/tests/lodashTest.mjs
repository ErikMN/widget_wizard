/* Vite's SSR runner does not expose named exports from CommonJS Lodash. */
import lodash from 'lodash/lodash.js';

export const debounce = lodash.debounce;
