import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeBootScript } from "@/components/theme-boot-script";
import "./globals.css";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Diez Deportes";
const storeTagline =
  process.env.NEXT_PUBLIC_STORE_TAGLINE?.trim() ||
  "Equipamiento deportivo con stock real y pedido directo";

export const metadata: Metadata = {
  title: storeName,
  description: storeTagline,
  icons: {
    icon: [{ url: "/favicon.png?v=6", type: "image/png" }],
    shortcut: ["/favicon.png?v=6"],
    apple: [{ url: "/apple-touch-icon.png?v=6", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <ThemeBootScript />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
