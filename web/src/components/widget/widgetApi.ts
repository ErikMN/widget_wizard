/* Widget endpoint communication functions (backend API layer). */
import { jsonRequest } from '../../helpers/cgihelper';
import { ApiResponse, Widget, WidgetCapabilities } from './widgetInterfaces.js';
import { W_CGI } from '../constants.js';

export type WidgetApiMode = 'legacy' | 'v3';

export function isValidV3Datasource(value: string): boolean {
  return value === '' || /^[#%][A-Za-z0-9.]+$/.test(value);
}

/* DANGER ZONE: Changing API version may break stuff */
const API_VERSION = '2.0';
const V3_API_BASE = '/config/rest/overlaywidget/v3beta';

interface RestResponse {
  status?: string;
  data?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function getEnum(value: unknown): string[] {
  const enumValues = asRecord(value)?.enum;
  return Array.isArray(enumValues)
    ? enumValues.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

const alignmentToLegacy: Record<string, string> = {
  TOP_LEFT: 'topLeft',
  TOP_CENTER: 'topCenter',
  TOP_RIGHT: 'topRight',
  BOTTOM_LEFT: 'bottomLeft',
  BOTTOM_CENTER: 'bottomCenter',
  BOTTOM_RIGHT: 'bottomRight',
  CENTER: 'center',
  CENTER_LEFT: 'centerLeft',
  CENTER_RIGHT: 'centerRight',
  NONE: 'none'
};

const alignmentToV3 = Object.fromEntries(
  Object.entries(alignmentToLegacy).map(([v3, legacy]) => [legacy, v3])
);

async function restRequest(
  path: string,
  method: string,
  payload?: unknown
): Promise<RestResponse> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(
      `Overlay Widget v3 returned invalid JSON (HTTP ${response.status})`,
      { cause: error }
    );
  }
  const result = asRecord(body);
  if (!result) {
    throw new Error(`Overlay Widget v3 returned an invalid response`);
  }

  const rawError = asRecord(result.error);
  const error =
    rawError && typeof rawError.message === 'string'
      ? {
          code: Number(rawError.code ?? 0),
          message: rawError.message
        }
      : undefined;

  if (!response.ok && !error) {
    throw new Error(
      `Overlay Widget v3 request failed (HTTP ${response.status})`
    );
  }
  return {
    status: typeof result.status === 'string' ? result.status : undefined,
    data: result.data,
    error
  };
}

function restError(response: RestResponse) {
  if (response.error) {
    return response.error;
  }
  if (response.status === 'error') {
    return { code: 0, message: 'Overlay Widget v3 request failed' };
  }
  return undefined;
}

function responseFromRest(response: RestResponse): ApiResponse {
  const error = restError(response);
  if (error) {
    return { error };
  }
  const data = asRecord(response.data);
  return {
    data:
      data && (typeof data.id === 'string' || typeof data.id === 'number')
        ? { id: data.id }
        : undefined
  };
}

function toLegacyWidget(widget: Record<string, unknown>): Widget {
  const id = Number(widget.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`Overlay Widget v3 returned an invalid widget ID`);
  }

  const opacity = Number(widget.opacity);
  const channel = Number(widget.channel);
  const dimensions = asRecord(widget.dimensions);
  const position = asRecord(widget.position);
  const width = Number(dimensions?.width);
  const height = Number(dimensions?.height);
  const x = Number(position?.x);
  const y = Number(position?.y);
  const updateInterval = Number(widget.updateInterval);
  const alignment = alignmentToLegacy[String(widget.alignment)];
  const datasource = widget.datasource;
  const plane = widget.plane == null ? null : Number(widget.plane);

  if (
    !Number.isFinite(channel) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    !Number.isFinite(updateInterval) ||
    typeof widget.visible !== 'boolean' ||
    (datasource !== null && typeof datasource !== 'string') ||
    typeof widget.type !== 'string' ||
    typeof widget.size !== 'string' ||
    !alignment ||
    (plane !== null && (!Number.isSafeInteger(plane) || plane < 1))
  ) {
    throw new Error(`Overlay Widget v3 returned invalid widget ${id}`);
  }

  return {
    width,
    height,
    generalParams: {
      anchor: alignment,
      channel,
      datasource: datasource ?? '',
      id,
      isVisible: widget.visible,
      position: { x, y },
      size: widget.size.toLowerCase(),
      transparency: (1 - opacity) * 100,
      type: widget.type,
      updateTime: updateInterval,
      depth: 'back',
      plane
    },
    widgetParams: asRecord(widget.widgetParams) ?? {}
  };
}

function toV3WidgetPayload(widget: Widget) {
  const params = widget.generalParams;
  if (!isValidV3Datasource(params.datasource)) {
    throw new Error(
      'Invalid v3 datasource: use # or % followed by letters, digits or dots, or leave empty for no source'
    );
  }
  return {
    type: params.type,
    channel: params.channel === 0 ? null : String(params.channel),
    datasource: params.datasource === '' ? null : params.datasource,
    position: params.position,
    alignment: alignmentToV3[params.anchor] ?? 'NONE',
    size: params.size.toUpperCase(),
    opacity: 1 - params.transparency / 100,
    visible: params.isVisible,
    plane: params.plane == null ? null : String(params.plane),
    updateInterval: params.updateTime,
    widgetParams: widget.widgetParams
  };
}

function normalizeV3Capabilities(
  generalResponse: RestResponse,
  typesResponse: RestResponse
): WidgetCapabilities {
  const generalParams = asRecord(generalResponse.data)?.generalParams;
  const types = typesResponse.data;
  if (!Array.isArray(types)) {
    throw new Error('Overlay Widget v3 returned invalid capabilities');
  }

  const params = asRecord(generalParams);
  if (!params) {
    throw new Error('Overlay Widget v3 returned invalid general capabilities');
  }
  const updateInterval = asRecord(params.updateInterval);
  const alignments = getEnum(params.alignment);
  const sizes = getEnum(params.size);
  if (alignments.length === 0 || sizes.length === 0 || !updateInterval) {
    throw new Error('Overlay Widget v3 returned invalid general capabilities');
  }
  const widgetTypeSpecs = types.map((item) => {
    const typeSpec = asRecord(item);
    if (!typeSpec || typeof typeSpec.type !== 'string') {
      throw new Error('Overlay Widget v3 returned invalid widget capabilities');
    }
    return {
      type: String(typeSpec.type),
      widgetParams: asRecord(typeSpec.widgetParams) ?? {}
    };
  });

  return {
    apiVersion: '3.0',
    method: 'listCapabilities',
    data: {
      ...params,
      anchor: {
        type: 'string',
        enum: alignments.map(
          (alignment) => alignmentToLegacy[alignment] ?? 'none'
        )
      },
      channel: { type: 'integer' },
      depth: { type: 'string', enum: ['front', 'back'] },
      isVisible: { type: 'bool' },
      size: {
        type: 'string',
        enum: sizes.map((size) => size.toLowerCase())
      },
      transparency: {
        type: 'float',
        minimum: 0,
        maximum: 100
      },
      type: { type: 'string' },
      updateTime: {
        type: 'float',
        minimum: Number(updateInterval?.minimum ?? 0)
      },
      widgets: widgetTypeSpecs
    }
  };
}

/* Updates the parameters of a widget */
export async function apiUpdateWidget(
  widgetItem: Widget,
  mode: WidgetApiMode = 'legacy',
  previousWidget?: Widget,
  forceDepthAction = false
): Promise<ApiResponse> {
  if (mode === 'v3') {
    const widgetId = widgetItem.generalParams.id;
    if (
      previousWidget &&
      (forceDepthAction ||
        widgetItem.generalParams.depth !== previousWidget.generalParams.depth)
    ) {
      const depth = widgetItem.generalParams.depth;
      if (depth !== 'front' && depth !== 'back') {
        return {
          error: {
            code: 0,
            message: 'Widget depth cycling is not supported by the v3 API'
          }
        };
      }
      const action = depth === 'front' ? 'moveToFront' : 'moveToBack';
      const actionResponse = await restRequest(
        `${V3_API_BASE}/widgets/${widgetId}/${action}`,
        'POST',
        {}
      );
      if (restError(actionResponse)) {
        return responseFromRest(actionResponse);
      }
    }

    const previousValues = previousWidget
      ? new Map(Object.entries(toV3WidgetPayload(previousWidget)))
      : undefined;
    const data = Object.fromEntries(
      Object.entries(toV3WidgetPayload(widgetItem)).filter(([key, value]) => {
        if (key === 'type') {
          return false;
        }
        if (!previousValues) {
          return true;
        }
        return (
          JSON.stringify(value) !== JSON.stringify(previousValues.get(key))
        );
      })
    );
    if (Object.keys(data).length === 0) {
      return {};
    }

    const response = responseFromRest(
      await restRequest(`${V3_API_BASE}/widgets/${widgetId}`, 'PATCH', { data })
    );
    if (response.error) {
      return response;
    }

    const dimensionsMayChange = [
      'size',
      'widgetParams',
      'datasource',
      'channel'
    ].some((key) => key in data);
    if (dimensionsMayChange) {
      try {
        const widgetList = await apiListWidgets('v3');
        const refreshedWidget = widgetList?.data?.widgets?.find(
          (widget) => widget.generalParams.id === widgetId
        );
        if (refreshedWidget) {
          return {
            ...response,
            data: {
              ...response.data,
              width: refreshedWidget.width,
              height: refreshedWidget.height
            }
          };
        }
      } catch (error) {
        console.error('Failed to refresh widget dimensions:', error);
      }
    }

    return response;
  }

  const updatedGeneralParams = Object.fromEntries(
    Object.entries(widgetItem.generalParams).filter(([key]) => key !== 'type')
  );
  const payload = {
    apiVersion: API_VERSION,
    method: 'updateWidget',
    params: {
      generalParams: updatedGeneralParams,
      widgetParams: widgetItem.widgetParams
    }
  };

  return jsonRequest(W_CGI, payload);
}

/* Lists all currently active widgets and their parameter values */
export async function apiListWidgets(
  mode: WidgetApiMode = 'legacy'
): Promise<ApiResponse | null> {
  if (mode === 'v3') {
    const response = await restRequest(`${V3_API_BASE}/widgets`, 'GET');
    const error = restError(response);
    if (error) {
      return { error };
    }
    if (!Array.isArray(response.data)) {
      throw new Error('Overlay Widget v3 returned an invalid widget list');
    }
    const widgets = response.data.map((item) => {
      const widget = asRecord(item);
      if (!widget) {
        throw new Error('Overlay Widget v3 returned an invalid widget');
      }
      return toLegacyWidget(widget);
    });
    return { data: { widgets } };
  }

  const payload = {
    apiVersion: API_VERSION,
    method: 'listWidgets'
  };

  return jsonRequest(W_CGI, payload);
}

/* Lists all available widget types and their parameters */
export async function apiListWidgetCapabilities(
  mode: WidgetApiMode = 'legacy'
): Promise<WidgetCapabilities | null> {
  if (mode === 'v3') {
    const [generalResponse, typesResponse] = await Promise.all([
      restRequest(`${V3_API_BASE}/capabilities`, 'GET'),
      restRequest(`${V3_API_BASE}/capabilities/types`, 'GET')
    ]);
    const error = restError(generalResponse) ?? restError(typesResponse);
    if (error) {
      return { error };
    }
    return normalizeV3Capabilities(generalResponse, typesResponse);
  }

  const payload = {
    apiVersion: API_VERSION,
    method: 'listCapabilities'
  };

  return jsonRequest(W_CGI, payload);
}

/* Adds a new widget */
export async function apiAddWidget(
  widgetType: string,
  currentChannel: string,
  mode: WidgetApiMode = 'legacy'
): Promise<ApiResponse> {
  if (mode === 'v3') {
    const payload = {
      type: widgetType,
      channel: currentChannel === '0' ? null : currentChannel,
      widgetParams: {}
    };

    return responseFromRest(
      await restRequest(`${V3_API_BASE}/widgets`, 'POST', { data: payload })
    );
  }

  const payload = {
    apiVersion: API_VERSION,
    method: 'addWidget',
    params: {
      /* Default general widget parameter settings
       * NOTE: We might not want defaults for _every_ general params here
       * because they would overwrite custom per widget defaults.
       */
      generalParams: {
        type: widgetType,
        datasource: '#D0',
        /* anchor: 'none', */
        channel: parseInt(currentChannel, 10),
        isVisible: true,
        position: { x: 0, y: 0 },
        size: 'medium',
        transparency: 0,
        updateTime: 1
      },
      widgetParams: {} as {
        minAlarmThreshold?: { value: number; enabled: boolean };
        maxAlarmThreshold?: { value: number; enabled: boolean };
      }
    }
  };

  /* NOTE: HACK: Official web UI seems to need these set to move the bbox */
  if (widgetType === 'linegraph' || widgetType === 'meter') {
    payload.params.widgetParams.minAlarmThreshold = {
      value: 0,
      enabled: false
    };
    payload.params.widgetParams.maxAlarmThreshold = {
      value: 100,
      enabled: false
    };
  }

  return jsonRequest(W_CGI, payload);
}

/* Adds a custom widget */
export async function apiAddCustomWidget(
  params: Widget,
  mode: WidgetApiMode = 'legacy'
): Promise<ApiResponse> {
  if (mode === 'v3') {
    return responseFromRest(
      await restRequest(`${V3_API_BASE}/widgets`, 'POST', {
        data: toV3WidgetPayload(params)
      })
    );
  }

  /* NOTE: Strip parameters not accepted by addWidget */
  const restParams = Object.fromEntries(
    Object.entries(params).filter(
      ([key]) => key !== 'height' && key !== 'width' && key !== 'generalParams'
    )
  );
  const restGeneralParams = Object.fromEntries(
    Object.entries(params.generalParams).filter(([key]) => key !== 'id')
  );

  const payload = {
    apiVersion: API_VERSION,
    method: 'addWidget',
    params: {
      ...restParams,
      generalParams: restGeneralParams
    }
  };

  return jsonRequest(W_CGI, payload);
}

/* Removes a specified widget */
export async function apiRemoveWidget(
  widgetID: number,
  mode: WidgetApiMode = 'legacy'
): Promise<ApiResponse> {
  if (mode === 'v3') {
    return responseFromRest(
      await restRequest(`${V3_API_BASE}/widgets/${widgetID}`, 'DELETE')
    );
  }

  const payload = {
    apiVersion: API_VERSION,
    method: 'removeWidget',
    params: {
      generalParams: {
        id: widgetID
      }
    }
  };

  return jsonRequest(W_CGI, payload);
}

/* Removes all currently active widgets */
export async function apiRemoveAllWidgets(
  mode: WidgetApiMode = 'legacy'
): Promise<ApiResponse> {
  if (mode === 'v3') {
    return responseFromRest(
      await restRequest(`${V3_API_BASE}/removeAllWidgets`, 'POST', {})
    );
  }

  const payload = {
    apiVersion: API_VERSION,
    method: 'removeAllWidgets'
  };

  return jsonRequest(W_CGI, payload);
}
