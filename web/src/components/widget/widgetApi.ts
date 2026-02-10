/* Widget endpoint communication functions (backend API layer)
 */
import { jsonRequest } from '../../helpers/cgihelper';
import { ApiResponse, Widget, WidgetCapabilities } from './widgetInterfaces.js';
import { W_CGI } from '../constants.js';

/* DANGER ZONE: Changing API version may break stuff */
const API_VERSION = '2.0';

/* Updates the parameters of a widget */
export async function apiUpdateWidget(
  widgetItem: Widget
): Promise<ApiResponse> {
  const { type, ...updatedGeneralParams } = widgetItem.generalParams;

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
export async function apiListWidgets(): Promise<ApiResponse | null> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'listWidgets'
  };

  return jsonRequest(W_CGI, payload);
}

/* Lists all available widget types and their parameters */
export async function apiListWidgetCapabilities(): Promise<WidgetCapabilities | null> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'listCapabilities'
  };

  return jsonRequest(W_CGI, payload);
}

/* Adds a new widget */
export async function apiAddWidget(
  widgetType: string,
  currentChannel: string
): Promise<ApiResponse> {
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
export async function apiAddCustomWidget(params: Widget): Promise<ApiResponse> {
  /* NOTE: Strip parameters not accepted by addWidget */
  const { height, width, generalParams, ...restParams } = params;
  const { id, ...restGeneralParams } = generalParams || {};

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
export async function apiRemoveWidget(widgetID: number): Promise<ApiResponse> {
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
export async function apiRemoveAllWidgets(): Promise<ApiResponse> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'removeAllWidgets'
  };

  return jsonRequest(W_CGI, payload);
}
