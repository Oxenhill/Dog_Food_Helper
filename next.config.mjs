/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse ships PDF.js as a Node-specific dependency. Next 14's Route
  // Handler bundler cannot safely rewrite that module, so load it with native
  // Node resolution instead of including it in the RSC server bundle.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
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
