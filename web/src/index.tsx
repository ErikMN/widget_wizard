import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { WidgetProvider } from './components/WidgetContext';
import { ParametersProvider } from './components/ParametersContext';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

root.render(
  <React.StrictMode>
    <ParametersProvider>
      <WidgetProvider>
        <App />
      </WidgetProvider>
    </ParametersProvider>
  </React.StrictMode>
);
