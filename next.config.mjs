/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse ships PDF.js as a Node-specific dependency. Next 14's Route
  // Handler bundler cannot safely rewrite that module, so load it with native
  // Node resolution instead of including it in the RSC server bundle.
  // @napi-rs/canvas is a native-binary package (pdf-parse's own DOMMatrix/
  // Path2D/ImageData polyfill source, and pdfText.ts imports it directly too)
  // -- same reasoning applies, and bundling it risks the native .node binary
  // not being resolved correctly at runtime.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  },
  // Allow an isolated preview dev server (separate build output) to run
  // alongside another dev server in the same checkout without the two
  // clobbering each other's .next directory. Default is unchanged (.next);
  // only a process that explicitly sets NEXT_PREVIEW_DISTDIR is affected.
  ...(process.env.NEXT_PREVIEW_DISTDIR
    ? { distDir: process.env.NEXT_PREVIEW_DISTDIR }
    : {}),
};

export default nextConfig;
