/**
 * AppRoutes
 *
 * This component defines the routing structure of the application using React Router.
 */
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';

/* Components */
import App from './App';
import Settings from './Settings';
/* Widgets */
import WidgetHandler from './widget/WidgetHandler';
import WidgetCapabilities from './widget/WidgetCapabilities';
/* Overlays */
import OverlayHandler from './overlay/OverlayHandler';
import OverlayCapabilities from './overlay/OverlayCapabilities';

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
          path="/widgetcapabilities"
          element={<LoadingScreen Component={WidgetCapabilities} />}
        />
        <Route
          path="/overlaycapabilities"
          element={<LoadingScreen Component={OverlayCapabilities} />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRoutes;
