"use client";

import { useEffect, useState } from "react";
import { ThemeToggleIcon, getThemeToggleLabel } from "@/components/theme-toggle-icon";

const LOCAL_STORAGE_THEME_KEY = "diezdeportes-theme";

type ThemeMode = "light" | "dark";

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }

    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) {
      return;
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.dataset.theme = theme;
    document.body.style.colorScheme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme, themeReady]);

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
