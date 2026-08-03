// Continuous device capability measurement — WebGPU, CPU, RAM, battery.
// Produces a 0..100 strength score used for adaptive load balancing.

export type DeviceCaps = {
  webgpu: boolean;
  gpuAdapter: string | null;
  cores: number;
  memoryGb: number | null;
  batteryLevel: number | null;
  charging: boolean | null;
  cpuOpsPerMs: number;
  downlinkMbps: number | null;
  saveData: boolean;
  score: number;
  tier: "heavy" | "medium" | "light";
  measuredAt: number;
};

let cached: DeviceCaps | null = null;

function microBench(): number {
  // Tight numeric loop, time-boxed to ~12ms. Higher = faster CPU.
  const start = performance.now();
  let ops = 0;
  let acc = 0;
  while (performance.now() - start < 12) {
    for (let i = 0; i < 20_000; i++) acc += Math.sqrt(i % 97) * 1.000001;
    ops += 20_000;
  }
  if (acc === Infinity) return 0;
  const elapsed = Math.max(1, performance.now() - start);
  return ops / elapsed;
}

async function probeGpu(): Promise<{ webgpu: boolean; adapter: string | null }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return { webgpu: false, adapter: null };
  try {
    const adapter = (await gpu.requestAdapter()) as null | {
      info?: { vendor?: string; architecture?: string };
    };
    if (!adapter) return { webgpu: false, adapter: null };
    const info = adapter.info;
    return {
      webgpu: true,
      adapter: info ? `${info.vendor ?? "gpu"} ${info.architecture ?? ""}`.trim() : "webgpu",
    };
  } catch {
    return { webgpu: false, adapter: null };
  }
}

async function probeBattery(): Promise<{ level: number | null; charging: boolean | null }> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (!nav.getBattery) return { level: null, charging: null };
  try {
    const b = await nav.getBattery();
    return { level: b.level, charging: b.charging };
  } catch {
    return { level: null, charging: null };
  }
}

export function scoreOf(c: Omit<DeviceCaps, "score" | "tier">): number {
  const cpu = Math.min(1, c.cpuOpsPerMs / 25_000); // saturates on desktop-class CPUs
  const cores = Math.min(1, c.cores / 8);
  const ram = c.memoryGb === null ? 0.5 : Math.min(1, c.memoryGb / 8);
  const gpu = c.webgpu ? 1 : 0.25;
  const net = c.saveData ? 0.2 : c.downlinkMbps === null ? 0.6 : Math.min(1, c.downlinkMbps / 10);
  let score = (cpu * 0.3 + cores * 0.15 + ram * 0.2 + gpu * 0.25 + net * 0.1) * 100;

  // Battery guard — never burn down a user's phone.
  if (c.charging === false && c.batteryLevel !== null) {
    if (c.batteryLevel < 0.2) score *= 0.25;
    else if (c.batteryLevel < 0.5) score *= 0.6;
  }
  return Math.max(1, Math.min(100, Math.round(score)));
}

export async function measureDevice(force = false): Promise<DeviceCaps> {
  if (typeof window === "undefined") {
    return {
      webgpu: false,
      gpuAdapter: null,
      cores: 1,
      memoryGb: null,
      batteryLevel: null,
      charging: null,
      cpuOpsPerMs: 0,
      downlinkMbps: null,
      saveData: false,
      score: 1,
      tier: "light",
      measuredAt: Date.now(),
    };
  }
  if (!force && cached && Date.now() - cached.measuredAt < 20_000) return cached;

  const [{ webgpu, adapter }, battery] = await Promise.all([probeGpu(), probeBattery()]);
  const conn = (navigator as Navigator & {
    connection?: { downlink?: number; saveData?: boolean };
  }).connection;

  const base = {
    webgpu,
    gpuAdapter: adapter,
    cores: navigator.hardwareConcurrency || 2,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    batteryLevel: battery.level,
    charging: battery.charging,
    cpuOpsPerMs: microBench(),
    downlinkMbps: conn?.downlink ?? null,
    saveData: !!conn?.saveData,
    measuredAt: Date.now(),
  };
  const score = scoreOf(base);
  const tier: DeviceCaps["tier"] = score >= 70 ? "heavy" : score >= 35 ? "medium" : "light";
  cached = { ...base, score, tier };
  return cached;
}

export function lastCaps(): DeviceCaps | null {
  return cached;
}
