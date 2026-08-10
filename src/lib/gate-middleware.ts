import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Server-side authorization for every expensive or state-changing server
 * function. Requires the signed gate cookie issued by `openGate` after the
 * access screen — client-side route guards are UX only, this is the boundary.
 */
export const requireGate = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { readCookie, sessionValid, sessionSubject } = await import("./gate.server");
  const token = readCookie(getRequestHeader("cookie"));
  if (!token || !(await sessionValid(token))) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return next({ context: { gateSubject: await sessionSubject(token) } });
});

