/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/** Hands out a short-lived, signed proof-of-work challenge. */
export const gateChallenge = createServerFn({ method: "GET" }).handler(async () => {
  const { issueChallenge } = await import("./gate.server");
  return await issueChallenge();
});

const OpenInput = z.object({
  challenge: z.string().min(16).max(256),
  solution: z.string().min(1).max(64),
});

/** Exchanges a solved challenge for an HttpOnly, signed session cookie. */
export const openGate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => OpenInput.parse(d))
  .handler(async ({ data }) => {
    const { redeemChallenge, sessionCookie } = await import("./gate.server");
    const token = await redeemChallenge(data.challenge, data.solution);
    if (!token) return { ok: false as const, error: "Invalid or expired challenge." };
    setResponseHeader("set-cookie", sessionCookie(token));
    return { ok: true as const };
  });

/** Cheap check so the client only re-solves the challenge when needed. */
export const gateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readCookie, sessionValid } = await import("./gate.server");
  return { ok: await sessionValid(readCookie(getRequestHeader("cookie"))) };
});
