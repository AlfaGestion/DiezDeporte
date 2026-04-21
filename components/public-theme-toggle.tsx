"use client";

import { useEffect, useState } from "react";
import { ThemeToggleIcon, getThemeToggleLabel } from "@/components/theme-toggle-icon";

const LOCAL_STORAGE_THEME_KEY = "diezdeportes-theme";

type ThemeMode = "light" | "dark";

export function PublicThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.dataset.theme = theme;
    document.body.style.colorScheme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      aria-label={getThemeToggleLabel(theme)}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      <ThemeToggleIcon theme={theme} />
    </button>
  );
}
