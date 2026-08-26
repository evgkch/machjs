/**
 * The automated gate: what CI would run before a human looks.
 *
 * The document is a state-machine schema, so the checks are the library's own — `validate` for
 * the findings, `analyze` for the shape. On top of them sit the house rules: what this
 * organisation will not merge. The two lists are kept apart — facts and policy.
 *
 * The reading is the inspector's `readSchema`, which is the same reader the editor and the
 * drawing on the page use. One reader for all three: what the gate refuses is what the reviewer
 * sees drawn, down to the line it was written on.
 */
import { analyze, validate } from "@evgkch/machjs/analysis";
import { edges, nodes } from "@evgkch/machjs";
import { readSchema } from "@evgkch/machjs-inspector/ui";
import type { Written } from "@evgkch/machjs-inspector/ui";
import type { Fault } from "./types.js";

/**
 * A schema as the editor hands one over: keyed by state, holding anything. Loose on purpose — a
 * validator's input may be nonsense. `object` instead would cost the state names: `keyof object`
 * is `never`.
 */
export type Graph = Record<string, unknown>;

/**
 * The document read, or the reader's complaint and the line it is about. `rules` carries the line
 * every rule was written on, which is the join between the drawing and the text: pointing at an
 * arc lights its line, and a gutter mark fires its rule.
 */
export type Reading =
  | {
      readonly ok: true;
      readonly graph: Graph;
      readonly start: string;
      readonly rules: readonly Written[];
    }
  | { readonly ok: false; readonly say: string; readonly line: number | null };

/**
 * The document read as a graph. Exported: the page reads the same document to draw it, so the
 * check and the drawing never disagree about what the text says.
 *
 * `readSchema` throws nothing and takes both forms the tools write — the rule language and a
 * `JSON.stringify(machine)` dump — so a reviewer may paste either into the editor.
 */
export function read(text: string): Reading {
  const got = readSchema(text);
  if (!got.ok) return { ok: false, say: got.say, line: got.line };
  if (Object.keys(got.graph).length === 0)
    return { ok: false, say: "the schema names no states", line: null };
  return {
    ok: true,
    graph: got.graph as Graph,
    start: got.start,
    rules: got.rules,
  };
}

/** A document that will not read is one fault — there is nothing to analyse. */
const unreadable = (what: string): Fault[] => [
  { rank: "blocker", where: "document", what },
];

/**
 * What the library says, in this pipeline's words: an error blocks, a warning goes to the
 * reviewers. The mapping is decided here, so the machine's guard asks one question.
 */
const found = (graph: Graph, start: string): Fault[] =>
  validate(graph, start)
    // A dead end is no finding: the library marks it as a warning, but a state with no way
    // out is usually the intended final one. The case where nothing at all can run is
    // policy's own blocker below.
    .filter((issue) => issue.kind !== "terminal")
    .map((issue) => ({
      rank: issue.severity === "error" ? "blocker" : "caution",
      where: issue.event
        ? `${issue.node} · ${String(issue.event)}`
        : issue.node,
      what: issue.message,
    }));

/**
 * The house rules — this organisation's, not the library's. Three: a schema with no way out of
 * any state, an upper-case state name, and a guard without a name. The last reads the serialized
 * form: both readers write `?` where an anonymous guard was.
 */
const policy = (graph: Graph, start: string): Fault[] => {
  const out: Fault[] = [];
  const facts = analyze(graph, start);

  if (facts.terminal.length === facts.nodes.length)
    out.push({
      rank: "blocker",
      where: "schema",
      what: "every state is a dead end — nothing here can run",
    });

  for (const q of nodes(graph))
    if (q !== q.toLowerCase())
      out.push({
        rank: "caution",
        where: q,
        what: "state names are lower case in this codebase",
      });

  for (const row of edges(graph))
    if (row.when === "?")
      out.push({
        rank: "caution",
        where: `${String(row.from)} · ${String(row.on)}`,
        what: "the guard has no name, so no diagram can say what it decides",
      });

  return out;
};

/** Run the gate over a submission: everything the library found, then everything policy adds. */
export function gate(text: string): readonly Fault[] {
  const got = read(text);
  if (!got.ok) return unreadable(got.say);
  return [...found(got.graph, got.start), ...policy(got.graph, got.start)];
}
