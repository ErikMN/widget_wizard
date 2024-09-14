import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);

const isOverlayExample = localStorage.getItem('ovlexample') === 'true';

if (!isOverlayExample) {
  /* Widget Wizard */
  import('./assets/css/index.css');
  import('./components/App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
} else {
  /* Overlay example */
  import('./components/overlay-example/App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}
/*
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
*/
