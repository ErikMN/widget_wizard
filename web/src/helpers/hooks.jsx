/**
 * A collection of custom hooks.
 */

import { useState } from 'react';

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

export { useLocalStorage };
