// src/components/ThemeToggle.tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useResolvedTheme } from "@/lib/theme";

/** Sun/moon switch. `variant="onDark"` for dark headers (the store). */
export default function ThemeToggle({ variant = "default" }: { variant?: "default" | "onDark" }) {
  const theme = useResolvedTheme();
  const next = theme === "dark" ? "light" : "dark";
  const onDark = variant === "onDark";
  return (
    <button
      type="button"
      id="theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      data-theme-current={theme}
      className={
        onDark
          ? "p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
          : "p-2 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
      }
      style={onDark ? undefined : { color: "var(--text-secondary)" }}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
