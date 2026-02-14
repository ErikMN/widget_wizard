/* Generic JSON Editor component
 * https://github.com/uiwjs/react-textarea-code-editor
 * https://github.com/timlrx/rehype-prism-plus
 * https://github.com/PrismJS/prism-themes
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { CustomButton, CustomSwitch } from './CustomComponents';
import CodeEditor from '@uiw/react-textarea-code-editor';
import rehypePrism from 'rehype-prism-plus';
import ReactJson from 'react-json-view';
/* MUI */
import { useTheme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface JsonEditorProps {
  jsonInput: string;
  setJsonInput: (value: string) => void;
  jsonError: string | null;
  setJsonError: (value: string | null) => void;
  onUpdate: () => void;
  onParseJson?: (parsed: any | null) => void;
  updateLabel?: string;
}

/* Safe JSON parser */
export const safeParseJson = (json: string) => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const JsonEditor: React.FC<JsonEditorProps> = ({
  jsonInput,
  setJsonInput,
  jsonError,
  setJsonError,
  onUpdate,
  onParseJson,
  updateLabel
}) => {
  /* Theme */
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  /* Global context */
  const { jsonTheme, appSettings } = useAppContext();

  /* Local state */
  const [jsonVisible, setJsonVisible] = useState<boolean>(false);
  const [useJsonEditorPro, setUseJsonEditorPro] = useState(false);

  /* Style variables */
  const codeStyles: Record<string, string> = useMemo(
    () => ({
      '--json-key': isDarkMode ? '#ffcb6b' : '#d35400',
      '--json-string': isDarkMode ? '#c3e88d' : '#388e3c',
      '--json-number': isDarkMode ? '#f78c6c' : '#d80080',
      '--json-boolean': isDarkMode ? '#82aaff' : '#1565c0',
      '--json-null': isDarkMode ? '#ff5370' : '#c62828',
      '--json-punctuation': isDarkMode ? '#89ddff' : '#546e7a',
      '--json-operator': isDarkMode ? '#ff9cac' : '#ff6f61',
      '--background': theme.palette.background.paper,
      '--text-color': theme.palette.text.primary,
      '--border-color': jsonError ? '#d32f2f' : theme.palette.divider
    }),
    [isDarkMode, theme, jsonError]
  );

  const toggleJsonVisibility = useCallback(() => {
    setJsonVisible((prev) => !prev);
  }, []);

  const toggleJsonEditor = useCallback(() => {
    setUseJsonEditorPro((prev) => !prev);
  }, []);

  const handleJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    setJsonInput(text);
    setJsonError(null);
    if (onParseJson) {
      onParseJson(safeParseJson(text));
    }
  };

  return (
    <>
      <CustomButton
        variant={jsonVisible ? 'contained' : 'outlined'}
        fullWidth
        onClick={toggleJsonVisibility}
        startIcon={<DataObjectIcon />}
        endIcon={jsonVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={(theme) => ({
          position: 'relative',
          color: 'text.secondary',
          backgroundColor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 1,
          marginTop: 2,
          marginBottom: 1,
          height: '32px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          '& .MuiButton-startIcon': {
            position: 'absolute',
            left: theme.spacing(0.5),
            margin: 0
          },
          '& .MuiButton-endIcon': {
            position: 'absolute',
            right: theme.spacing(0.5),
            margin: 0
          }
        })}
      >
        {jsonVisible ? 'Hide JSON editor' : 'Show JSON editor'}
      </CustomButton>

      <Collapse in={jsonVisible}>
        <div>
          {!useJsonEditorPro ? (
            <div style={codeStyles}>
              <CodeEditor
                value={jsonInput}
                onChange={handleJsonChange}
                language="json"
                data-color-mode={isDarkMode ? 'dark' : 'light'}
                className="custom-json-theme"
                style={{
                  color: theme.palette.text.primary,
                  backgroundColor: isDarkMode
                    ? theme.palette.background.paper
                    : '#ffffe6',
                  marginTop: 8,
                  width: '100%',
                  fontSize: 14,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
                  borderRadius: 8,
                  border: jsonError
                    ? '1px solid red'
                    : `1px solid ${theme.palette.background.paper}`
                }}
                rehypePlugins={[[rehypePrism, { ignoreMissing: true }]]}
                placeholder="JSON"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          ) : (
            <ReactJson
              src={safeParseJson(jsonInput)}
              onEdit={(edit) => {
                const updated = JSON.stringify(edit.updated_src, null, 2);
                setJsonInput(updated);
                if (onParseJson) {
                  onParseJson(edit.updated_src);
                }
              }}
              onAdd={(add) => {
                const updated = JSON.stringify(add.updated_src, null, 2);
                setJsonInput(updated);
                if (onParseJson) {
                  onParseJson(add.updated_src);
                }
              }}
              onDelete={(del) => {
                const updated = JSON.stringify(del.updated_src, null, 2);
                setJsonInput(updated);
                if (onParseJson) {
                  onParseJson(del.updated_src);
                }
              }}
              enableClipboard={false}
              displayDataTypes={false}
              theme={jsonTheme as any}
            />
          )}

          {jsonError && (
            <Alert severity="error" sx={{ marginTop: 1 }}>
              {jsonError}
            </Alert>
          )}
          {appSettings.debug && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8
              }}
            >
              <span style={{ color: theme.palette.text.primary }}>
                JSON editor PRO
              </span>
              <CustomSwitch
                checked={useJsonEditorPro}
                onChange={toggleJsonEditor}
              />
            </div>
          )}
          <CustomButton
            onClick={onUpdate}
            variant="outlined"
            startIcon={<DataObjectIcon />}
            sx={{ marginTop: 1, marginRight: 1, width: '100%' }}
          >
            {updateLabel ? updateLabel : 'Update'}
          </CustomButton>
        </div>
      </Collapse>
    </>
  );
};

export default JsonEditor;
