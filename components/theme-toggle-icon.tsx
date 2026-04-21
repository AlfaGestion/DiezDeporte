type ThemeMode = "light" | "dark";

type ThemeToggleIconProps = {
  theme: ThemeMode;
};

export function getThemeToggleLabel(theme: ThemeMode) {
  return `Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`;
}

export function ThemeToggleIcon({ theme }: ThemeToggleIconProps) {
  return theme === "dark" ? <SunIcon /> : <MoonIcon />;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" />
      <path strokeLinecap="round" d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5" />
      <path strokeLinecap="round" d="m18.54 5.46-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.2 14.1A8.75 8.75 0 1 1 9.9 3.8a7 7 0 1 0 10.3 10.3Z"
      />
    </svg>
  );
}
