import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { WidgetProvider } from './components/WidgetContext';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

root.render(
  <React.StrictMode>
    <WidgetProvider>
      <App />
    </WidgetProvider>
  </React.StrictMode>
);
