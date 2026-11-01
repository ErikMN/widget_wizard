import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const appModule = `
export const useAlertActionsContext = () => globalThis.__widgetTest.alert;
export const useAppStatusContext = () => globalThis.__widgetTest.status;
export const useChannelContext = () => globalThis.__widgetTest.channel;
export const useAppSettingsContext = () => globalThis.__widgetTest.settings;
`;

const apiModule = `
export const apiListWidgets = (...args) => globalThis.__widgetTest.api.list(...args);
export const apiListWidgetCapabilities = (...args) => globalThis.__widgetTest.api.capabilities(...args);
export const apiUpdateWidget = (...args) => globalThis.__widgetTest.api.update(...args);
export const apiAddWidget = (...args) => globalThis.__widgetTest.api.add(...args);
export const apiAddCustomWidget = (...args) => globalThis.__widgetTest.api.addCustom(...args);
export const apiRemoveWidget = (...args) => globalThis.__widgetTest.api.remove(...args);
export const apiRemoveAllWidgets = (...args) => globalThis.__widgetTest.api.removeAll(...args);
`;

const widgetContextModule = `
export const useWidgetData = () => globalThis.__widgetTest.widgetData;
export const useWidgetActions = () => globalThis.__widgetTest.widgetActions;
`;

const controlsModule = `
import React from 'react';
export const CustomButton = ({ children, onClick, ...props }) =>
  React.createElement('button', { onClick, disabled: props.disabled }, children);
export const CustomSwitch = ({ checked, onChange }) =>
  React.createElement('input', { type: 'checkbox', checked, onChange });
export const CustomSlider = ({ value, onChange, onChangeCommitted }) =>
  React.createElement('input', {
    'aria-label': 'Slider',
    type: 'range',
    value,
    onChange: (event) => onChange(event, Number(event.target.value)),
    onMouseUp: (event) => onChangeCommitted(event, Number(event.target.value))
  });
`;

const childParamsModule = `
import React from 'react';
export default React.forwardRef(function TestParams(_props, ref) {
  React.useImperativeHandle(ref, () => ({
    flushPendingChanges() {},
    cancelPendingChanges() {}
  }));
  return null;
});
`;

const jsonEditorModule = `
import React from 'react';
export const safeParseJson = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};
export default function TestJsonEditor(props) {
  return React.createElement(React.Fragment, null,
    React.createElement('textarea', {
      'aria-label': 'Widget JSON',
      value: props.jsonInput,
      onChange: (event) => props.setJsonInput(event.target.value)
    }),
    React.createElement('button', { onClick: props.onUpdate }, 'Save JSON'),
    props.jsonError &&
      React.createElement('span', { role: 'alert' }, props.jsonError)
  );
}
`;

const modules = {
  audio: "export default '/test-audio.oga';",
  app: appModule,
  api: apiModule,
  widgetContext: widgetContextModule,
  controls: controlsModule,
  childParams: childParamsModule,
  jsonEditor: jsonEditorModule,
  hooks: 'export const useTabVisibility = () => {};',
  logger: 'export const log = () => {}; export const enableLogging = () => {};',
  utils: `
export const playSound = () => {};
export const capitalizeFirstLetter = (value) =>
  value ? value[0].toUpperCase() + value.slice(1) : value;
export const toNiceName = (value) => value;
`
};

function testModules() {
  return {
    name: 'widget-ui-test-dependencies',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) {
        return null;
      }
      const path = importer.replaceAll('\\', '/');
      const isContext = path.endsWith('/WidgetContext.tsx');
      const isSpecific = path.endsWith('/WidgetSpecificParams.tsx');
      const isItem = path.endsWith('/WidgetItem.tsx');
      const sources = {
        '../context/AppContext.js': 'app',
        '../context/AppContext': 'app',
        '../../helpers/hooks.jsx': 'hooks',
        '../../helpers/logger.js': 'logger',
        '../../helpers/utils': 'utils',
        './widgetApi': 'api',
        './WidgetContext': 'widgetContext',
        './WidgetGeneralParams': 'childParams',
        './WidgetSpecificParams': 'childParams',
        '../JsonEditor': 'jsonEditor',
        '../CustomComponents': 'controls'
      };
      if (isContext && source.endsWith('.oga')) {
        return '\0widget-ui-test:audio';
      }
      if (isContext && ['./widgetApi', '../context/AppContext.js',
        '../../helpers/hooks.jsx', '../../helpers/logger.js',
        '../../helpers/utils'].includes(source)) {
        return '\0widget-ui-test:' + sources[source];
      }
      if (isSpecific && ['./WidgetContext', '../context/AppContext',
        '../CustomComponents', '../../helpers/utils'].includes(source)) {
        return '\0widget-ui-test:' + sources[source];
      }
      if (isItem && ['./WidgetContext', '../context/AppContext',
        '../CustomComponents', './WidgetGeneralParams',
        './WidgetSpecificParams', '../JsonEditor',
        '../../helpers/utils'].includes(source)) {
        return '\0widget-ui-test:' + sources[source];
      }
      return null;
    },
    load(id) {
      const prefix = '\0widget-ui-test:';
      return id.startsWith(prefix) ? modules[id.slice(prefix.length)] : null;
    }
  };
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function widget(id = 1, text = 'Original') {
  return {
    width: 200,
    height: 50,
    generalParams: {
      id,
      type: 'textannotation',
      anchor: 'topLeft',
      channel: -1,
      datasource: '',
      isVisible: true,
      position: { x: 0, y: 0 },
      size: 'medium',
      transparency: 0,
      updateTime: 1,
      depth: 'back'
    },
    widgetParams: { text }
  };
}

export async function createWidgetUiHarness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost'
  });
  for (const key of ['window', 'document', 'HTMLElement', 'Element',
    'Node', 'MutationObserver', 'Event', 'MouseEvent', 'navigator']) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? dom.window : dom.window[key]
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const server = await createServer({
    configFile: false,
    resolve: {
      alias: [{
        find: /^lodash$/,
        replacement: fileURLToPath(new URL('./lodashTest.mjs', import.meta.url))
      }]
    },
    plugins: [testModules()],
    server: { middlewareMode: true }
  });
  let testing;
  let React;
  try {
    testing = await import('@testing-library/react');
    React = await import('react');
  } catch (error) {
    await server.close();
    dom.window.close();
    throw error;
  }
  return {
    server,
    React,
    ...testing,
    async close() {
      testing.cleanup();
      await server.close();
      dom.window.close();
      delete globalThis.__widgetTest;
    }
  };
}
