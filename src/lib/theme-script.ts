// src/lib/theme-script.ts
// Server-safe (no React): imported by the root layout.

export const THEME_STORAGE_KEY = "pace-theme";

/** Runs in <head> before first paint: apply the saved or OS theme (no light flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');var d=c==='dark'||((!c||c==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;
