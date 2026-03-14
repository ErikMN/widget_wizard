import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoutes from './components/AppRoutes';
import AppProviders from './components/context/AppProviders';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

root.render(
  <React.StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </React.StrictMode>
);
