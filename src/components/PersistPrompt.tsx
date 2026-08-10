/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { HardDriveDownload, X } from "lucide-react";
import { useState } from "react";

/**
 * Graceful prompt shown only when the browser denied durable storage.
 * The session already has an encrypted IndexedDB fallback copy — this just
 * asks the user to grant persistence so it can never be evicted.
 */
export function PersistPrompt() {
  const { user, persist, requestPersist } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user || persist !== "denied" || dismissed) return null;

  return (
    <div className="glass mx-auto mt-3 flex max-w-5xl items-start gap-3 rounded-xl px-4 py-3 text-xs text-muted-foreground">
      <HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <div className="flex-1">
        <p className="text-foreground">Keep me signed in permanently on this device</p>
        <p className="mt-0.5">
          Your browser hasn&apos;t granted persistent storage yet. An encrypted backup of your session is stored
          locally, but granting persistence guarantees it survives history clears.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 border-gold/40"
          onClick={() => void requestPersist()}
        >
          Grant persistent storage
        </Button>
      </div>
      <button aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
