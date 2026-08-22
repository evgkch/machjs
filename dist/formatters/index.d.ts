import type { Edge } from "../core/types.js";
import type { Issue } from "../analysis/types.js";
import type { Formatter, RenderOptions, TextOptions, FormatOptions } from "./types.js";
export type { Formatter, RenderOptions, TextOptions, FormatOptions, } from "./types.js";
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
export declare const edgeLabel: (row: Edge) => string;
/** Mermaid `stateDiagram-v2` (paste into Markdown). */
export declare const toMermaid: Formatter<unknown, RenderOptions<PropertyKey>>;
/** Graphviz DOT. */
export declare const toDot: Formatter<unknown, RenderOptions<PropertyKey>>;
/**
 * Plain-text adjacency tree for the terminal — current node `●`, dead ends `∎`.
 *
 * Nodes come in schema order; a node with an empty cell still gets a line, since reading the
 * node set off the edges alone would hide it. Pass `at` to print one node's slice — one lookup,
 * since the schema is keyed by node first.
 */
export declare const toTree: Formatter<unknown, TextOptions<PropertyKey>>;
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
export declare const toRules: Formatter<unknown>;
/** A `validate` report for the terminal (✗ error / ⚠ warning per line). */
export declare const formatIssues: Formatter<Issue<PropertyKey>[], FormatOptions>;
