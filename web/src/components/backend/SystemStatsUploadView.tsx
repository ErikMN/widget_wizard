/* SystemStatsUploadView
 *
 * Uploads one local file through the backend HTTP upload endpoint.
 * The backend accepts one multipart field named "file" and stores the uploaded
 * file in its configured directory.
 *
 * Files can be selected with the hidden file input or dropped onto the upload area.
 * Selecting or dropping a file starts the upload immediately.
 */
import React, { useCallback, useRef, useState } from 'react';
import { CustomButton } from '../CustomComponents';
import { getBackendUploadUrl } from './getBackendUploadUrl';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';

/* NOTE: Keep this aligned with the backend upload limit. */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

type UploadMessage = {
  severity: 'success' | 'error' | 'info';
  text: string;
};

/* Show file sizes in a compact form for status text. */
const formatUploadSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface SystemStatsUploadViewProps {
  readonly disabled?: boolean;
}

export const SystemStatsUploadView: React.FC<SystemStatsUploadViewProps> = ({
  disabled = false
}) => {
  /* Local state */
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<UploadMessage | null>(null);

  /* Refs */
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* Send one file using the backend multipart contract. */
  const uploadFile = useCallback(
    async (file: File) => {
      if (disabled || uploading) {
        return;
      }

      /* Reject known oversized files before sending them over the network. */
      if (file.size > UPLOAD_MAX_BYTES) {
        setMessage({
          severity: 'error',
          text: `File is too large. Limit is ${formatUploadSize(UPLOAD_MAX_BYTES)}.`
        });
        return;
      }

      setUploading(true);
      setMessage({
        severity: 'info',
        text: `Uploading ${file.name}...`
      });

      try {
        /* The backend expects the file field to be named "file". */
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch(getBackendUploadUrl(), {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setMessage({
          severity: 'success',
          text: `Uploaded ${file.name} (${formatUploadSize(file.size)}).`
        });
      } catch (error) {
        const errorText =
          error instanceof Error ? error.message : 'Unknown upload error';
        setMessage({
          severity: 'error',
          text: `Failed to upload ${file.name}: ${errorText}`
        });
      } finally {
        setUploading(false);
      }
    },
    [disabled, uploading]
  );

  /* Open the hidden file input from the visible upload controls. */
  const selectFile = () => {
    if (disabled || uploading) {
      return;
    }

    inputRef.current?.click();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    /* Allow selecting the same file again after a failed upload. */
    event.target.value = '';

    if (file) {
      void uploadFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    /* The drop zone is a control, so it must not drag the overlay. */
    event.preventDefault();
    event.stopPropagation();

    if (!disabled && !uploading) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    /* Keep drag state local to the drop zone. */
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    /* Drop starts the upload directly, just like selecting a file. */
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (disabled || uploading) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      setMessage({
        severity: 'error',
        text: 'Select one file to upload.'
      });
      return;
    }

    void uploadFile(files[0]);
  };

  return (
    <Stack
      className="system-stats-scroll-area"
      spacing={1}
      sx={{ height: '100%', minHeight: 0, overflow: 'auto' }}
    >
      {/* Native file input kept hidden so the visible UI can match the panel. */}
      <input
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />

      {/* Drop zone and click target for selecting one local file. */}
      <Box
        className="system-stats-upload-drop-zone"
        onClick={selectFile}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          flex: '1 1 auto',
          minHeight: 120,
          border: '1px dashed rgba(255,255,255,0.35)',
          borderColor: dragActive
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.35)',
          borderRadius: '4px',
          backgroundColor: dragActive
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          cursor: disabled || uploading ? 'default' : 'pointer',
          p: 2
        }}
      >
        <Stack spacing={1} sx={{ alignItems: 'center' }}>
          <UploadFileOutlinedIcon fontSize="large" />
          <Typography variant="body2">
            Drop one file here or select a file.
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            Maximum size: {formatUploadSize(UPLOAD_MAX_BYTES)}
          </Typography>
          <CustomButton
            size="small"
            variant="outlined"
            onClick={(event) => {
              event.stopPropagation();
              selectFile();
            }}
            disabled={disabled || uploading}
            sx={{ color: '#fff' }}
          >
            {uploading ? 'Uploading...' : 'Select file'}
          </CustomButton>
        </Stack>
      </Box>

      {message && (
        <Alert
          severity={message.severity}
          variant="outlined"
          sx={{
            py: 0.25,
            px: 1,
            color: '#fff',
            overflowWrap: 'anywhere'
          }}
        >
          {message.text}
        </Alert>
      )}
    </Stack>
  );
};
