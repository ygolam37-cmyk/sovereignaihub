/// <reference lib="webworker" />
// Dedicated crypto worker: SHA-256 digests never run on the UI thread.

type Req = { id: string; bytes: ArrayBuffer };

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, bytes } = ev.data;
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    let hex = "";
    for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
    (self as unknown as Worker).postMessage({ id, hex });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e) });
  }
};
