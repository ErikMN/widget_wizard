import React from 'react';
import ReactDOM from 'react-dom/client';
// import AppRoutes from './components/AppRoutes';
import Main from './components/Main';
import { GlobalProvider } from './components/GlobalContext';
import { ParametersProvider } from './components/ParametersContext';
import { AuthProvider } from './components/AuthContext';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <ParametersProvider>
        <GlobalProvider>
          <Main />
        </GlobalProvider>
      </ParametersProvider>
    </AuthProvider>
  </React.StrictMode>
);
