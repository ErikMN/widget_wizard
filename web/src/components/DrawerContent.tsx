/* Decides what to show in the app drawer */
import React from 'react';
import { useDraw } from './draw/DrawContext';
import DrawControls from './draw/DrawControls';
import WidgetHandler from './widget/WidgetHandler';

const DrawerContent: React.FC = () => {
  const { drawActive, setDrawActive, overlayRef } = useDraw();

  if (!drawActive) {
    return <WidgetHandler />;
  }

  return (
    <DrawControls
      overlayRef={overlayRef}
      onExit={() => {
        setDrawActive(false);
        overlayRef.current?.stop?.();
      }}
    />
  );
};

export default DrawerContent;
