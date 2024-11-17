import React, { createContext, useContext, useEffect, useState } from 'react';
import { P_CGI } from './constants';

interface ParametersContextType {
  parameters: { [key: string]: string } | null;
  paramsLoading: boolean;
  error: string | null;
}

const ParametersContext = createContext<ParametersContextType | undefined>(
  undefined
);

export const ParametersProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [parameters, setParameters] = useState<{
    [key: string]: string;
  } | null>(null);
  const [paramsLoading, setParamsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchParameters = async () => {
      try {
        const response = await fetch(P_CGI);
        if (!response.ok) {
          throw new Error(`Error fetching parameters: ${response.statusText}`);
        }
        const text = await response.text();
        const parsedParameters = parseParameters(text);
        setParameters(parsedParameters);
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
    fetchParameters();
  }, []);

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

  return (
    <ParametersContext.Provider value={{ parameters, paramsLoading, error }}>
      {children}
    </ParametersContext.Provider>
  );
};

export const useParameters = (): ParametersContextType => {
  const context = useContext(ParametersContext);
  if (!context) {
    throw new Error('useParameters must be used within a ParametersProvider');
  }
  return context;
};
