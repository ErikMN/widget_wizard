/**
 * AppVersion
 *
 * This component displays the application version information.
 * It first attempts to load static version info from a file.
 * If unavailable, it falls back to dynamic version info from environment variables.
 */
import version from '../assets/etc/version_info?raw';

function AppVersion() {
  const commitHash: string | undefined = import.meta.env.VITE_COMMIT_HASH;

  /* If no static version info: try dynamic version info */
  if (version === null) {
    if (
      !commitHash ||
      commitHash === '' ||
      commitHash === '(VITE_COMMIT_HASH)'
    ) {
      return null;
    }
    return <footer style={{ color: 'red' }}>{commitHash}</footer>;
  }

  return <footer>{version}</footer>;
}

export default AppVersion;
