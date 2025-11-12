/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import CodeEditor from '@uiw/react-textarea-code-editor';
import rehypePrism from 'rehype-prism-plus';
import { Widget } from './widgetInterfaces';
import { useAppContext } from '../AppContext';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter, playSound } from '../../helpers/utils';
import { CustomButton } from './../CustomComponents';
import WidgetGeneralParams from './WidgetGeneralParams';
import WidgetSpecificParams from './WidgetSpecificParams';
import ReactJson from 'react-json-view';
import messageSoundUrl from '../../assets/audio/message.oga';
/* MUI */
import { useTheme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageIcon from '@mui/icons-material/Image';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WidgetsIcon from '@mui/icons-material/Widgets';

import '../../assets/css/prism-theme.css';

interface WidgetItemProps {
  widget: Widget;
  index: number;
  toggleDropdown: (index: number) => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  index,
  toggleDropdown
}) => {
  /* Local state */
  const [widgetParamsVisible, setWidgetParamsVisible] =
    useState<boolean>(false);
  const [jsonVisible, setJsonVisible] = useState<boolean>(false);
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(widget, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  /* Combined widget general param state */
  const [widgetState, setWidgetState] = useState({
    isVisible: widget.generalParams.isVisible,
    widgetId: null as number | null,
    sliderValue: widget.generalParams.transparency,
    datasource: widget.generalParams.datasource,
    channel: widget.generalParams.channel,
    updateTime: widget.generalParams.updateTime
  });

  /* Global context */
  const { jsonTheme, appSettings } = useAppContext();
  const {
    removeWidget,
    updateWidget,
    addCustomWidget,
    openDropdownIndex,
    activeDraggableWidget
  } = useWidgetContext();

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  /* Prism JSON syntax highligh theme https://github.com/PrismJS/prism-themes */
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

  /* Safe JSON parser */
  const safeParseJson = (json: string) => {
    try {
      return JSON.parse(json);
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  /* Update jsonInput whenever widget prop changes */
  useEffect(() => {
    /* Store the widget's id */
    if (widget.generalParams && widget.generalParams.id) {
      setWidgetState((prevState) => ({
        ...prevState,
        widgetId: widget.generalParams.id
      }));
    }
    /* Deep widget copy */
    const widgetCopy = safeParseJson(JSON.stringify(widget));
    if (widgetCopy == null) {
      return;
    }
    /* Remove ID in order to not edit other widgets */
    if (widgetCopy.generalParams && widgetCopy.generalParams.id) {
      delete widgetCopy.generalParams.id;
    }
    setJsonInput(JSON.stringify(widgetCopy, null, 2));
    setJsonError(null);
  }, [widget]);

  /****************************************************************************/

  /* Toggle Widget Params */
  const toggleWidgetParams = useCallback(() => {
    setWidgetParamsVisible((prev) => !prev);
  }, []);

  /****************************************************************************/
  /* JSON editor handlers */
  const [useJsonEditorPro, setUseJsonEditorPro] = useState(false);

  /* Toggle how to display JSON in JSON editor */
  const toggleJsonEditor = useCallback(() => {
    setUseJsonEditorPro((prev) => !prev);
  }, []);

  /* Toggle JSON editor */
  const toggleJsonVisibility = useCallback(() => {
    setJsonVisible((prev) => !prev);
  }, []);

  /* Handle edited JSON in the editor */
  const handleJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const handleUpdateJSON = () => {
    try {
      const parsedWidget = safeParseJson(jsonInput);
      if (parsedWidget == null) {
        setJsonError('Invalid JSON format');
        return;
      }
      /* Re-attach the widget ID */
      if (widgetState.widgetId !== null) {
        parsedWidget.generalParams.id = widgetState.widgetId;
      }
      updateWidget(parsedWidget);
      setJsonError(null);
      /* NOTE: Update UI controls for manual JSON updates */
      setWidgetState((prevState) => ({
        ...prevState,
        isVisible: parsedWidget.generalParams.isVisible,
        sliderValue: parsedWidget.generalParams.transparency,
        datasource: parsedWidget.generalParams.datasource,
        channel: parsedWidget.generalParams.channel,
        updateTime: parsedWidget.generalParams.updateTime
      }));
    } catch (err) {
      console.error(err);
      setJsonError('Invalid JSON format');
    }
  };

  /****************************************************************************/
  /* Remove widget dialog handlers */
  const [openDialog, setOpenDialog] = useState<boolean>(false);

  const handleRemoveClick = () => {
    setOpenDialog(true);
    playSound(messageSoundUrl);
  };

  const handleDialogClose = () => {
    setOpenDialog(false);
  };

  const handleConfirmRemove = () => {
    removeWidget(widget.generalParams.id);
    setOpenDialog(false);
  };

  /****************************************************************************/

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 1.4 }}>
      <CustomButton
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(index)}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          /* Highlight selected widget */
          backgroundColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openDropdownIndex === index
              ? 'primary.light'
              : 'unset',
          borderColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openDropdownIndex === index
              ? 'primary.main'
              : 'grey.600',
          borderBottomLeftRadius: openDropdownIndex === index ? '0px' : '4px',
          borderBottomRightRadius: openDropdownIndex === index ? '0px' : '4px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
          /* Text shadow */
          ...(theme.palette.mode === 'dark'
            ? { textShadow: '0px 1px 4px rgba(0, 0, 0, 0.8)' }
            : { textShadow: '0px 1px 2px rgba(255, 255, 255, 0.8)' })
        })}
        startIcon={<WidgetsIcon color="primary" />}
        endIcon={
          openDropdownIndex === index ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            /* Don't break line, don't show scrollbar */
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          title={`${capitalizeFirstLetter(widget.generalParams.type)} (${widget.width}x${widget.height}) ID: ${widget.generalParams.id}`}
        >
          {/* Widget title and info */}
          <Typography
            variant="subtitle2"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            {capitalizeFirstLetter(widget.generalParams.type)} ({widget.width}x
            {widget.height})
          </Typography>
          <Chip
            label={`ID: ${widget.generalParams.id}`}
            size="small"
            sx={{ fontWeight: 'bold' }}
          />
        </div>
      </CustomButton>

      {/* Dropdown for current widget settings */}
      <Collapse in={openDropdownIndex === index}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: '10px',
            border: `1px solid ${theme.palette.grey[600]}`,
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            marginTop: 0
          })}
        >
          {/* General Params */}
          <WidgetGeneralParams
            widget={widget}
            widgetState={widgetState}
            setWidgetState={setWidgetState}
          />

          {/* Widget Params */}
          <CustomButton
            variant={widgetParamsVisible ? 'contained' : 'outlined'}
            fullWidth
            onClick={toggleWidgetParams}
            startIcon={<WidgetsIcon />}
            endIcon={
              widgetParamsVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />
            }
            sx={{
              color: 'text.secondary',
              backgroundColor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 1,
              height: '32px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            {widgetParamsVisible
              ? 'Hide widget parameters'
              : 'Show widget parameters'}
          </CustomButton>
          <Collapse in={widgetParamsVisible}>
            <WidgetSpecificParams widget={widget} />
          </Collapse>
          {/* Widget Params End */}

          {/* Toggle JSON editor button */}
          <CustomButton
            variant={jsonVisible ? 'contained' : 'outlined'}
            fullWidth
            onClick={toggleJsonVisibility}
            startIcon={<DataObjectIcon />}
            endIcon={jsonVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{
              color: 'text.secondary',
              backgroundColor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 1,
              marginTop: 2,
              marginBottom: 1,
              height: '32px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            {jsonVisible ? 'Hide JSON editor' : 'Show JSON editor'}
          </CustomButton>

          {/* JSON editor */}
          {/* https://github.com/uiwjs/react-textarea-code-editor */}
          {/* https://github.com/timlrx/rehype-prism-plus */}
          <Collapse in={jsonVisible}>
            {/* Editable JSON field */}
            {!useJsonEditorPro ? (
              <div style={codeStyles}>
                <CodeEditor
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
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
              /* JSON editor PRO */
              <ReactJson
                src={safeParseJson(jsonInput)}
                onEdit={(edit) => {
                  const updatedJson = JSON.stringify(edit.updated_src, null, 2);
                  setJsonInput(updatedJson);
                }}
                onAdd={(add) => {
                  const updatedJson = JSON.stringify(add.updated_src, null, 2);
                  setJsonInput(updatedJson);
                }}
                onDelete={(del) => {
                  const updatedJson = JSON.stringify(del.updated_src, null, 2);
                  setJsonInput(updatedJson);
                }}
                enableClipboard={false}
                displayDataTypes={false}
                theme={jsonTheme as any}
              />
            )}
            {/* Display error if invalid JSON */}
            {jsonError && (
              <Alert severity="error" sx={{ marginTop: 1 }}>
                {jsonError}
              </Alert>
            )}
            {appSettings.debug && (
              <CustomButton
                onClick={toggleJsonEditor}
                variant="contained"
                startIcon={<ImageIcon />}
                sx={{ marginTop: 1, width: '100%', height: '30px' }}
              >
                {useJsonEditorPro ? 'JSON editor' : 'JSON editor PRO'}
              </CustomButton>
            )}
            <CustomButton
              onClick={handleUpdateJSON}
              variant="outlined"
              startIcon={<DataObjectIcon />}
              sx={{
                marginTop: 1,
                marginRight: 1,
                width: '100%'
              }}
            >
              Update {capitalizeFirstLetter(widget.generalParams.type)}
            </CustomButton>
          </Collapse>
          {/* JSON viewer end */}

          {/* Remove this widget confirmation dialog */}
          <Dialog
            open={openDialog}
            onClose={(event, reason) => {
              if (reason === 'backdropClick') {
                return;
              }
              handleDialogClose();
            }}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle id="alert-dialog-title">
              <Box display="flex" alignItems="center">
                <WarningAmberIcon style={{ marginRight: '8px' }} />
                {`Remove ${capitalizeFirstLetter(widget.generalParams.type)}`}
              </Box>
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Are you sure you want to remove{' '}
                {capitalizeFirstLetter(widget.generalParams.type)}? This action
                cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <CustomButton
                variant="outlined"
                onClick={handleDialogClose}
                color="primary"
              >
                No
              </CustomButton>
              <CustomButton
                variant="contained"
                onClick={handleConfirmRemove}
                color="error"
                autoFocus
              >
                Yes
              </CustomButton>
            </DialogActions>
          </Dialog>

          {/* Remove and Duplicate buttons*/}
          <Box
            sx={{
              marginTop: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            {/* Remove widget button */}
            <CustomButton
              color="error"
              variant="contained"
              onClick={handleRemoveClick}
              startIcon={<DeleteIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Remove
            </CustomButton>
            {/* Duplicate widget button */}
            <CustomButton
              color="secondary"
              variant="contained"
              onClick={() => addCustomWidget({ ...widget })}
              startIcon={<ContentCopyIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Duplicate
            </CustomButton>
          </Box>
          {/* Remove and Duplicate buttons end */}
        </Box>
      </Collapse>
      {/* Dropdown for current widget settings end */}
    </Box>
  );
};

export default WidgetItem;
