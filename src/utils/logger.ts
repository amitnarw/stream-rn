import { DeviceEventEmitter } from 'react-native';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  tag: string;
  message: string;
}

const MAX_LOGS = 500;
let logsStore: LogEntry[] = [];
let listeners: Set<(logs: LogEntry[]) => void> = new Set();
let isInitialized = false;

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

export function addLog(level: 'info' | 'warn' | 'error', tag: string, message: string) {
  const entry: LogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: formatTimestamp(),
    level,
    tag: tag || 'App',
    message: typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message),
  };

  logsStore = [entry, ...logsStore].slice(0, MAX_LOGS);
  notifyListeners();
}

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn([...logsStore]);
    } catch (_) {}
  });
}

export function subscribeLogs(fn: (logs: LogEntry[]) => void): () => void {
  listeners.add(fn);
  fn([...logsStore]);
  return () => {
    listeners.delete(fn);
  };
}

export function getLogs(): LogEntry[] {
  return [...logsStore];
}

export function clearLogs(): void {
  logsStore = [];
  notifyListeners();
}

export function exportLogsAsString(): string {
  return logsStore
    .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.tag}] ${l.message}`)
    .join('\n');
}

export function initLogger(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Intercept console calls to record logs automatically
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: any[]) => {
    origLog.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    let tag = 'Console';
    if (msg.includes('[ZunoPlugin]')) tag = 'ZunoPlugin';
    else if (msg.includes('[ADDON')) tag = 'Addon';
    addLog('info', tag, msg);
  };

  console.warn = (...args: any[]) => {
    origWarn.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    let tag = 'Warning';
    if (msg.includes('[ZunoPlugin]')) tag = 'ZunoPlugin';
    addLog('warn', tag, msg);
  };

  console.error = (...args: any[]) => {
    origError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    let tag = 'Error';
    if (msg.includes('[ZunoPlugin]')) tag = 'ZunoPlugin';
    addLog('error', tag, msg);
  };

  // Listen for native logs emitted from Kotlin via RCTDeviceEventEmitter
  DeviceEventEmitter.addListener('onNativeLog', (event: any) => {
    if (event && event.message) {
      const level = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'info';
      addLog(level, event.tag || 'Native', event.message);
    }
  });

  addLog('info', 'Logger', 'Developer Logger initialized.');
}
