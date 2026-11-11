// src/lib/theme.ts
// ============================================================
// Light / dark theme for the dashboard and the store.
// ============================================================
// The resolved theme lives on <html data-theme="light|dark">; CSS tokens in
// globals.css switch on it. The user's choice ("light" | "dark" | "system")
// is kept in localStorage; "system" follows the OS setting live.
// THEME_INIT_SCRIPT (theme-script.ts) runs in <head> before first paint.
// ============================================================

"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const KEY = THEME_STORAGE_KEY;

function readChoice(): ThemeChoice {
  try {
    const c = window.localStorage.getItem(KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === "dark" || (choice === "system" && systemDark()) ? "dark" : "light";
}

const listeners = new Set<() => void>();
let wired = false;

function apply() {
  document.documentElement.setAttribute("data-theme", resolve(readChoice()));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!wired && typeof window !== "undefined") {
    wired = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (readChoice() === "system") apply();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) apply();
    });
  }
  return () => listeners.delete(cb);
}

/** Current resolved theme (server render assumes light; the init script fixes the DOM first). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light"
  );
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: still apply for this page */
  }
  apply();
}
