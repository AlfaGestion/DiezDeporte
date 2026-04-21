import Script from "next/script";

const THEME_BOOTSTRAP_SCRIPT = `
  (() => {
    try {
      const storageKey = "diezdeportes-theme";
      const savedTheme = window.localStorage.getItem(storageKey);
      const theme =
        savedTheme === "dark" || savedTheme === "light"
          ? savedTheme
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";

      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;

      if (document.body) {
        document.body.dataset.theme = theme;
        document.body.style.colorScheme = theme;
      }
    } catch (_error) {}
  })();
`;

export function ThemeBootScript() {
  return (
    <Script
      id="theme-boot-script"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
