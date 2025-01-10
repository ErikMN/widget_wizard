/* Collection of utility functions */

export function capitalizeFirstLetter(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Convert somethingLikeThis or MaxAlarmThreshold into "Max alarm threshold"
 */
export function toNiceName(word: string): string {
  if (!word) return word;
  /* 1) Insert a space before each capital letter (except possibly the first).
     e.g. "MaxAlarmThreshold" => "Max Alarm Threshold" */
  const spaced = word.replace(/([A-Z])/g, ' $1').trim();
  /* 2) Convert entire string to lowercase => "max alarm threshold" */
  const lower = spaced.toLowerCase();
  /* 3) Capitalize only the first letter => "Max alarm threshold" */
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
