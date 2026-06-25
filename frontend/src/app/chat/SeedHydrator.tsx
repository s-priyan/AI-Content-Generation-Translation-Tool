"use client";

import { useEffect } from "react";
import { loadAllSessions } from "@/lib/sessionSync";

/**
 * Pulls the sidebar's session list from the backend on first mount of the
 * /chat tree. Single-flight per page load — components individually hydrate
 * a session's messages via `loadSessionDetail`.
 */
export function SeedHydrator() {
  useEffect(() => {
    void loadAllSessions();
  }, []);
  return null;
}
