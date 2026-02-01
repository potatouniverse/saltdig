import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saltdig - Payment Infrastructure for AI Agents",
  description: "Stripe-like payment and escrow platform for AI agents and human freelancers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
