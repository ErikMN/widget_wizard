/**
 * ParametersContext
 *
 * Axis devices stores various configuration parameters that can be accessed via
 * the param.cgi endpoint. This context fetches and provides these parameters
 * to the rest of the application.
 *
 * NOTE: Try to NOT rely too much on these parameters in the app!
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { P_CGI } from './constants';

interface ParametersContextType {
  parameters: { [key: string]: string } | null;
  paramsLoading: boolean;
  error: string | null;
  fetchParameters: () => Promise<void>;
  updateParameters: (params: { [key: string]: string }) => Promise<void>;
}

const ParametersContext = createContext<ParametersContextType | undefined>(
  undefined
);

export const ParametersProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Local state */
  const [parameters, setParameters] = useState<{
    [key: string]: string;
  } | null>(null);
  const [paramsLoading, setParamsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /* Parses param.cgi key=value output into a string-to-string map */
  const parseParameters = (text: string): { [key: string]: string } => {
    const paramMap: { [key: string]: string } = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key) {
        paramMap[key.trim()] = value?.trim() || '';
      }
    }
    return paramMap;
  };

  /*
   * Fetch parameters from param.cgi with action=list and parse the response
   */
  const fetchParameters = async () => {
    setParamsLoading(true);
    try {
      const response = await fetch(`${P_CGI}?action=list`);
      if (!response.ok) {
        throw new Error(`Error fetching parameters: ${response.statusText}`);
      }
      const text = await response.text();
      const parsedParameters = parseParameters(text);
      setParameters(parsedParameters);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setParamsLoading(false);
    }
  };

  /*
   * Update parameters by sending a request to param.cgi with action=update
   * Example:
   *
   * await updateParameters({
   * 'root.ImageSource.I0.AutoRotationEnabled': 'no',
   * 'root.ImageSource.I0.Rotation': '0'
   *});
   */
  const updateParameters = async (params: { [key: string]: string }) => {
    setParamsLoading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.append('action', 'update');
      for (const [key, value] of Object.entries(params)) {
        searchParams.append(key, value);
      }
      const response = await fetch(`${P_CGI}?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error(`Error updating parameters: ${response.statusText}`);
      }
      /* Re-fetch parameters to keep local state in sync */
      await fetchParameters();
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setParamsLoading(false);
    }
  };

  /* Fetch all parameters on mount */
  useEffect(() => {
    fetchParameters();
  }, []);

  return (
    <ParametersContext.Provider
      value={{
        parameters,
        paramsLoading,
        error,
        fetchParameters,
        updateParameters
      }}
    >
      {children}
    </ParametersContext.Provider>
  );
};

/* Hook to use the ParametersContext, with an error if used outside the provider */
export const useParameters = (): ParametersContextType => {
  const context = useContext(ParametersContext);
  if (!context) {
    throw new Error('useParameters must be used within a ParametersProvider');
  }
  return context;
};
