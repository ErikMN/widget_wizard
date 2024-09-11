let isLoggingEnabled = false;

export const enableLogging = () => {
  isLoggingEnabled = true;
};

export const disableLogging = () => {
  isLoggingEnabled = false;
};

export const log = (...args: string[]) => {
  if (isLoggingEnabled) {
    console.log(...args);
  }
};
