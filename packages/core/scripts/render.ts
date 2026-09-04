/**
 * A real *script*: run it with parameters to render a schema file.
 *
 *   node scripts/render.ts <schema.json> [mermaid|dot|tree|rules]  # diagram / rules
 *   node scripts/render.ts <schema.json> report [start-node]     # analysis report
 *
 * The schema is a machine's graph as `JSON.stringify(machine)` writes it: labels, plus the
 * name of each operation where one was there. A file on disk is enough to draw and check a
 * machine, with none of its code present — which is the whole reason the graph is a
 * projection of the machine rather than a second thing to maintain.
 */
import { readFileSync } from "node:fs";
import {
  toMermaid,
  toDot,
  toTree,
  toRules,
  formatIssues,
} from "@evgkch/machjs/formatters";
import { validate } from "@evgkch/machjs/analysis";

const [file, mode = "tree", start] = process.argv.slice(2);

if (!file) {
  console.error(
    "usage: node scripts/render.ts <schema.json> [mermaid|dot|tree|rules|report] [start-node]",
  );
  process.exit(1);
}

const schema = JSON.parse(readFileSync(file, "utf8"));

switch (mode) {
  case "mermaid":
    console.log(toMermaid(schema));
    break;
  case "dot":
    console.log(toDot(schema));
    break;
  case "rules":
    console.log(toRules(schema));
    break;
  case "report":
    console.log(formatIssues(validate(schema, start)));
    break;
  default:
    console.log(toTree(schema));
    break;
}
