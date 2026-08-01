import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { hasLocalAuth } from "@/lib/auth-context";
import { PeerAutoConnect } from "@/components/PeerAutoConnect";


/**
 * Pathless layout route. Any file named `_authenticated.<name>.tsx`
 * (or nested under `_authenticated/`) is automatically gated by this guard.
 * The URL does not include `_authenticated` — e.g. `_authenticated.dashboard.tsx` → `/dashboard`.
 *
 * Auth is client-side only (sessionStorage), so we disable SSR for this subtree
 * and run the check in `beforeLoad` — it fires before the route component renders.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (!hasLocalAuth()) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
