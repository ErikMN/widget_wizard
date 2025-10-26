import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoutes from './components/AppRoutes';
import { GlobalProvider } from './components/GlobalContext';
import { OverlayProvider } from './components/overlay/OverlayContext';
import { ParametersProvider } from './components/ParametersContext';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

root.render(
  <React.StrictMode>
    <ParametersProvider>
      <GlobalProvider>
        <OverlayProvider>
          <AppRoutes />
        </OverlayProvider>
      </GlobalProvider>
    </ParametersProvider>
  </React.StrictMode>
);
