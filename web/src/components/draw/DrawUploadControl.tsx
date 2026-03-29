/* DrawUploadControl
 *
 * Upload the current draw-mode PNG export to the backend.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CustomButton } from '../CustomComponents';
import {
  useAlertActionsContext,
  useAppSettingsContext
} from '../context/AppContext';
import { getBackendWebSocketUrl } from '../backend/getBackendWebSocketUrl';
import { useReconnectableWebSocket } from '../backend/useReconnectableWebSocket';
import { useDrawContext } from './DrawContext';
/* MUI */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import Typography from '@mui/material/Typography';

const DRAW_UPLOAD_FILENAME = 'widget_wizard_draw.png';
const MAX_DRAW_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const UPLOAD_RESPONSE_TIMEOUT_MS = 15000;

type DrawUploadState = 'idle' | 'preparing' | 'connecting' | 'uploading';

interface DrawUploadRequest {
  upload: {
    filename: string;
    content_b64: string;
  };
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode drawing as base64'));
        return;
      }

      /* readAsDataURL() prefixes the base64 data with a MIME header */
      const commaIndex = reader.result.indexOf(',');
      if (commaIndex < 0) {
        reject(new Error('Failed to encode drawing as base64'));
        return;
      }

      resolve(reader.result.slice(commaIndex + 1));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to encode drawing as base64'));
    };

    reader.readAsDataURL(blob);
  });
};

const DrawUploadControl: React.FC = () => {
  /* Global context */
  const { appSettings } = useAppSettingsContext();
  const { handleOpenAlert } = useAlertActionsContext();

  /* Shared draw state */
  const { createDrawingPngExport, hasDrawing, surfaceDimensions } =
    useDrawContext();

  /* Local state */
  const [uploadState, setUploadState] = useState<DrawUploadState>('idle');
  const [pendingUploadRequest, setPendingUploadRequest] =
    useState<DrawUploadRequest | null>(null);

  /* Refs */
  const uploadPendingRef = useRef(false);
  const uploadRequestSentRef = useRef(false);
  const uploadTimeoutRef = useRef<number | null>(null);

  const WS_ADDRESS = getBackendWebSocketUrl(appSettings);

  const finishUpload = useCallback(
    (
      message: string | null,
      severity: 'success' | 'warning' | 'error' = 'success'
    ) => {
      /* Cancel any pending timeout once the upload flow resolves */
      if (uploadTimeoutRef.current !== null) {
        window.clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      setPendingUploadRequest(null);
      uploadRequestSentRef.current = false;
      uploadPendingRef.current = false;
      setUploadState('idle');

      if (message) {
        handleOpenAlert(message, severity);
      }
    },
    [handleOpenAlert]
  );

  /* Ensure timers and transient upload state do not survive unmounts or route changes */
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current !== null) {
        window.clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      uploadRequestSentRef.current = false;
      uploadPendingRef.current = false;
    };
  }, []);

  const handleSocketFailure = useCallback(() => {
    /* Only surface connection loss when an upload was actually in progress */
    if (!uploadPendingRef.current) {
      return;
    }

    finishUpload('Upload connection to the backend was lost', 'error');
  }, [finishUpload]);

  const handleSocketMessage = useCallback(
    (event: MessageEvent) => {
      if (!uploadPendingRef.current || typeof event.data !== 'string') {
        return;
      }

      try {
        const data = JSON.parse(event.data);

        /* Success response from the backend upload command */
        if (data?.upload && typeof data.upload === 'object') {
          const uploadedPath =
            typeof data.upload.path === 'string'
              ? data.upload.path
              : `/tmp/${DRAW_UPLOAD_FILENAME}`;

          finishUpload(`Drawing uploaded to ${uploadedPath}`, 'success');
          return;
        }

        /* Upload and control-path failures are returned using the common error envelope */
        if (data?.error && typeof data.error === 'object') {
          const message =
            typeof data.error.message === 'string'
              ? data.error.message
              : 'Failed to upload drawing to the device';

          finishUpload(message, 'error');
        }
      } catch {
        /* Ignore unrelated frames and malformed payloads */
      }
    },
    [finishUpload]
  );

  const { connected, sendJson } = useReconnectableWebSocket({
    url: WS_ADDRESS,
    enabled: uploadState === 'connecting' || uploadState === 'uploading',
    onMessage: handleSocketMessage,
    onError: handleSocketFailure,
    onClose: handleSocketFailure
  });

  /* Send the prepared upload once the socket has reached OPEN */
  useEffect(() => {
    if (
      uploadState !== 'connecting' ||
      !connected ||
      !pendingUploadRequest ||
      uploadRequestSentRef.current
    ) {
      return;
    }

    if (!sendJson(pendingUploadRequest)) {
      finishUpload('Backend websocket is not connected', 'warning');
      return;
    }

    uploadRequestSentRef.current = true;
    setUploadState('uploading');

    /* Fail fast when the backend accepts the websocket but never answers the upload command */
    uploadTimeoutRef.current = window.setTimeout(() => {
      finishUpload(
        'Upload timed out. Make sure the latest backend with upload support is running.',
        'error'
      );
    }, UPLOAD_RESPONSE_TIMEOUT_MS);
  }, [connected, finishUpload, pendingUploadRequest, sendJson, uploadState]);

  const exportDisabled =
    !hasDrawing ||
    !surfaceDimensions ||
    surfaceDimensions.videoWidth <= 0 ||
    surfaceDimensions.videoHeight <= 0;

  const handleUpload = useCallback(async () => {
    if (uploadPendingRef.current) {
      return;
    }

    uploadPendingRef.current = true;
    uploadRequestSentRef.current = false;
    setPendingUploadRequest(null);
    setUploadState('preparing');

    const pngExport = await createDrawingPngExport();
    if (!pngExport) {
      finishUpload(null, 'success');
      return;
    }

    /* Mirror the current backend-side limit so oversize uploads fail early */
    if (pngExport.blob.size > MAX_DRAW_UPLOAD_SIZE_BYTES) {
      finishUpload(
        'The PNG is larger than the 10 MiB backend upload limit',
        'warning'
      );
      return;
    }

    try {
      const content_b64 = await blobToBase64(pngExport.blob);

      /* If the component resolved the upload while we were encoding, stop here */
      if (!uploadPendingRef.current) {
        return;
      }

      setPendingUploadRequest({
        upload: {
          filename: DRAW_UPLOAD_FILENAME,
          content_b64
        }
      });
      setUploadState('connecting');
    } catch (error) {
      finishUpload(
        error instanceof Error
          ? error.message
          : 'Failed to encode drawing for upload',
        'error'
      );
    }
  }, [createDrawingPngExport, finishUpload]);

  const statusText =
    uploadState === 'preparing'
      ? 'Preparing PNG for upload...'
      : uploadState === 'connecting'
        ? 'Connecting to backend websocket...'
        : uploadState === 'uploading'
          ? 'Uploading PNG to the backend...'
          : 'The backend websocket will connect when you upload';

  const statusColor =
    uploadState === 'idle' ? 'text.secondary' : 'warning.main';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'action.hover'
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        Upload to device
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Upload the current PNG to <code>/tmp/{DRAW_UPLOAD_FILENAME}</code> on
        the target device. The same file is overwritten each time.
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: statusColor, display: 'block', mb: 1.5 }}
      >
        {statusText}
      </Typography>
      <CustomButton
        variant="contained"
        fullWidth
        startIcon={
          uploadState !== 'idle' ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <CloudUploadOutlinedIcon />
          )
        }
        onClick={handleUpload}
        disabled={uploadState !== 'idle' || exportDisabled}
      >
        {uploadState !== 'idle' ? 'Uploading...' : 'Upload to device'}
      </CustomButton>
    </Box>
  );
};

export default DrawUploadControl;
