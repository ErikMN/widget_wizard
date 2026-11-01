import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let mergeWidgetRefresh;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true }
  });
  ({ mergeWidgetRefresh } = await server.ssrLoadModule(
    '/src/components/widget/widgetRefresh.ts'
  ));
});

after(async () => {
  await server?.close();
});

const widget = (id, value) => ({
  generalParams: { id },
  widgetParams: { value }
});

test('includes a newly created widget when another widget changes during refresh', () => {
  const original = widget(1, 'original');
  const edited = widget(1, 'edited');
  const created = widget(2, 'created');

  assert.deepEqual(
    mergeWidgetRefresh([original], [edited], [original, created]),
    [edited, created]
  );
});

test('does not restore a locally deleted widget from an old response', () => {
  const removed = widget(1, 'removed');
  const existing = widget(2, 'existing');

  assert.deepEqual(
    mergeWidgetRefresh([removed, existing], [existing], [removed, existing]),
    [existing]
  );
});

test('preserves widgets added locally after a refresh started', () => {
  const initial = widget(1, 'initial');
  const added = widget(3, 'added');

  assert.deepEqual(mergeWidgetRefresh([initial], [initial, added], [initial]), [
    initial,
    added
  ]);
});

test('uses refreshed values for unchanged widgets', () => {
  const initial = widget(1, 'initial');
  const refreshed = widget(1, 'refreshed');

  assert.deepEqual(mergeWidgetRefresh([initial], [initial], [refreshed]), [
    refreshed
  ]);
});
