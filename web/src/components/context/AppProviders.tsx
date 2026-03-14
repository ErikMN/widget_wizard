import React from 'react';
import { AppProvider } from './AppContext';
import { ParametersProvider } from './ParametersContext';
import { OnScreenMessageProvider } from './OnScreenMessageContext';
import { WidgetProvider } from '../widget/WidgetContext';
import { OverlayProvider } from '../overlay/OverlayContext';

const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  return (
    /* NOTE: Here we wrap all providers needed for context related state.
     * Order only matters when one provider consumes another's context.
     * Avoid mega-providers: keep contexts focused and independent (if possible).
     */
    <AppProvider>
      <ParametersProvider>
        <WidgetProvider>
          <OverlayProvider>
            <OnScreenMessageProvider>{children}</OnScreenMessageProvider>
          </OverlayProvider>
        </WidgetProvider>
      </ParametersProvider>
    </AppProvider>
  );
};

export default AppProviders;
