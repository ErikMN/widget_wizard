import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let api;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  api = await server.ssrLoadModule('/src/components/widget/widgetApi.ts');
});

after(async () => {
  await server?.close();
});

const generalParams = {
  alignment: { type: 'string', enum: ['TOP_LEFT', 'CENTER_RIGHT', 'NONE'] },
  size: { type: 'string', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
  updateInterval: { type: 'float', minimum: -1 }
};

const widgetTypes = [
  {
    type: 'meter',
    widgetParams: { title: { type: 'string' } }
  }
];

test('reads nested v3 general capabilities and discovers widget types', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, method: options.method });
    const data = url.endsWith('/capabilities/types')
      ? widgetTypes
      : { generalParams };
    return Response.json({ status: 'success', data });
  });

  const response = await api.apiListWidgetCapabilities('v3');

  assert.deepEqual(response.data.anchor.enum, [
    'topLeft',
    'centerRight',
    'none'
  ]);
  assert.deepEqual(response.data.size.enum, ['small', 'medium', 'large']);
  assert.equal(response.data.updateTime.minimum, -1);
  assert.deepEqual(response.data.widgets, widgetTypes);
  assert.deepEqual(requests, [
    { url: '/config/rest/overlaywidget/v3beta/capabilities', method: 'GET' },
    {
      url: '/config/rest/overlaywidget/v3beta/capabilities/types',
      method: 'GET'
    }
  ]);
});

test('rejects malformed v3 general capabilities', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json({
      status: 'success',
      data: url.endsWith('/capabilities/types')
        ? widgetTypes
        : { generalParams: {} }
    })
  );

  await assert.rejects(
    api.apiListWidgetCapabilities('v3'),
    /invalid general capabilities/
  );
});

test('preserves v3 API errors', async (t) => {
  const error = { code: 4, message: 'Access denied' };
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: 'error', error })
  );

  assert.deepEqual(await api.apiListWidgetCapabilities('v3'), { error });
});

test('keeps the legacy capability request unchanged', async (t) => {
  const response = { apiVersion: '2.0', data: { widgets: widgetTypes } };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/axis-cgi/overlaywidget/overlaywidget.cgi');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      apiVersion: '2.0',
      method: 'listCapabilities'
    });
    return Response.json(response);
  });

  assert.deepEqual(await api.apiListWidgetCapabilities(), response);
});

const annotation = {
  id: '1',
  type: 'textannotation',
  channel: null,
  datasource: null,
  dimensions: { width: 200, height: 50 },
  position: { x: 0, y: 0 },
  alignment: 'NONE',
  size: 'MEDIUM',
  opacity: 1,
  visible: true,
  plane: '3',
  updateInterval: 1,
  widgetParams: { text: 'Main Street' }
};

async function readAnnotation(t) {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: 'success', data: [annotation] })
  );
  const response = await api.apiListWidgets('v3');
  t.mock.restoreAll();
  return response.data.widgets[0];
}

test('creates v3 widgets with explicit widgetParams without forcing a data source or update settings', async (t) => {
  for (const type of ['textannotation', 'plane', 'meter', 'linegraph']) {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, '/config/rest/overlaywidget/v3beta/widgets');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), {
        data: { type, channel: '1', widgetParams: {} }
      });
      return Response.json({ status: 'success', data: { id: '1' } });
    });

    await api.apiAddWidget(type, '1', 'v3');
    assert.equal(fetch.mock.callCount(), 1);
    t.mock.restoreAll();
  }
});

test('duplicates an annotation without introducing a data source', async (t) => {
  const widget = await readAnnotation(t);
  assert.equal(widget.generalParams.datasource, '');
  assert.equal(widget.generalParams.channel, 0);

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const { data } = JSON.parse(options.body);
    assert.equal(options.method, 'POST');
    assert.equal(data.type, 'textannotation');
    assert.equal(data.datasource, null);
    assert.equal(data.channel, null);
    assert.equal(data.plane, '3');
    assert.equal('id' in data, false);
    assert.equal('dimensions' in data, false);
    return Response.json({ status: 'success', data: { id: '2' } });
  });

  await api.apiAddCustomWidget(widget, 'v3');
});

test('v3 edits send only changed writable properties', async (t) => {
  const widget = await readAnnotation(t);
  const changed = {
    ...widget,
    generalParams: { ...widget.generalParams, position: { x: 0.5, y: -0.5 } }
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/config/rest/overlaywidget/v3beta/widgets/1');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), {
      data: { position: { x: 0.5, y: -0.5 } }
    });
    return Response.json({ status: 'success' });
  });

  await api.apiUpdateWidget(changed, 'v3', widget);
});

test('v3 stacking actions do not patch data source or widget parameters', async (t) => {
  const widget = await readAnnotation(t);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(
      url,
      '/config/rest/overlaywidget/v3beta/widgets/1/moveToFront'
    );
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {});
    return Response.json({ status: 'success' });
  });

  await api.apiUpdateWidget(
    { ...widget, generalParams: { ...widget.generalParams, depth: 'front' } },
    'v3',
    widget
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test('v3 no-op updates send no requests', async (t) => {
  const widget = await readAnnotation(t);
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    assert.fail('A no-op must not contact the device');
  });
  await api.apiUpdateWidget(widget, 'v3', widget);
  assert.equal(fetch.mock.callCount(), 0);
});

test('v3 source changes are still sent when explicitly requested', async (t) => {
  const widget = await readAnnotation(t);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), { data: { datasource: '#D1' } });
    return Response.json({ status: 'success' });
  });
  await api.apiUpdateWidget(
    {
      ...widget,
      generalParams: { ...widget.generalParams, datasource: '#D1' }
    },
    'v3',
    widget
  );
});

test('validates incomplete v3 source names before sending requests', async (t) => {
  for (const source of ['#', '%', 'D1', '#D 1', '#D_1']) {
    assert.equal(api.isValidV3Datasource(source), false);
  }
  for (const source of ['', '#D1', '%name', '#source.1']) {
    assert.equal(api.isValidV3Datasource(source), true);
  }

  const widget = await readAnnotation(t);
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    assert.fail('Invalid data sources must not be sent to the device');
  });
  await assert.rejects(
    api.apiUpdateWidget(
      {
        ...widget,
        generalParams: { ...widget.generalParams, datasource: '#' }
      },
      'v3',
      widget
    ),
    /Invalid v3 datasource/
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test('clearing a v3 source sends null', async (t) => {
  const widget = await readAnnotation(t);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), { data: { datasource: null } });
    return Response.json({ status: 'success' });
  });
  await api.apiUpdateWidget(widget, 'v3', {
    ...widget,
    generalParams: { ...widget.generalParams, datasource: '#D1' }
  });
});
