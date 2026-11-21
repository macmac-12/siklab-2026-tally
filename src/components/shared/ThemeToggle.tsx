"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = nextTheme === "light" ? Sun : Moon;
  const label = `Switch to ${nextTheme} mode`;
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{nextTheme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
