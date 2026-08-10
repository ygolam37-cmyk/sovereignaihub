/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
// Sovereign Native Engine — 100% self-hosted synthesis.
// No Hugging Face, no third-party model API, no external inference provider.
// Pure deterministic algorithms: tokenization, TF-IDF weighting, MMR-based
// extractive synthesis over open-web evidence, plus native arithmetic and
// temporal resolution.

import type { SearchHit } from "./search.server";

const STOP = new Set(
  ("a an the and or but if then than that this these those of in on at to for from by with about as is are was were be been being it its it's i you he she they we do does did not no so such very can could should would will just also into over under more most other some any what which who whom when where why how".split(
    " ",
  )),
);

export type Lane = "fast" | "reasoning" | "code" | "creative" | "native-math";

export function routePrompt(prompt: string): Lane {
  const p = prompt.toLowerCase();
  if (isArithmetic(p)) return "native-math";
  if (/(code|function|bug|stack|typescript|python|sql|regex)/.test(p)) return "code";
  if (/(why|explain|prove|analy|reason|step by step|derive)/.test(p)) return "reasoning";
  if (/(write|story|poem|imagine|describe|creative)/.test(p)) return "creative";
  return "fast";
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/* ---------------- native arithmetic (no eval) ---------------- */

function isArithmetic(p: string): boolean {
  return /^[\s\d+\-*/^%().,]+$/.test(p.trim()) && /\d/.test(p) && /[+\-*/^%]/.test(p);
}

export function evalArithmetic(expr: string): number | null {
  const tokens = expr.replace(/,/g, "").match(/\d+(\.\d+)?|[+\-*/^%()]/g);
  if (!tokens) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  const parsePrimary = (): number | null => {
    const t = eat();
    if (t === undefined) return null;
    if (t === "(") {
      const v = parseExpr();
      if (peek() === ")") eat();
      return v;
    }
    if (t === "-") {
      const v = parsePrimary();
      return v === null ? null : -v;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const parsePow = (): number | null => {
    let left = parsePrimary();
    while (left !== null && peek() === "^") {
      eat();
      const right = parsePow();
      if (right === null) return null;
      left = left ** right;
    }
    return left;
  };
  const parseTerm = (): number | null => {
    let left = parsePow();
    while (left !== null && (peek() === "*" || peek() === "/" || peek() === "%")) {
      const op = eat();
      const right = parsePow();
      if (right === null) return null;
      if (op === "*") left *= right;
      else if (op === "/") left = right === 0 ? NaN : left / right;
      else left = right === 0 ? NaN : left % right;
    }
    return left;
  };
  const parseExpr = (): number | null => {
    let left = parseTerm();
    while (left !== null && (peek() === "+" || peek() === "-")) {
      const op = eat();
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const value = parseExpr();
  return value === null || !Number.isFinite(value) ? null : value;
}

/* ---------------- extractive synthesis ---------------- */

type Sentence = { text: string; hit: number; pos: number };

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 400);
}

function idfMap(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / d));
  return idf;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function synthesize(prompt: string, hits: SearchHit[], limit = 5): { text: string; used: number[] } {
  const q = new Set(tokenize(prompt));
  const sentences: Sentence[] = [];
  hits.forEach((h, i) => {
    const parts = splitSentences(`${h.title}. ${h.snippet}`);
    parts.forEach((text, pos) => sentences.push({ text, hit: i, pos }));
    if (!parts.length && h.snippet) sentences.push({ text: h.snippet.trim(), hit: i, pos: 0 });
  });
  if (!sentences.length) return { text: "", used: [] };

  const docs = sentences.map((s) => tokenize(s.text));
  const idf = idfMap(docs);

  const scored = sentences.map((s, i) => {
    const toks = docs[i];
    const set = new Set(toks);
    let overlap = 0;
    for (const t of q) if (set.has(t)) overlap += idf.get(t) ?? 1;
    const coverage = q.size ? overlap / q.size : 0;
    const positionBonus = 1 / (1 + s.pos * 0.4);
    const rankBonus = 1 / (1 + s.hit * 0.3);
    return { ...s, set, score: coverage * 2 + positionBonus * 0.4 + rankBonus * 0.6 };
  });

  // Maximal Marginal Relevance — relevance minus redundancy.
  const selected: typeof scored = [];
  const pool = scored.sort((a, b) => b.score - a.score).slice(0, 40);
  while (selected.length < limit && pool.length) {
    let best = 0;
    let bestVal = -Infinity;
    pool.forEach((cand, i) => {
      const redundancy = selected.reduce((m, s) => Math.max(m, jaccard(cand.set, s.set)), 0);
      const val = cand.score - redundancy * 1.4;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    });
    selected.push(pool.splice(best, 1)[0]);
  }

  const used = Array.from(new Set(selected.map((s) => s.hit))).sort((a, b) => a - b);
  const body = selected.map((s) => `• ${s.text} [${s.hit + 1}]`).join("\n");
  return { text: body, used };
}

/* ---------------- top-level native answer ---------------- */

export function nativeAnswer(params: { prompt: string; hits: SearchHit[] }): {
  lane: Lane;
  text: string;
  audit: string;
} {
  const lane = routePrompt(params.prompt);

  if (lane === "native-math") {
    const value = evalArithmetic(params.prompt);
    return {
      lane,
      text:
        value === null
          ? "I could not parse that expression. Please write it with numbers and + - * / ^ % ( ) only."
          : `${params.prompt.trim()} = ${value}`,
      audit: "Reasoning Audit: Native arithmetic kernel — computed locally, no model call.",
    };
  }

  const { text, used } = synthesize(params.prompt, params.hits, lane === "reasoning" ? 6 : 4);

  if (!text) {
    return {
      lane,
      text: [
        "I run entirely on this network's own devices — there is no external AI provider behind me, so I answer from evidence I can actually fetch and verify.",
        "I could not retrieve open-web evidence for that question right now. Try rephrasing it with a concrete subject, or ask something factual I can look up.",
      ].join("\n\n"),
      audit: "Reasoning Audit: Native engine ran with zero evidence — no synthesis performed.",
    };
  }

  const cites = used.map((i) => `[${i + 1}] ${params.hits[i]?.url ?? ""}`).join("\n");
  return {
    lane,
    text: `Here is what the open web currently supports:\n\n${text}\n\nSources:\n${cites}`,
    audit: `Reasoning Audit: Native synthesis engine — TF-IDF + MMR over ${params.hits.length} verified open-web documents, ${used.length} cited. No external model API used.`,
  };
}
