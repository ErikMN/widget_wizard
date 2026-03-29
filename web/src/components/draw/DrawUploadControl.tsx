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
const DRAW_UPLOAD_CHUNK_SIZE_BYTES = 32 * 1024;
const UPLOAD_RESPONSE_TIMEOUT_MS = 15000;

type DrawUploadState = 'idle' | 'preparing' | 'connecting' | 'uploading';

interface DrawUploadSession {
  blob: Blob;
  sizeBytes: number;
  nextOffset: number;
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

  /* Refs */
  const uploadPendingRef = useRef(false);
  const uploadBeginSentRef = useRef(false);
  const uploadTimeoutRef = useRef<number | null>(null);
  const uploadSessionRef = useRef<DrawUploadSession | null>(null);

  const WS_ADDRESS = getBackendWebSocketUrl(appSettings);

  const clearUploadTimeout = useCallback(() => {
    if (uploadTimeoutRef.current !== null) {
      window.clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }
  }, []);

  const restartUploadTimeout = useCallback(
    (message: string) => {
      clearUploadTimeout();
      uploadTimeoutRef.current = window.setTimeout(() => {
        uploadSessionRef.current = null;
        uploadBeginSentRef.current = false;
        uploadPendingRef.current = false;
        setUploadState('idle');
        handleOpenAlert(message, 'error');
      }, UPLOAD_RESPONSE_TIMEOUT_MS);
    },
    [clearUploadTimeout, handleOpenAlert]
  );

  const finishUpload = useCallback(
    (
      message: string | null,
      severity: 'success' | 'warning' | 'error' = 'success'
    ) => {
      clearUploadTimeout();
      uploadSessionRef.current = null;
      uploadBeginSentRef.current = false;
      uploadPendingRef.current = false;
      setUploadState('idle');

      if (message) {
        handleOpenAlert(message, severity);
      }
    },
    [clearUploadTimeout, handleOpenAlert]
  );

  /* Ensure timers and transient upload state do not survive unmounts or route changes */
  useEffect(() => {
    return () => {
      clearUploadTimeout();
      uploadSessionRef.current = null;
      uploadBeginSentRef.current = false;
      uploadPendingRef.current = false;
    };
  }, [clearUploadTimeout]);

  const { connected, sendJson } = useReconnectableWebSocket({
    url: WS_ADDRESS,
    enabled: uploadState === 'connecting' || uploadState === 'uploading',
    onError: () => {
      if (!uploadPendingRef.current) {
        return;
      }

      finishUpload('Upload connection to the backend was lost', 'error');
    },
    onClose: () => {
      if (!uploadPendingRef.current) {
        return;
      }

      finishUpload('Upload connection to the backend was lost', 'error');
    },
    onMessage: (event) => {
      if (!uploadPendingRef.current || typeof event.data !== 'string') {
        return;
      }

      try {
        const data = JSON.parse(event.data);

        if (data?.upload && typeof data.upload === 'object') {
          const uploadedPath =
            typeof data.upload.path === 'string'
              ? data.upload.path
              : `/tmp/${DRAW_UPLOAD_FILENAME}`;

          finishUpload(`Drawing uploaded to ${uploadedPath}`, 'success');
          return;
        }

        if (data?.error && typeof data.error === 'object') {
          const message =
            typeof data.error.message === 'string'
              ? data.error.message
              : 'Failed to upload drawing to the device';

          finishUpload(message, 'error');
          return;
        }

        if (data?.upload_begin && typeof data.upload_begin === 'object') {
          void sendNextUploadStep();
          return;
        }

        if (data?.upload_chunk && typeof data.upload_chunk === 'object') {
          void sendNextUploadStep();
        }
      } catch {
        /* Ignore unrelated frames and malformed payloads */
      }
    }
  });

  const sendNextUploadStep = useCallback(async () => {
    const session = uploadSessionRef.current;
    if (!session || !uploadPendingRef.current) {
      return;
    }

    if (session.nextOffset >= session.sizeBytes) {
      if (!sendJson({ upload_finish: true })) {
        finishUpload('Backend websocket is not connected', 'warning');
        return;
      }

      restartUploadTimeout('Upload timed out while finalizing on the backend');
      return;
    }

    const chunkEnd = Math.min(
      session.nextOffset + DRAW_UPLOAD_CHUNK_SIZE_BYTES,
      session.sizeBytes
    );
    const chunkBlob = session.blob.slice(session.nextOffset, chunkEnd);

    try {
      const content_b64 = await blobToBase64(chunkBlob);
      if (!uploadPendingRef.current) {
        return;
      }

      if (
        !sendJson({
          upload_chunk: {
            content_b64
          }
        })
      ) {
        finishUpload('Backend websocket is not connected', 'warning');
        return;
      }

      session.nextOffset = chunkEnd;
      restartUploadTimeout('Upload timed out while sending chunk data');
    } catch (error) {
      finishUpload(
        error instanceof Error
          ? error.message
          : 'Failed to encode drawing chunk for upload',
        'error'
      );
    }
  }, [finishUpload, restartUploadTimeout, sendJson]);

  /* Send upload_begin once the websocket connection has reached OPEN */
  useEffect(() => {
    if (
      uploadState !== 'connecting' ||
      !connected ||
      !uploadSessionRef.current ||
      uploadBeginSentRef.current
    ) {
      return;
    }

    if (
      !sendJson({
        upload_begin: {
          filename: DRAW_UPLOAD_FILENAME,
          size_bytes: uploadSessionRef.current.sizeBytes
        }
      })
    ) {
      finishUpload('Backend websocket is not connected', 'warning');
      return;
    }

    uploadBeginSentRef.current = true;
    setUploadState('uploading');
    restartUploadTimeout(
      'Upload timed out while waiting for the backend to accept the file'
    );
  }, [connected, finishUpload, restartUploadTimeout, sendJson, uploadState]);

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
    uploadBeginSentRef.current = false;
    uploadSessionRef.current = null;
    setUploadState('preparing');

    const pngExport = await createDrawingPngExport();
    if (!pngExport) {
      finishUpload(null, 'success');
      return;
    }

    if (pngExport.blob.size > MAX_DRAW_UPLOAD_SIZE_BYTES) {
      finishUpload(
        'The PNG is larger than the 10 MiB backend upload limit',
        'warning'
      );
      return;
    }

    uploadSessionRef.current = {
      blob: pngExport.blob,
      sizeBytes: pngExport.blob.size,
      nextOffset: 0
    };
    setUploadState('connecting');
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
