/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle
} from 'react';
import { Widget } from './widgetInterfaces';
import { useWidgetActions } from './WidgetContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { CustomButton } from './../CustomComponents';
import JsonEditor, { safeParseJson } from '../JsonEditor';
import WidgetGeneralParams, {
  WidgetGeneralParamsHandle
} from './WidgetGeneralParams';
import WidgetSpecificParams, {
  WidgetSpecificParamsHandle
} from './WidgetSpecificParams';
import { saveWidgetBackup } from './widgetBackupStorage';
import { useAlertActionsContext } from '../context/AppContext';
/* MUI */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';

import '../../assets/css/prism-theme.css';

interface WidgetItemProps {
  widget: Widget;
  toggleDropdown: (widget: Widget, isOpen: boolean) => void;
  onBackupRequested: () => void;
  onRemoveRequested: (id: number) => void;
  backupLimitReached: boolean;
  isOpen: boolean;
  isActive: boolean;
}

export interface WidgetItemHandle {
  cancelPendingChanges: () => void;
}

const WidgetItem = forwardRef<WidgetItemHandle, WidgetItemProps>(
  (
    {
      widget,
      toggleDropdown,
      onBackupRequested,
      onRemoveRequested,
      backupLimitReached,
      isOpen,
      isActive
    },
    ref
  ) => {
    /* Local state */
    const [widgetParamsVisible, setWidgetParamsVisible] =
      useState<boolean>(false);
    const [jsonInput, setJsonInput] = useState<string>('');
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
    const { updateWidget, addCustomWidget } = useWidgetActions();

    const { handleOpenAlert } = useAlertActionsContext();

    const generalParamsRef = useRef<WidgetGeneralParamsHandle>(null);
    const specificParamsRef = useRef<WidgetSpecificParamsHandle>(null);
    const lastSyncedWidgetRef = useRef<Widget | null>(null);
    const wasOpenRef = useRef(isOpen);
    const wasWidgetParamsVisibleRef = useRef(widgetParamsVisible);

    useEffect(() => {
      if (wasOpenRef.current && !isOpen) {
        generalParamsRef.current?.flushPendingChanges();
        specificParamsRef.current?.flushPendingChanges();
      }
      wasOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
      if (wasWidgetParamsVisibleRef.current && !widgetParamsVisible) {
        specificParamsRef.current?.flushPendingChanges();
      }
      wasWidgetParamsVisibleRef.current = widgetParamsVisible;
    }, [widgetParamsVisible]);

    useImperativeHandle(
      ref,
      () => ({
        cancelPendingChanges: () => {
          generalParamsRef.current?.cancelPendingChanges();
          specificParamsRef.current?.cancelPendingChanges();
        }
      }),
      []
    );

    /* Preserve an unsaved JSON draft when reopening the same widget. */
    useEffect(() => {
      if (!isOpen) {
        return;
      }
      if (lastSyncedWidgetRef.current === widget) {
        return;
      }
      lastSyncedWidgetRef.current = widget;

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
    }, [isOpen, widget]);

    /****************************************************************************/

    /* Toggle Widget Params */
    const toggleWidgetParams = useCallback(() => {
      setWidgetParamsVisible((prev) => !prev);
    }, []);

    /****************************************************************************/

    const handleUpdateJSON = () => {
      try {
        const parsed = safeParseJson(jsonInput);
        if (parsed == null) {
          setJsonError('Invalid JSON format');
          return;
        }
        /* Re-attach the widget ID */
        if (widgetState.widgetId == null) {
          setJsonError('Missing widget ID');
          return;
        }
        const parsedWidget = {
          ...parsed,
          generalParams: {
            ...parsed.generalParams,
            id: widgetState.widgetId
          }
        };
        generalParamsRef.current?.cancelPendingChanges();
        specificParamsRef.current?.cancelPendingChanges();
        updateWidget(widgetState.widgetId, () => parsedWidget);
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

    return (
      <Box key={widget.generalParams.id} sx={{ marginBottom: 1.4 }}>
        <CustomButton
          variant="outlined"
          fullWidth
          onClick={() => toggleDropdown(widget, isOpen)}
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 1,
            color: 'text.primary',
            /* Highlight selected widget */
            backgroundColor: isActive || isOpen ? 'primary.light' : 'unset',
            borderColor: isActive || isOpen ? 'primary.main' : 'grey.600',
            borderBottomLeftRadius: isOpen ? '0px' : '4px',
            borderBottomRightRadius: isOpen ? '0px' : '4px',
            transition: 'background-color 0.3s ease, border-color 0.3s ease',
            /* Text shadow */
            ...(theme.palette.mode === 'dark'
              ? { textShadow: '0px 1px 4px rgba(0, 0, 0, 0.8)' }
              : { textShadow: '0px 1px 2px rgba(255, 255, 255, 0.8)' })
          })}
          startIcon={<WidgetsIcon color="primary" />}
          endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
              {capitalizeFirstLetter(widget.generalParams.type)} ({widget.width}
              x{widget.height})
            </Typography>
            <Chip
              label={`ID: ${widget.generalParams.id}`}
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          </div>
        </CustomButton>

        {/* Dropdown for current widget settings */}
        <Collapse in={isOpen} unmountOnExit>
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
              ref={generalParamsRef}
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
            <Collapse in={widgetParamsVisible} unmountOnExit>
              <WidgetSpecificParams ref={specificParamsRef} widget={widget} />
            </Collapse>
            {/* Widget Params End */}

            {/* JSON editor */}
            <JsonEditor
              jsonInput={jsonInput}
              setJsonInput={setJsonInput}
              jsonError={jsonError}
              setJsonError={setJsonError}
              onUpdate={handleUpdateJSON}
              updateLabel={`Update ${capitalizeFirstLetter(widget.generalParams.type)}`}
            />

            {/* Remove, Backup and Duplicate buttons*/}
            <Box
              sx={{
                marginTop: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1.5
              }}
            >
              {/* Remove widget button */}
              <CustomButton
                color="error"
                variant="contained"
                onClick={() => onRemoveRequested(widget.generalParams.id)}
                startIcon={<DeleteIcon />}
                sx={{
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}
              >
                Remove
              </CustomButton>
              {/* Backup widget button */}
              <CustomButton
                color="secondary"
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={backupLimitReached}
                onClick={() => {
                  if (backupLimitReached) {
                    return;
                  }
                  saveWidgetBackup(widget);
                  onBackupRequested();
                  handleOpenAlert('Widget backup created', 'success');
                }}
                sx={{
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}
              >
                Backup
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
  }
);

WidgetItem.displayName = 'WidgetItem';

export default React.memo(WidgetItem);
