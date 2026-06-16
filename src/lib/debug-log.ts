/** In-memory ring buffer for DebugScreen — dev builds only. Copy all → clipboard. */
export type LogLevel = 'info' | 'warn' | 'error' | 'api' | 'game' | 'webrtc' | 'sync';

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: string;
}

const MAX_ENTRIES = 400;
let nextId = 1;
const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function serialize(data: unknown): string | undefined {
  if (data === undefined) return undefined;
  try {
    return JSON.stringify(data, null, 0);
  } catch {
    return String(data);
  }
}

export function debugLog(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
): void {
  const entry: LogEntry = {
    id: nextId++,
    ts: new Date().toISOString().slice(11, 23),
    level,
    tag,
    message,
    data: serialize(data),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  if (__DEV__) {
    const line = `[${entry.level}] ${tag}: ${message}${entry.data ? ` ${entry.data}` : ''}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  notify();
}

export function getLogEntries(): LogEntry[] {
  return [...entries];
}

export function clearLogs(): void {
  entries.length = 0;
  notify();
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function formatLogsForExport(extra?: Record<string, unknown>): string {
  const header = {
    exportedAt: new Date().toISOString(),
    platform: 'ios',
    ...extra,
  };
  const lines = entries.map(
    (e) =>
      `${e.ts} [${e.level}] ${e.tag}: ${e.message}${e.data ? ` | ${e.data}` : ''}`,
  );
  return `--- WhoSmarter debug log ---\n${JSON.stringify(header, null, 2)}\n---\n${lines.join('\n')}\n`;
}
