import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createWidgetUiHarness, deferred, widget } from './widgetUiHarness.mjs';

let harness;
let WidgetItem;

before(async () => {
  harness = await createWidgetUiHarness();
  ({ default: WidgetItem } = await harness.server.ssrLoadModule(
    '/src/components/widget/WidgetItem.tsx'
  ));
});

afterEach(() => {
  harness?.cleanup();
});

after(async () => {
  await harness?.close();
});

function mount(updateWidget) {
  globalThis.__widgetTest = {
    widgetData: { widgetApiMode: 'v3' },
    widgetActions: { updateWidget, addCustomWidget: async () => true },
    alert: { handleOpenAlert() {} }
  };

  const initial = widget();
  const props = (item) => ({
    widget: item,
    toggleDropdown() {},
    onBackupRequested() {},
    onRemoveRequested() {},
    backupLimitReached: false,
    isOpen: true,
    isActive: false
  });
  const view = harness.render(
    harness.React.createElement(WidgetItem, props(initial))
  );
  return {
    initial,
    rerender: (value) =>
      view.rerender(harness.React.createElement(WidgetItem, props(value)))
  };
}

function editJson(text) {
  harness.fireEvent.change(
    harness.screen.getByRole('textbox', { name: 'Widget JSON' }),
    { target: { value: text } }
  );
}

function jsonText() {
  return harness.screen.getByRole('textbox', { name: 'Widget JSON' }).value;
}

test('keeps an unsaved JSON draft when widget data refreshes', () => {
  const current = mount(() => Promise.resolve());
  const draft = JSON.stringify({
    ...current.initial,
    widgetParams: { text: 'Draft' }
  });
  editJson(draft);

  current.rerender({
    ...current.initial,
    widgetParams: { text: 'Updated remotely' }
  });
  assert.equal(jsonText(), draft);
});

test('keeps the draft after a rejected JSON save', async () => {
  const pending = deferred();
  let onFailure;
  const current = mount((_id, _updater, options) => {
    onFailure = options.onFailure;
    return pending.promise;
  });
  const draft = JSON.stringify({
    ...current.initial,
    widgetParams: { text: 'Rejected' }
  });
  editJson(draft);
  harness.fireEvent.click(
    harness.screen.getByRole('button', { name: 'Save JSON' })
  );

  await harness.act(async () => {
    onFailure(current.initial);
    pending.resolve();
    await pending.promise;
  });
  current.rerender({
    ...current.initial,
    widgetParams: { text: 'Backend still has original' }
  });
  assert.equal(jsonText(), draft);
});

test('refreshes JSON from the backend after a confirmed save', () => {
  let onSuccess;
  const current = mount((_id, _updater, options) => {
    onSuccess = options.onSuccess;
    return Promise.resolve();
  });
  const draft = JSON.stringify({
    ...current.initial,
    widgetParams: { text: 'Saved' }
  });
  editJson(draft);
  harness.fireEvent.click(
    harness.screen.getByRole('button', { name: 'Save JSON' })
  );
  harness.act(() => onSuccess());

  current.rerender({
    ...current.initial,
    widgetParams: { text: 'Saved' }
  });
  assert.match(jsonText(), /"text": "Saved"/);
});

test('does not discard newer JSON edits when an older save succeeds', () => {
  let onSuccess;
  const current = mount((_id, _updater, options) => {
    onSuccess = options.onSuccess;
    return Promise.resolve();
  });
  editJson(
    JSON.stringify({
      ...current.initial,
      widgetParams: { text: 'First save' }
    })
  );
  harness.fireEvent.click(
    harness.screen.getByRole('button', { name: 'Save JSON' })
  );

  const newerDraft = JSON.stringify({
    ...current.initial,
    widgetParams: { text: 'Still editing' }
  });
  editJson(newerDraft);
  harness.act(() => onSuccess());
  current.rerender({
    ...current.initial,
    widgetParams: { text: 'First save' }
  });
  assert.equal(jsonText(), newerDraft);
});
