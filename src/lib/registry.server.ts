// Registry helpers — HuggingFace manifest fetch + SHA verification.
// The "signed manifest" is the HF commit SHA. If it drifts, we quarantine.

export type HfManifest = { sha: string; modelId: string; siblings: number };

export async function fetchHfManifest(hfModelId: string): Promise<HfManifest | null> {
  // Strip provider suffix (e.g. ":scaleway", ":fireworks-ai") — not part of HF repo id.
  const repoId = hfModelId.split(":")[0];
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sha?: string; modelId?: string; siblings?: unknown[] };
    if (!json.sha) return null;
    return {
      sha: json.sha,
      modelId: json.modelId ?? repoId,
      siblings: Array.isArray(json.siblings) ? json.siblings.length : 0,
    };
  } catch {
    return null;
  }
}

export async function verifyModelSha(hfModelId: string, expectedSha: string | null): Promise<{
  ok: boolean;
  currentSha: string | null;
  drift: boolean;
}> {
  const manifest = await fetchHfManifest(hfModelId);
  if (!manifest) return { ok: false, currentSha: null, drift: false };
  if (!expectedSha) return { ok: true, currentSha: manifest.sha, drift: false };
  return { ok: manifest.sha === expectedSha, currentSha: manifest.sha, drift: manifest.sha !== expectedSha };
}
