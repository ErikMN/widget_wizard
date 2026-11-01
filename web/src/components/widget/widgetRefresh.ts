import type { Widget } from './widgetInterfaces';

export function mergeWidgetRefresh(
  widgetsAtRequest: Widget[],
  currentWidgets: Widget[],
  refreshedWidgets: Widget[]
): Widget[] {
  const originalById = new Map(
    widgetsAtRequest.map((widget) => [widget.generalParams.id, widget])
  );
  const currentById = new Map(
    currentWidgets.map((widget) => [widget.generalParams.id, widget])
  );
  const refreshedIds = new Set<number>();
  const merged: Widget[] = [];

  for (const refreshed of refreshedWidgets) {
    const id = refreshed.generalParams.id;
    refreshedIds.add(id);

    const original = originalById.get(id);
    const current = currentById.get(id);
    if (original && !current) {
      continue;
    }
    merged.push(current && current !== original ? current : refreshed);
  }

  for (const current of currentWidgets) {
    const id = current.generalParams.id;
    if (!originalById.has(id) && !refreshedIds.has(id)) {
      merged.push(current);
    }
  }

  return merged;
}
