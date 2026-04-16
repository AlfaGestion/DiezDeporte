import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Diez Deportes";
const storeTagline =
  process.env.NEXT_PUBLIC_STORE_TAGLINE?.trim() ||
  "Equipamiento deportivo con stock real y pedido directo";

export const metadata: Metadata = {
  title: storeName,
  description: storeTagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
