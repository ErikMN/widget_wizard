import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createWidgetUiHarness, deferred, widget } from './widgetUiHarness.mjs';

let harness;
let WidgetSpecificParams;

before(async () => {
  harness = await createWidgetUiHarness();
  ({ default: WidgetSpecificParams } = await harness.server.ssrLoadModule(
    '/src/components/widget/WidgetSpecificParams.tsx'
  ));
});

afterEach(() => {
  harness?.cleanup();
});

after(async () => {
  await harness?.close();
});

const capabilities = {
  data: {
    widgets: [
      {
        type: 'textannotation',
        widgetParams: {
          first: { type: 'string' },
          second: { type: 'string' },
          threshold: { type: 'float' }
        }
      }
    ]
  }
};

function mount(
  updateWidget,
  params = { first: 'one', second: 'two', threshold: 12 }
) {
  globalThis.__widgetTest = {
    widgetData: { widgetCapabilities: capabilities },
    widgetActions: { updateWidget },
    settings: { appSettings: { debug: false } }
  };

  const ref = harness.React.createRef();
  const currentWidget = { ...widget(), widgetParams: params };
  const props = (value) =>
    harness.React.createElement(WidgetSpecificParams, { ref, widget: value });
  const view = harness.render(props(currentWidget));
  return {
    ref,
    rerender: (value) => view.rerender(props(value)),
    currentWidget
  };
}

test('keeps a newer edit visible while an older update completes', async () => {
  const calls = [];
  const updateWidget = (_id, updater, options) => {
    const result = deferred();
    calls.push({ result, options, updater });
    return result.promise;
  };
  const current = mount(updateWidget);

  harness.fireEvent.change(
    harness.screen.getByRole('textbox', { name: 'first' }),
    {
      target: { value: 'edited' }
    }
  );
  await harness.act(async () => {
    current.ref.current.flushPendingChanges();
    await Promise.resolve();
  });
  assert.equal(calls.length, 1);

  harness.fireEvent.change(
    harness.screen.getByRole('textbox', { name: 'second' }),
    {
      target: { value: 'newer' }
    }
  );
  await harness.act(async () => {
    current.ref.current.flushPendingChanges();
    await Promise.resolve();
  });
  assert.equal(calls.length, 2);

  const confirmed = {
    ...current.currentWidget,
    widgetParams: { first: 'edited', second: 'two', threshold: 12 }
  };
  current.rerender(confirmed);
  assert.equal(
    harness.screen.getByRole('textbox', { name: 'second' }).value,
    'newer'
  );

  await harness.act(async () => {
    calls[0].options.onFailure(current.currentWidget);
    calls[0].result.resolve();
    await calls[0].result.promise;
  });
  assert.equal(
    harness.screen.getByRole('textbox', { name: 'second' }).value,
    'newer'
  );

  await harness.act(async () => {
    calls[1].result.resolve();
    await calls[1].result.promise;
  });
});

test('rolls back the latest rejected generated parameter edit', async () => {
  let calls = 0;
  const initial = widget();
  initial.widgetParams = { first: 'one', second: 'two', threshold: 12 };
  const current = mount(async (_id, _updater, options) => {
    calls += 1;
    options.onFailure(initial);
  });

  harness.fireEvent.change(
    harness.screen.getByRole('textbox', { name: 'first' }),
    {
      target: { value: 'rejected' }
    }
  );
  await harness.act(async () => {
    current.ref.current.flushPendingChanges();
    await Promise.resolve();
  });

  assert.equal(calls, 1);
  assert.equal(
    harness.screen.getByRole('textbox', { name: 'first' }).value,
    'one'
  );
});

test('does not send an incomplete float input or block other edits', async () => {
  const calls = [];
  const current = mount(async (_id, updater) => {
    calls.push(updater(current.currentWidget));
  });
  const numeric = harness.screen.getByRole('spinbutton', { name: 'threshold' });

  harness.fireEvent.change(numeric, { target: { value: '' } });
  harness.fireEvent.blur(numeric);
  assert.equal(numeric.value, '12');
  assert.equal(calls.length, 0);

  harness.fireEvent.change(
    harness.screen.getByRole('textbox', { name: 'first' }),
    {
      target: { value: 'valid' }
    }
  );
  await harness.act(async () => {
    current.ref.current.flushPendingChanges();
    await Promise.resolve();
  });
  assert.equal(calls[0].widgetParams.first, 'valid');
  assert.equal(calls[0].widgetParams.threshold, 12);
});

test('cancelling a draft restores the confirmed values without sending a request', () => {
  let calls = 0;
  const current = mount(() => {
    calls += 1;
    return Promise.resolve();
  });
  const input = harness.screen.getByRole('textbox', { name: 'first' });
  harness.fireEvent.change(input, { target: { value: 'unsaved' } });
  harness.act(() => current.ref.current.cancelPendingChanges());
  assert.equal(input.value, 'one');
  assert.equal(calls, 0);
});
