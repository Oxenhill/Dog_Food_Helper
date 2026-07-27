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
  // URLs, which link previews require.
  //
  // Order matters. VERCEL_URL is the *per-deployment* host
  // (dog-food-helper-7ig9vcmk5-….vercel.app) — it is ephemeral and, on a
  // protected deployment, not publicly fetchable, so an og:image pointing at it
  // silently fails to render in link previews. Observed live before this was
  // fixed. VERCEL_PROJECT_PRODUCTION_URL is the stable production domain and is
  // what a shared link should reference; VERCEL_URL is kept only as a last
  // resort for preview deployments.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
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

/**
 * Which build a browser is actually talking to — Vercel sets these at build
 * time (undefined under `next dev`). Added 2026-07-27 after two rounds of
 * mis-diagnosing a bug against the wrong environment (localhost vs. the
 * deployed URL): rendered server-side so it's free, and visible so nobody has
 * to guess again.
 */
function BuildMarker() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const label = sha ? `${process.env.VERCEL_ENV ?? "vercel"} · ${sha}` : "local dev";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 4,
        right: 6,
        fontSize: 10,
        lineHeight: 1,
        opacity: 0.35,
        pointerEvents: "none",
        zIndex: 9999,
        fontFamily: "monospace",
        color: "#000",
      }}
    >
      {label}
    </div>
  );
}

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
      <body>
        {children}
        <BuildMarker />
      </body>
    </html>
  );
}
