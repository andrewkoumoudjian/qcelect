import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "qcelect — Québec election results",
  description: "Fast official Québec election results and calibrated projections.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="root">{children}</div>
      </body>
    </html>
  );
}
