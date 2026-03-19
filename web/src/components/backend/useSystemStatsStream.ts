/* System stats stream
 * Reusable hook for the backend system monitor websocket state.
 *
 * Handles:
 * - Live system stats snapshots
 * - Process monitor snapshots and errors
 * - One-shot process list, storage, and system info responses
 * - Request helpers for the system monitor backend
 */
import { useRef, useState } from 'react';
import { useReconnectableWebSocket } from './useReconnectableWebSocket';
import {
  HistoryPoint,
  ProcHistoryPoint,
  ProcStats,
  StorageInfo,
  SystemInfo,
  SysStats
} from './systemStatsTypes';

const MAX_HISTORY_POINTS = 60;

interface UseSystemStatsStreamOptions {
  url: string;
}

interface UseSystemStatsStreamResult {
  connected: boolean;
  error: string | null;
  stats: SysStats | null;
  history: HistoryPoint[];
  procName: string;
  setProcName: React.Dispatch<React.SetStateAction<string>>;
  procHistory: ProcHistoryPoint[];
  procError: string | null;
  procStats: ProcStats | null;
  processList: string[];
  storageInfo: StorageInfo[];
  systemInfo: SystemInfo | null;
  sendMonitorRequest: () => void;
  requestProcessList: () => void;
  requestStorageInfo: () => void;
  requestSystemInfo: () => void;
  clearMonitorInput: () => void;
}

export const useSystemStatsStream = ({
  url
}: UseSystemStatsStreamOptions): UseSystemStatsStreamResult => {
  /* Local state */
  const [stats, setStats] = useState<SysStats | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [procName, setProcName] = useState<string>('');
  const [procHistory, setProcHistory] = useState<ProcHistoryPoint[]>([]);
  const [procError, setProcError] = useState<string | null>(null);
  const [procStats, setProcStats] = useState<ProcStats | null>(null);
  const [processList, setProcessList] = useState<string[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  /* Refs */
  const procNameRef = useRef<string>(procName);
  procNameRef.current = procName;

  const { sendJson } = useReconnectableWebSocket({
    url,
    onOpen: () => {
      setConnected(true);
      setError(null);
    },
    onMessage: (event) => {
      /* Server sends JSON snapshots */
      try {
        const data = JSON.parse(event.data);
        // console.log('has proc:', !!data.proc);

        /* One-shot process list */
        if (Array.isArray(data.processes)) {
          setProcessList(data.processes);
          return;
        }

        /* One-shot storage list */
        if (Array.isArray(data.storage)) {
          setStorageInfo(data.storage);
          return;
        }

        /* One-shot system info */
        if (data.system && typeof data.system === 'object') {
          setSystemInfo(data.system);
          return;
        }

        setStats(data);

        /* Set local proc stats state */
        if (data.proc) {
          setProcStats(data.proc);
        }

        const memUsedKb = data.mem_total_kb - data.mem_available_kb;
        const memPercent = (memUsedKb / data.mem_total_kb) * 100;
        setHistory((prev) => {
          const next = [
            ...prev,
            {
              ts: data.ts,
              cpu: data.cpu,
              mem: memPercent,
              cpuPerCore: Array.isArray(data.cpu_per_core)
                ? [...data.cpu_per_core]
                : []
            }
          ];
          return next.length > MAX_HISTORY_POINTS
            ? next.slice(-MAX_HISTORY_POINTS)
            : next;
        });

        /* Optional per process stats */
        if (data.error && data.error.type === 'process_not_found') {
          setProcError(data.error.message);

          /* Only clear process state if we are actually monitoring something */
          if (procNameRef.current.trim() !== '') {
            setProcStats(null);
          }
        } else if (data.proc) {
          setProcError(null);
          setProcHistory((prev) => {
            /* If the monitored process PID changed (process restarted or replaced),
             * reset the history to avoid mixing different processes into one graph.
             *
             * We must compare against the last recorded PID, not React state,
             * because setStats() is async and stats.proc may be stale here.
             */
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (
                (last as any).pid !== undefined &&
                (last as any).pid !== data.proc.pid
              ) {
                return [
                  {
                    ts: data.ts,
                    cpu: data.proc.cpu,
                    rss: data.proc.rss_kb / 1024,
                    pss: data.proc.pss_kb / 1024,
                    uss: data.proc.uss_kb / 1024,
                    pid: data.proc.pid
                  }
                ];
              }
            }

            const next = [
              ...prev,
              {
                ts: data.ts,
                cpu: data.proc.cpu,
                rss: data.proc.rss_kb / 1024,
                pss: data.proc.pss_kb / 1024,
                uss: data.proc.uss_kb / 1024,
                pid: data.proc.pid
              }
            ];
            return next.length > MAX_HISTORY_POINTS
              ? next.slice(-MAX_HISTORY_POINTS)
              : next;
          });
        }
      } catch {
        /* Ignore invalid JSON frames */
      }
    },
    onError: () => {
      setError('System monitor disconnected');
      setConnected(false);
    },
    onClose: () => {
      setConnected(false);
    }
  });

  /* Send a per-process monitor request */
  const sendMonitorRequest = () => {
    if (!sendJson({ monitor: procName.trim() })) {
      return;
    }

    setProcError(null);
    setProcHistory([]);
  };

  /* Request a one-shot process list */
  const requestProcessList = () => {
    sendJson({ list_processes: true });
  };

  /* Request one-shot storage information */
  const requestStorageInfo = () => {
    sendJson({ storage: true });
  };

  /* Request one-shot system information */
  const requestSystemInfo = () => {
    sendJson({ system_info: true });
  };

  const clearMonitorInput = () => {
    /* Clear UI state */
    setProcName('');
    setProcError(null);
    setProcHistory([]);
    setError(null);

    /* Tell backend to stop monitoring */
    sendJson({ monitor: '' });
  };

  return {
    connected,
    error,
    stats,
    history,
    procName,
    setProcName,
    procHistory,
    procError,
    procStats,
    processList,
    storageInfo,
    systemInfo,
    sendMonitorRequest,
    requestProcessList,
    requestStorageInfo,
    requestSystemInfo,
    clearMonitorInput
  };
};
