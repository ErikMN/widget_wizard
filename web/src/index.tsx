import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoutes from './components/AppRoutes';
import { AppProvider } from './components/AppContext';
import { WidgetProvider } from './components/widget/WidgetContext';
import { OverlayProvider } from './components/overlay/OverlayContext';
import { ParametersProvider } from './components/ParametersContext';

import './assets/css/index.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

/* NOTE: Here we wrap all providers needed for context related state.
 * Order only matters when one provider consumes another's context.
 * Avoid mega-providers: keep contexts focused and independent (if possible).
 */
root.render(
  <React.StrictMode>
    <AppProvider>
      <ParametersProvider>
        <WidgetProvider>
          <OverlayProvider>
            <AppRoutes />
          </OverlayProvider>
        </WidgetProvider>
      </ParametersProvider>
    </AppProvider>
  </React.StrictMode>
);
