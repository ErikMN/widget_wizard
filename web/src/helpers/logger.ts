let isLoggingEnabled = false;

export const enableLogging = (enable: boolean) => {
  isLoggingEnabled = enable;
};

export const log = (...args: (string | object)[]) => {
  if (isLoggingEnabled) {
    console.log(...args);
  }
};
