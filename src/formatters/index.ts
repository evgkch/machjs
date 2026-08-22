/**
 * Formatters (opt-in via `machjs/formatters`).
 *
 * Standard implementations of the `Formatter` contract: turn a schema into diagram source
 * (Mermaid / DOT / a terminal tree / SQL-like rule lines) or a `validate` report into terminal
 * text. `to*` takes a schema, `format*` takes a value another module produced. Swap in your own
 * renderer by passing any function of the same shape, and reuse `edgeLabel` so an edge reads
 * like the shipped ones.
 *
 * Renderers compute nothing about the graph — walking, reaching, enumerating belong to
 * `machjs/analysis` — the only traversal used here is `edges`, in schema order. A renderer says
 * the same thing for `machine.schema` and `machine.toJSON()`, since `toJSON` already wrote each
 * operation's name in place of its code; a guard with no name still shows as `?` rather than
 * being hidden. Names come from `nameOf`, the same function the dump uses, so a diagram and a
 * dump cannot disagree about what an operation is called.
 */
import { edges, nodes, nameOf } from "../core/index.js";
import type { Edge } from "../core/types.js";
import type { Issue } from "../analysis/types.js";
import { WORDS, writer } from "./words.js";
import type {
  Formatter,
  RenderOptions,
  TextOptions,
  FormatOptions,
} from "./types.js";

export type {
  Formatter,
  RenderOptions,
  TextOptions,
  FormatOptions,
} from "./types.js";

/**
 * The edge label, in run order: `ON event WHEN … WITH … EMIT …` — the same keywords `toRules`
 * prints. Classic statechart notation (`event [when] / emit`) is available by passing your own
 * `label` to `toMermaid`, `toDot` or `toTree`, but is not the default.
 *
 * `by` is left out here: it only shapes the payload of an event already named on the label,
 * unlike `when`/`with`/`emit` which change which edge fires or what it carries. It appears in
 * `toRules`, which has a column for everything.
 *
 * Exported so a custom renderer can reuse the library's own edge label instead of rebuilding it.
 */
export const edgeLabel = (row: Edge): string => {
  const when = nameOf(row.when, "when");
  const with_ = nameOf(row.with, "with");
  return (
    `ON ${String(row.on)}` +
    (when ? ` WHEN ${when}` : "") +
    (with_ ? ` WITH ${with_}` : "") +
    (row.emit ? ` EMIT ${String(row.emit)}` : "")
  );
};

const invert = (s: string) => `\x1b[7m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

/** Mermaid `stateDiagram-v2` (paste into Markdown). */
export const toMermaid: Formatter<unknown, RenderOptions<PropertyKey>> = (
  schema,
  options,
) => {
  const lines = ["stateDiagram-v2"];
  if (options?.direction) lines.push(`    direction ${options.direction}`);
  if (options?.start !== undefined)
    lines.push(`    [*] --> ${String(options.start)}`);
  const say = options?.label ?? edgeLabel;
  for (const row of edges(schema))
    lines.push(`    ${row.from} --> ${row.to}: ${say(row)}`);
  if (options?.current !== undefined) {
    lines.push("    classDef current fill:#4f46e5,color:#fff,font-weight:bold");
    lines.push(`    class ${String(options.current)} current`);
  }
  return lines.join("\n");
};

/** Graphviz DOT. */
export const toDot: Formatter<unknown, RenderOptions<PropertyKey>> = (
  schema,
  options,
) => {
  const lines = ["digraph FSM {"];
  if (options?.direction) lines.push(`    rankdir=${options.direction};`);
  if (options?.start !== undefined) {
    lines.push("    __start [shape=point];");
    lines.push(`    __start -> "${String(options.start)}";`);
  }
  if (options?.current !== undefined)
    lines.push(
      `    "${String(options.current)}" [style=filled fillcolor="#4f46e5" fontcolor=white];`,
    );
  const say = options?.label ?? edgeLabel;
  for (const row of edges(schema))
    lines.push(`    "${row.from}" -> "${row.to}" [label="${say(row)}"];`);
  lines.push("}");
  return lines.join("\n");
};

/**
 * Plain-text adjacency tree for the terminal — current node `●`, dead ends `∎`.
 *
 * Nodes come in schema order; a node with an empty cell still gets a line, since reading the
 * node set off the edges alone would hide it. Pass `at` to print one node's slice — one lookup,
 * since the schema is keyed by node first.
 */
export const toTree: Formatter<unknown, TextOptions<PropertyKey>> = (
  schema,
  options,
) => {
  const rows = edges(schema) as Edge[];
  const say = options?.label ?? edgeLabel;
  const lines: string[] = [];

  for (const node of options?.at !== undefined
    ? [options.at]
    : (nodes(schema) as PropertyKey[])) {
    const outgoing = rows.filter((r) => r.from === node);
    const mark =
      options?.current === node ? " ●" : outgoing.length === 0 ? " ∎" : "";
    const name =
      options?.color && options?.current === node
        ? invert(String(node))
        : String(node);
    lines.push(`${name}${mark}`);
    outgoing.forEach((row, i) =>
      lines.push(
        `  ${i === outgoing.length - 1 ? "└─" : "├─"} ${say(row)} → ${String(row.to)}`,
      ),
    );
  }
  return lines.join("\n");
};

/**
 * Schema dump as rules — one sentence per rule, `FROM ON WHEN TO WITH EMIT BY`:
 *
 *     FROM locked ON coin WHEN underCap TO locked WITH addCoin
 *     FROM locked ON coin               TO open   WITH reset   EMIT opened
 *     FROM open   ON pass               TO locked
 *
 * One column per word, in the order the rule runs: `WHEN` gates, `WITH` folds, `EMIT`/`BY`
 * observe. `FROM`, `ON`, `TO`, `EMIT` carry labels; `WHEN`, `WITH`, `BY` carry a function's name
 * (`?` if none), so a schema loaded from JSON reads the same line — a column vanishes only when
 * no rule in the schema fills it.
 *
 * Rows come in schema order (state-major, so `FROM` groups). `machjs/debug`'s `rules` writes a
 * running machine in the same language, four words of it.
 */
export const toRules: Formatter<unknown> = (schema) => {
  const rows = edges(schema) as Edge[];
  const line = writer(rows, WORDS);
  return rows.map(line).join("\n");
};

/** A `validate` report for the terminal (✗ error / ⚠ warning per line). */
export const formatIssues: Formatter<Issue<PropertyKey>[], FormatOptions> = (
  issues,
  options,
) => {
  if (issues.length === 0) return "no issues";
  return issues
    .map((issue) => {
      const tag = `${issue.severity === "error" ? "✗" : "⚠"} ${issue.severity.padEnd(7)}`;
      const head = options?.color
        ? issue.severity === "error"
          ? red(tag)
          : yellow(tag)
        : tag;
      return `${head} ${issue.message}`;
    })
    .join("\n");
};
