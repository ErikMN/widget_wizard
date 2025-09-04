/* Decides what to show in the app drawer */
import React from 'react';
import { useGlobalContext } from './GlobalContext';
import DrawControls from './draw/DrawControls';
import WidgetHandler from './widget/WidgetHandler';

const DrawerContent: React.FC = () => {
  const { drawActive, setDrawActive, overlayRef } = useGlobalContext();

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
