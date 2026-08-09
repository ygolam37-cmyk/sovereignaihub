// Cooperative scheduling + thermal/battery guard.
// Everything the mesh does in the background yields to the UI thread and
// backs off the moment the device shows stress.

export type Pressure = "nominal" | "fair" | "serious" | "critical";

let pressure: Pressure = "nominal";
let observerStarted = false;

export function startPressureMonitor(): void {
  if (observerStarted || typeof window === "undefined") return;
  observerStarted = true;
  type PressureRecord = { state: Pressure };
  const Ctor = (
    window as unknown as {
      PressureObserver?: new (cb: (records: PressureRecord[]) => void) => {
        observe: (source: string, opts?: { sampleInterval?: number }) => Promise<void> | void;
      };
    }
  ).PressureObserver;
  if (!Ctor) return;
  try {
    const obs = new Ctor((records) => {
      const last = records[records.length - 1];
      if (last?.state) pressure = last.state;
    });
    void obs.observe("cpu", { sampleInterval: 2000 });
  } catch {
    /* compute pressure unsupported — battery/score guard still applies */
  }
}

export function currentPressure(): Pressure {
  return pressure;
}

/** Multiplier applied to background work: 1 = full speed, 0 = pause. */
export function throughputFactor(score: number, charging: boolean | null, battery: number | null): number {
  let f = Math.max(0.15, Math.min(1, score / 100));
  if (pressure === "fair") f *= 0.7;
  else if (pressure === "serious") f *= 0.35;
  else if (pressure === "critical") f = 0;
  if (charging === false && battery !== null) {
    if (battery < 0.15) f = 0;
    else if (battery < 0.3) f *= 0.4;
  }
  if (typeof document !== "undefined" && document.visibilityState === "hidden") f *= 0.5;
  return f;
}

/** Yield to the browser so input/paint always wins over background work. */
export function yieldToUI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const scheduler = (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) return new Promise<void>((r) => ric(() => r(), { timeout: 120 }));
  return new Promise<void>((r) => setTimeout(r, 0));
}

/** Wait until the tab is idle-ish before starting a heavy batch. */
export function whenIdle(timeout = 2000): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (!ric) return new Promise<void>((r) => setTimeout(r, 0));
  return new Promise<void>((r) => ric(() => r(), { timeout }));
}
