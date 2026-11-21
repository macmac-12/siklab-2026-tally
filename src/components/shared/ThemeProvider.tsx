"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "siklab-theme";
const listeners = new Set<() => void>();
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

function resolveTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

function getSnapshot(): Theme {
  return resolveTheme(document.documentElement.dataset.theme);
}

function getServerSnapshot(): Theme {
  return "dark";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    document.documentElement.dataset.theme = resolveTheme(event.newValue);
    listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The current tab still switches when private browsing blocks persistence.
  }
  for (const listener of listeners) listener();
}

/** Rendered in the document head so the saved palette precedes the first paint. */
export function ThemeScript() {
  return (
    <script
      id="siklab-theme-init"
      dangerouslySetInnerHTML={{
        __html: `(()=>{let theme="dark";try{const saved=localStorage.getItem("${STORAGE_KEY}");if(saved==="light"||saved==="dark")theme=saved;}catch{}document.documentElement.dataset.theme=theme;})();`,
      }}
    />
  );
}

export default function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme controls require ThemeProvider.");
  return context;
}
