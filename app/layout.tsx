import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "The Aquarium Guild Raid Event Tracking",
  description: "Live tracking for the current GRAID event."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-ocean-900 antialiased">{children}</body>
    </html>
  );
}
