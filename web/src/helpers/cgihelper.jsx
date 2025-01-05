const DEFAULT_OPTIONS = {
  cache: 'no-store',
  credentials: 'include',
  mode: 'cors',
  headers: {
    'Content-Type': 'application/json'
  }
};

const serverFetch = async (url, init = {}) => {
  const options = { ...DEFAULT_OPTIONS, ...init };
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
  }

  return response;
};

const serverPost = (url, body) => {
  return serverFetch(url, { method: 'POST', body });
};

export const serverGet = (url) => {
  return serverFetch(url, { method: 'GET' });
};

export const getCgiResponse = async (path) => {
  const resp = (await serverFetch(path)).text(); // Use serverFetch to handle CORS and defaults
  return resp;
};

export const getCgiResponseJSON = async (path) => {
  const resp = (await serverFetch(path)).json(); // Use serverFetch to handle CORS and defaults
  return resp;
};

export const jsonRequest = async (url, body) => {
  try {
    const response = await serverPost(url, JSON.stringify(body));
    return response.json();
  } catch (error) {
    console.error('Error in jsonRequest:', error);
    throw error; // Re-throw the error for further handling
  }
};

export const cgiRequest = async (url, body) => {
  try {
    const response = await serverPost(url, JSON.stringify(body));
    return response;
  } catch (error) {
    console.error('Error in cgiRequest:', error);
    throw error; // Re-throw the error for further handling
  }
};

export const getParam = async (param) => {
  const PARAMS_BASE_PATH = '/axis-cgi/param.cgi?action=list&group=';
  try {
    const resp = await getCgiResponse(`${PARAMS_BASE_PATH}${param}`);
    const parsedData = resp.substring(resp.indexOf('=') + 1);
    return parsedData;
  } catch (error) {
    console.error('Error in getParam:', error);
    throw error; // Re-throw the error for further handling
  }
};
