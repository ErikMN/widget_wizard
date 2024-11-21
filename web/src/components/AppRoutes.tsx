import { HashRouter, Routes, Route } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';

/* Components */
import App from './App';
import Settings from './Settings';
import WidgetCapabilities from './widget/WidgetCapabilities';

const AppRoutes = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LoadingScreen Component={App} />} />
        <Route
          path="/settings"
          element={<LoadingScreen Component={Settings} />}
        />
        <Route
          path="/capabilities"
          element={<LoadingScreen Component={WidgetCapabilities} />}
        />
        <Route path="*" element={<LoadingScreen Component={App} />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRoutes;
