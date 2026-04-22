import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeBootScript } from "@/components/theme-boot-script";
import { getPublicStoreSettings } from "@/lib/store-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicStoreSettings();

  return {
    title: settings.storeName,
    description: settings.storeTagline,
    icons: {
      icon: [{ url: "/favicon.png?v=6", type: "image/png" }],
      shortcut: ["/favicon.png?v=6"],
      apple: [{ url: "/apple-touch-icon.png?v=6", type: "image/png" }],
    },
  };
}

export default async function RootLayout({
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
