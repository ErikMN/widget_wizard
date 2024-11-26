/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Widget } from '../../widgetInterfaces';
import { useGlobalContext } from '../GlobalContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
import WidgetGeneralParams from './WidgetGeneralParams';
import WidgetParams from './WidgetParams';
import ReactJson from 'react-json-view';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageIcon from '@mui/icons-material/Image';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';

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
  const {
    appSettings,
    removeWidget,
    updateWidget,
    addCustomWidget,
    openDropdownIndex,
    activeDraggableWidget
  } = useGlobalContext();

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
  /* JSON viewer handlers */
  const [useJsonViewer, setUseJsonViewer] = useState(false);

  /* Toggle how to display JSON in JSON viewer */
  const toggleJsonViewer = useCallback(() => {
    setUseJsonViewer((prev) => !prev);
  }, []);

  /* Toggle JSON viewer */
  const toggleJsonVisibility = useCallback(() => {
    setJsonVisible((prev) => !prev);
  }, []);

  /* Handle edited JSON in the viewer */
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

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 1.4 }}>
      <Button
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(index)}
        sx={{
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
          borderBottomLeftRadius: openDropdownIndex === index ? '0px' : '8px',
          borderBottomRightRadius: openDropdownIndex === index ? '0px' : '8px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        }}
        startIcon={<WidgetsIcon color="primary" />}
        endIcon={
          openDropdownIndex === index ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
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
      </Button>

      {/* Dropdown for current widget settings */}
      <Collapse in={openDropdownIndex === index}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: 2,
            border: `1px solid ${theme.palette.grey[600]}`,
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
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
          <Button
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
          </Button>
          <Collapse in={widgetParamsVisible}>
            <WidgetParams widget={widget} />
          </Collapse>
          {/* Widget Params End */}

          {/* Toggle JSON viewer button */}
          <Button
            variant={jsonVisible ? 'contained' : 'outlined'}
            fullWidth
            onClick={toggleJsonVisibility}
            startIcon={<DataObjectIcon />}
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
              marginTop: 2,
              marginBottom: 1,
              height: '32px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            {jsonVisible ? 'Hide JSON viewer' : 'Show JSON viewer'}
          </Button>

          {/* JSON viewer */}
          <Collapse in={jsonVisible}>
            {/* Editable JSON field */}
            {!useJsonViewer ? (
              <TextField
                label="JSON"
                error={jsonError !== null}
                multiline
                minRows={8}
                value={jsonInput}
                onChange={handleJsonChange}
                fullWidth
                variant="outlined"
                sx={{
                  marginTop: 1,
                  '& textarea': {
                    resize: 'none',
                    fontFamily: 'Monospace',
                    fontSize: '15px'
                  }
                }}
              />
            ) : (
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
                theme="monokai"
              />
            )}
            {/* Display error if invalid JSON */}
            {jsonError && (
              <Typography color="error" variant="body2" sx={{ marginTop: 1 }}>
                {jsonError}
              </Typography>
            )}
            <Button
              onClick={handleUpdateJSON}
              variant="outlined"
              startIcon={<DataObjectIcon />}
              sx={{ marginTop: 1, marginRight: 1 }}
            >
              Update {capitalizeFirstLetter(widget.generalParams.type)}
            </Button>
            {appSettings.debug && (
              <Button
                onClick={toggleJsonViewer}
                variant="contained"
                startIcon={<ImageIcon />}
                sx={{ marginTop: 1 }}
              >
                {useJsonViewer ? 'Text Editor' : 'JSON Viewer'}
              </Button>
            )}
          </Collapse>
          {/* JSON viewer end */}

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
            <Button
              color="error"
              variant="contained"
              onClick={() => removeWidget(widget.generalParams.id)}
              startIcon={<DeleteIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Remove
            </Button>
            {/* Duplicate widget button */}
            <Button
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
            </Button>
          </Box>
          {/* Remove and Duplicate buttons end */}
        </Box>
      </Collapse>
      {/* Dropdown for current widget settings end */}
    </Box>
  );
};

export default WidgetItem;
