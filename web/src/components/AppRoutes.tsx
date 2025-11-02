import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';

/* Components */
import App from './App';
import Settings from './Settings';
import WidgetCapabilities from './widget/WidgetCapabilities';
import WidgetHandler from './widget/WidgetHandler';
import OverlayHandler from './overlay/OverlayHandler';

const AppRoutes = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Main application */}
        <Route path="/" element={<LoadingScreen Component={App} />}>
          {/* Default to widgets */}
          <Route index element={<Navigate to="widgets" replace />} />
          <Route path="widgets" element={<WidgetHandler />} />
          <Route path="overlays" element={<OverlayHandler />} />
        </Route>

        {/* Other standalone pages */}
        <Route
          path="/settings"
          element={<LoadingScreen Component={Settings} />}
        />
        <Route
          path="/capabilities"
          element={<LoadingScreen Component={WidgetCapabilities} />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRoutes;
