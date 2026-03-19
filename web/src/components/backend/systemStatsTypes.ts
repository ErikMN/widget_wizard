/* System stats types
 * Shared type definitions for the backend system monitor UI.
 */

export interface StorageInfo {
  path: string;
  fs: string;
  total_kb: number;
  used_kb: number;
  available_kb: number;
}

export interface SystemInfo {
  kernel_release: string;
  kernel_version: string;

  machine: string;
  cpu_cores: number;

  os_name?: string;
  os_version?: string;
  os_pretty_name?: string;

  hostname?: string;
}

export interface ProcHistoryPoint {
  ts: number;
  cpu: number;
  rss: number;
  pss: number;
  uss: number;
  pid: number;
}

export interface ProcStats {
  name: string;
  pid: number;
  cpu: number;
  rss_kb: number;
  pss_kb: number;
  uss_kb: number;
}

export interface SysStats {
  ts: number;
  mono_ms: number;
  delta_ms: number;
  cpu: number;
  cpu_cores: number;
  cpu_per_core?: number[];
  mem_total_kb: number;
  mem_available_kb: number;
  uptime_s: number;
  load1: number;
  load5: number;
  load15: number;
  clients: {
    connected: number;
    max: number;
  };
  proc?: ProcStats;
}

export interface HistoryPoint {
  ts: number;
  cpu: number;
  mem: number;
  cpuPerCore: number[];
}
