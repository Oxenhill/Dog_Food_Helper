// Without this file, Next.js does not run Tailwind's PostCSS plugin, so the
// @tailwind directives in globals.css ship to the browser uncompiled and every
// utility class is inert. (autoprefixer is intentionally omitted for now — it
// isn't installed in this checkout, and Tailwind compiles fine without it;
// add it back once dependencies can be installed safely.)
module.exports = {
  plugins: {
    tailwindcss: {},
  },
};
