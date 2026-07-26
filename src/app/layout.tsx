import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // The tagline is the title's second half — it is the brand's own line, and it
  // says what the product is for better than a feature summary would.
  title: "Bowl — Every dog is different. Every choice matters.",
  description:
    "A decision-support tool that tracks your dog's response to food over time and turns it into calm, evidence-honest recommendations. By Dog Smart.",
  applicationName: "Bowl",
  // metadataBase resolves the relative OG/Twitter image paths below to absolute
  // URLs, which link previews require. Falls back to the production host when
  // VERCEL_URL isn't set (local builds).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://dog-food-helper.vercel.app")
  ),
  openGraph: {
    title: "Bowl — Every dog is different. Every choice matters.",
    description:
      "Track your dog's response to food over time, and turn it into calm, evidence-honest recommendations. By Dog Smart.",
    siteName: "Bowl",
    type: "website",
    images: [
      {
        url: "/bowl-logo.png",
        width: 1254,
        height: 1254,
        alt: "Bowl — by Dog Smart",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bowl — Every dog is different. Every choice matters.",
    description:
      "Track your dog's response to food over time, and turn it into calm, evidence-honest recommendations. By Dog Smart.",
    images: ["/bowl-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
