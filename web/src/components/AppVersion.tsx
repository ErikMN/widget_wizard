import version from '../assets/etc/version_info?raw';

function AppVersion(): JSX.Element | null {
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
    return (
      <footer style={{ color: 'red', textAlign: 'center', marginTop: '5px' }}>
        {commitHash}
      </footer>
    );
  }

  return (
    <footer style={{ textAlign: 'center', marginTop: '5px' }}>{version}</footer>
  );
}

export default AppVersion;
