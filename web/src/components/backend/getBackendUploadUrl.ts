/* Backend upload URL helper. */
const BACKEND_UPLOAD_PROXY_PATH = 'file-upload';

export const getBackendUploadUrl = (): string => {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return new URL(
    `${baseUrl}${BACKEND_UPLOAD_PROXY_PATH}`,
    window.location.origin
  ).toString();
};
