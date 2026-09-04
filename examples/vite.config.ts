import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs: the same build serves from the root locally and from
  // /machjs/ on GitHub Pages, with no base path to pass in.
  base: "./",
  // A set of separate pages, not one application with routes. Without this Vite
  // answers every unmatched path with the root `index.html`, and because the
  // links on that page are relative — they have to be, for the base above — a
  // stale address like `/form/` would serve the index and then compound:
  // `/form/review/review/…`. In `mpa` a path that is not a page is a 404.
  appType: "mpa",
  resolve: {
    // The library is linked from the workspace, and a linked package is
    // resolved from where it really lives — so anything that reached it by a
    // second path would be a second copy, with a second `TRANSITION` symbol,
    // and a listener on one would never hear the other. One copy, this one.
    dedupe: ["@evgkch/machjs"],
  },
  optimizeDeps: {
    // Prebundled, the inspector would carry a copy of the library inside the bundle — the second
    // copy the line above exists to prevent. Vite prebundles what lives in `node_modules`, and a
    // workspace package is a link out of it, so today this changes nothing; it is what keeps the
    // page right if the inspector is ever taken from the registry instead.
    exclude: ["@evgkch/machjs-inspector"],
  },
  build: {
    // Vite does not look for pages on its own — every example is listed here.
    rollupOptions: {
      input: {
        index: "index.html",
        "selection-rect": "selection-rect/index.html",
        review: "review/index.html",
        wire: "wire/index.html",
        token: "token/index.html",
      },
    },
  },
});
