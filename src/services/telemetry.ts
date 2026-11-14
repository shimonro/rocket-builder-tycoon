import type { EventBus, GameEvent } from '../core/events';

/**
 * Anonymous gameplay stats and crash reports, written to the Supabase `events` table (insert-only for
 * players). There is no user id: a random id per browser tab groups one session's events.
 */
export interface TelemetryOptions {
  url: string;
  key: string;
  version: string;
  enabled: () => boolean;
}

interface Row {
  session_id: string;
  name: string;
  props: Record<string, unknown>;
  app_version: string;
}

const MAX_QUEUE = 50;

export function createTelemetry(opts: TelemetryOptions) {
  const sessionId = crypto.randomUUID();
  let queue: Row[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(keepalive = false) {
    clearTimeout(timer);
    timer = undefined;
    if (queue.length === 0) return;
    const rows = queue;
    queue = [];
    void fetch(`${opts.url}/rest/v1/events`, {
      method: 'POST',
      keepalive,
      headers: { apikey: opts.key, Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    }).catch(() => undefined);
  }

  function track(name: string, props: Record<string, unknown> = {}) {
    if (!opts.enabled() || queue.length >= MAX_QUEUE) return;
    queue.push({ session_id: sessionId, name, props, app_version: opts.version });
    timer ??= setTimeout(flush, 5000);
  }

  return { track, flush };
}

export type Telemetry = ReturnType<typeof createTelemetry>;

const TRACKED: Partial<Record<GameEvent['type'], true>> = {
  purchase: true,
  sell: true,
  upgrade: true,
  unlock: true,
  launch: true,
  flightFinished: true,
};

/** Forwards notable game events plus uncaught errors. Returns a function that stops listening. */
export function connectTelemetry(telemetry: Telemetry, bus: EventBus<GameEvent>): () => void {
  const off = bus.on((event) => {
    if (!TRACKED[event.type]) return;
    const { type, ...props } = event;
    telemetry.track(type, props);
  });
  const onError = (e: ErrorEvent) => reportError(telemetry, e.error ?? e.message, 'window');
  const onRejection = (e: PromiseRejectionEvent) => reportError(telemetry, e.reason, 'promise');
  const onHide = () => telemetry.flush(true);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', onHide);
  return () => {
    off();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', onHide);
  };
}

export function reportError(telemetry: Telemetry, error: unknown, source: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  telemetry.track('error', { source, message: err.message.slice(0, 300), stack: err.stack?.slice(0, 1500), url: window.location.pathname });
  telemetry.flush(true);
}
