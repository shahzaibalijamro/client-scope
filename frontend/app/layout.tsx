import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./public.css";
import { QueryProvider } from "./query-provider";

export const metadata: Metadata = {
  title: "ClientScope — Clear client agreements",
  description: "Manage client scope, access, decisions, and delivery history.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
