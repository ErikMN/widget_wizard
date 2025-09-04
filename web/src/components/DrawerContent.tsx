/* Decides what to show in the app drawer */
import React from 'react';
import { useGlobalContext } from './GlobalContext';
import DrawControls from './draw/DrawControls';
import WidgetHandler from './widget/WidgetHandler';

const DrawerContent: React.FC = () => {
  const { drawModeActive, setDrawModeActive, drawModeOverlayRef } =
    useGlobalContext();

  if (!drawModeActive) {
    return <WidgetHandler />;
  }

  return (
    <DrawControls
      overlayRef={drawModeOverlayRef}
      onExit={() => {
        setDrawModeActive(false);
        drawModeOverlayRef.current?.stop?.();
      }}
    />
  );
};

export default DrawerContent;
