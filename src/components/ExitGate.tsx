/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

/**
 * Logout is manual-only: this simply routes to the dedicated logout screen
 * where a client-generated verification code must be retyped exactly.
 */
export function ExitGate() {
  return (
    <Link to="/logout">
      <Button variant="ghost" size="sm">
        <LogOut className="mr-2 h-4 w-4" /> Log out
      </Button>
    </Link>
  );
}
