import React from 'react';
import ReactJsonViewImport from 'react-json-view';

type ReactJsonViewComponent = React.ComponentType<any>;

/* react-json-view is an older CommonJS package. With the current Vite setup,
 * the import may be either the component itself or an object with the component
 * under default. Pick the component shape React can render.
 */
const ReactJsonView = ((ReactJsonViewImport as unknown as { default?: unknown })
  .default ?? ReactJsonViewImport) as ReactJsonViewComponent;

export default ReactJsonView;
