import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { QueryProvider } from "./query-provider";

export const metadata: Metadata = {
  title: "ClientScope — Clear client agreements",
  description: "Manage client scope, access, decisions, and delivery history.",
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
