let isLoggingEnabled = false;

export const enableLogging = (enable: boolean) => {
  isLoggingEnabled = enable;
};

export const log = (...args: string[]) => {
  if (isLoggingEnabled) {
    console.log(...args);
  }
};
