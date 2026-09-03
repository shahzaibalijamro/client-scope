import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { QueryProvider } from "./query-provider";

export const metadata: Metadata = {
  title: "ClientScope system status",
  description: "Current availability of the ClientScope service.",
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
