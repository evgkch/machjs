import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * The palette, published as `@evgkch/machjs-inspector/tokens.css`.
 *
 * It is the one file in `dist-lib` that is not a build product: `src/shared/ui/tokens/tokens.css`,
 * copied. That copy used to be a `cp` in the npm script beside the build, which meant the build
 * alone produced a `dist-lib` that was missing a file the manifest promises, and the promise is
 * what somebody else's stylesheet imports. Emitted here, one command is enough, and the file goes
 * wherever the output goes and is cleared with it.
 */
const TOKENS = "src/shared/ui/tokens/tokens.css";

const tokens = (): Plugin => ({
  name: "machjs-inspector-tokens",
  // The library build only. The site's own build has no manifest to keep.
  apply: "build",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "tokens.css",
      source: readFileSync(TOKENS, "utf8"),
    });
  },
});

/**
 * The package, as opposed to the page. `vite.config.ts` builds the standalone site out of
 * `index.html`; this builds `src/index.ts` into something another application can import.
 *
 * The library is left out of the bundle: whoever embeds the inspector already has a machine, and
 * a second copy of `machjs` would be a second `TRANSITION` symbol — the listener would never fire.
 *
 * Two entries. `index` is `inspect(fsm)`: what an application writes, with no document and no
 * stylesheet in it, because the thing being debugged may have neither — a server, a worker, a
 * test run. `ui` is the tool, for a page that wants to draw the figure itself, and importing it
 * means importing a stylesheet: `ui.css` is the light DOM — the mount's grid and the overlay —
 * and `tokens.css` is the palette, which crosses into a shadow root on its own because a custom
 * property is inherited.
 */
export default defineConfig({
  plugins: [tokens()],
  build: {
    outDir: "dist-lib",
    lib: {
      entry: { index: "src/index.ts", ui: "src/ui.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^@evgkch\/(machjs|chanjs)(\/|$)/, /^lit/],
      // Named after the entry that carries it, which is `ui` — the main entry has no stylesheet at
      // all, and a file called `index.css` beside a JavaScript file that never mentions a document
      // would be the manifest's one confusing sentence.
      output: { assetFileNames: "ui[extname]" },
    },
  },
});
