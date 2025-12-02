/**
 * A collection of custom hooks.
 */

import React, { useCallback, useState, useEffect } from 'react';
/* MUI */
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * Custom hook to get and set a value in localStorage.
 */
const useLocalStorage = (key, defaultValue, setItemIfNone = false) => {
  const [localStorageValue, setLocalStorageValue] = useState(() => {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        return JSON.parse(value);
      } else {
        if (setItemIfNone) {
          localStorage.setItem(key, JSON.stringify(defaultValue));
        }
        return defaultValue;
      }
    } catch (error) {
      console.error(
        `Failed to get or set localStorage item with key "${key}":`,
        error
      );
      localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
  });
  const setLocalStorageStateValue = (valueOrFn) => {
    let newValue;
    if (typeof valueOrFn === 'function') {
      const fn = valueOrFn;
      newValue = fn(localStorageValue);
    } else {
      newValue = valueOrFn;
    }
    localStorage.setItem(key, JSON.stringify(newValue));
    setLocalStorageValue(newValue);
  };
  return [localStorageValue, setLocalStorageStateValue];
};

/**
 * Custom hook to debounce values at a delay.
 */
const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Custom hook to check screen sizes.
 */
const useScreenSizes = () => {
  const theme = useTheme();
  /* Screen widths */
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return { isMobile };
};

/**
 * Custom hook to handle tab visibility changes.
 */
const useTabVisibility = (callback) => {
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await callback();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callback]);
};

const useSwitch = (initialValue = false) => {
  const [value, setValue] = useState(initialValue);

  const toggleValue = useCallback(
    (state) => {
      if (state !== undefined) {
        setValue(state);
      } else {
        setValue((oldValue) => !oldValue);
      }
    },
    [setValue]
  );

  return [value, toggleValue];
};

const DEFAULT_TIMEOUT = 3000;

/**
 * Listen to activity on an element by the user.
 *
 * @param {Object} ref A React ref for the element
 * @param {Number} duration The duration of inactivity
 * @return {Boolean} The current user activity state
 */
const useUserActive = (ref = null, duration = DEFAULT_TIMEOUT) => {
  const [userActive, setUserActive] = useState(false);
  const startUserActive = () => setUserActive(true);
  const stopUserActive = () => setUserActive(false);

  useEffect(() => {
    if (userActive) {
      const timer = setTimeout(stopUserActive, duration);
      return () => {
        clearTimeout(timer);
      };
    }
  });

  useEffect(() => {
    const el = ref.current;

    if (el === null) {
      return;
    }

    el.addEventListener('pointermove', startUserActive);
    if (userActive) {
      el.addEventListener('pointerleave', stopUserActive);
    }

    return () => {
      el.removeEventListener('pointermove', startUserActive);
      if (userActive) {
        el.removeEventListener('pointerleave', stopUserActive);
      }
    };
  }, [userActive, ref]);

  return userActive;
};

export {
  useLocalStorage,
  useDebouncedValue,
  useScreenSizes,
  useTabVisibility,
  useSwitch,
  useUserActive
};
