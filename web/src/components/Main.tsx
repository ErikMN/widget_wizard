import React from 'react';
import { useAuth } from './AuthContext';
import Login from './Login';
import AppRoutes from './AppRoutes';

const Main: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <AppRoutes /> : <Login />;
};

export default Main;
