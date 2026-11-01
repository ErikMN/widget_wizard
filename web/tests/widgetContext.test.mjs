import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createWidgetUiHarness, deferred, widget } from './widgetUiHarness.mjs';

let harness;
let WidgetProvider;
let useWidgetActions;
let useWidgetData;

before(async () => {
  harness = await createWidgetUiHarness();
  ({ WidgetProvider, useWidgetActions, useWidgetData } =
    await harness.server.ssrLoadModule('/src/components/widget/WidgetContext.tsx'));
});

afterEach(() => {
  harness?.cleanup();
});

after(async () => {
  await harness?.close();
});

function mount(api) {
  globalThis.__widgetTest = {
    api: {
      list: async () => ({ data: { widgets: [widget()] } }),
      capabilities: async () => ({
        data: { widgets: [{ type: 'textannotation', widgetParams: {} }] }
      }),
      update: async () => ({}),
      add: async () => ({ data: { id: 2 } }),
      addCustom: async () => ({ data: { id: 2 } }),
      remove: async () => ({}),
      removeAll: async () => ({}),
      ...api
    },
    alert: { handleOpenAlert() {} },
    status: { setAppLoading() {} },
    channel: { currentChannel: '1' }
  };

  const current = {};
  function Probe() {
    current.actions = useWidgetActions();
    current.data = useWidgetData();
    return null;
  }

  harness.render(harness.React.createElement(
    WidgetProvider, null, harness.React.createElement(Probe)
  ));
  return current;
}

test('switch waits until a pending widget edit completes', async () => {
  const update = deferred();
  const calls = [];
  const current = mount({
    update: async (_item, mode) => {
      calls.push('update:' + mode);
      return update.promise;
    },
    list: async (mode) => {
      calls.push('list:' + mode);
      return { data: { widgets: [widget()] } };
    },
    capabilities: async (mode) => {
      calls.push('capabilities:' + mode);
      return { data: { widgets: [{ type: 'textannotation' }] } };
    }
  });

  await harness.act(async () => {
    current.actions.setActiveWidgets([widget()]);
  });

  let updating;
  await harness.act(async () => {
    updating = current.actions.updateWidget(1, (previous) => ({
      ...previous,
      widgetParams: { text: 'Edited' }
    }));
    await Promise.resolve();
  });

  let switching;
  await harness.act(async () => {
    switching = current.actions.switchWidgetApi('v3');
    await Promise.resolve();
  });
  assert.deepEqual(calls, ['update:legacy']);

  await harness.act(async () => {
    update.resolve({});
    await Promise.all([updating, switching]);
  });
  assert.equal(current.data.widgetApiMode, 'v3');
  assert.deepEqual(calls, [
    'update:legacy', 'capabilities:v3', 'list:v3'
  ]);
});

test('switch waits for removal that is waiting for a pending edit', async () => {
  const update = deferred();
  const removal = deferred();
  const calls = [];
  const current = mount({
    update: async () => {
      calls.push('update');
      return update.promise;
    },
    remove: async () => {
      calls.push('remove');
      return removal.promise;
    },
    list: async (mode) => {
      calls.push('list:' + mode);
      return { data: { widgets: [] } };
    },
    capabilities: async () => ({
      data: { widgets: [{ type: 'textannotation' }] }
    })
  });

  await harness.act(async () => {
    current.actions.setActiveWidgets([widget()]);
  });

  let updating;
  await harness.act(async () => {
    updating = current.actions.updateWidget(1, (previous) => ({
      ...previous, widgetParams: { text: 'Edited' }
    }));
    await Promise.resolve();
  });

  let removing;
  let switching;
  await harness.act(async () => {
    removing = current.actions.removeWidget(1);
    switching = current.actions.switchWidgetApi('v3');
    await Promise.resolve();
  });
  assert.deepEqual(calls, ['update']);

  await harness.act(async () => {
    update.resolve({});
    await updating;
    await Promise.resolve();
  });
  assert.deepEqual(calls, ['update', 'remove']);

  await harness.act(async () => {
    removal.resolve({});
    await Promise.all([removing, switching]);
  });
  assert.equal(current.data.widgetApiMode, 'v3');
  assert.ok(calls.includes('list:v3'));
});

test('a late response from the previous API cannot overwrite switched widgets', async () => {
  const oldList = deferred();
  const current = mount({
    list: (mode) => mode === 'legacy'
      ? oldList.promise
      : Promise.resolve({ data: { widgets: [widget(2, 'New API')] } })
  });

  let listing;
  await harness.act(async () => {
    listing = current.actions.listWidgets();
    await Promise.resolve();
  });

  await harness.act(async () => {
    await current.actions.switchWidgetApi('v3');
  });
  assert.equal(current.data.widgetApiMode, 'v3');

  await harness.act(async () => {
    oldList.resolve({ data: { widgets: [widget(1, 'Old API')] } });
    await listing;
  });
  assert.deepEqual(
    current.data.activeWidgets.map((value) => value.generalParams.id),
    [2]
  );
});

test('a failed removal leaves the widget in the active list', async () => {
  const current = mount({
    remove: async () => ({ error: { code: 1, message: 'Denied' } })
  });

  await harness.act(async () => {
    current.actions.setActiveWidgets([widget()]);
  });
  await harness.act(async () => {
    await current.actions.removeWidget(1);
  });
  assert.deepEqual(
    current.data.activeWidgets.map((value) => value.generalParams.id),
    [1]
  );
});
