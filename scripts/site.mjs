// The one site that Pages serves: the examples at the root, the inspector's pages under
// `/inspector/`. Both builds use relative asset URLs, so one can be nested in the other without a
// base path. Run after `npm run build`.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = `${root}site`;

rmSync(site, { recursive: true, force: true });
mkdirSync(site);
cpSync(`${root}examples/dist`, site, { recursive: true });
cpSync(`${root}packages/inspector/dist`, `${site}/inspector`, {
  recursive: true,
});
console.log("site/ — the examples at /, the inspector at /inspector/");
