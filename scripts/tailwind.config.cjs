// Tailwind build config for the devocionales page. The page previously used the Tailwind Play CDN
// (no config, default theme), so this stays the default theme to render identically.
// Paths are relative to the repo root, where scripts/build-tailwind.sh runs the CLI.
module.exports = {
  content: [
    'devocionales/*.html', // the reader and the legal pages
    'devocionales/estudios/*.html', // the Bible-studies page
    'devocionales/js/*.js',
    '!devocionales/js/*.test.js',
    // Shared scripts the devocionales page also loads.
    'js/site-footer.js',
    'js/rtl-helper.js',
    'js/app-stats.js',
  ],
  theme: { extend: {} },
  plugins: [],
};
