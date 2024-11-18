import { HashRouter, Routes, Route } from 'react-router-dom';

import App from './App';
import Settings from './Settings';

const AppRoutes = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<App />} />
      </Routes>
    </HashRouter>
  );
};

export default AppRoutes;
