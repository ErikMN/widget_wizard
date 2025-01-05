import React, { createContext, useContext, useState } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  deviceIP: string | null;
  deviceUser: string | null;
  devicePass: string | null;
  authToken: string | null;
  setAuthData: (ip: string, user: string, pass: string, token: string) => void;
  clearAuthData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceIP, setDeviceIP] = useState<string | null>(null);
  const [deviceUser, setDeviceUser] = useState<string | null>(null);
  const [devicePass, setDevicePass] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const setAuthData = (
    ip: string,
    user: string,
    pass: string,
    token: string
  ) => {
    setDeviceIP(ip);
    setDeviceUser(user);
    setDevicePass(pass);
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  const clearAuthData = () => {
    setDeviceIP(null);
    setDeviceUser(null);
    setDevicePass(null);
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        deviceIP,
        deviceUser,
        devicePass,
        authToken,
        setAuthData,
        clearAuthData
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
