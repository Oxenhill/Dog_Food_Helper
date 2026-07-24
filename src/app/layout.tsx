import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dog Food Helper",
  description: "Personalized dog food recommendations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
