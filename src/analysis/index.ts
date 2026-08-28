/**
 * Analysis layer (opt-in via `machjs/analysis`).
 *
 * Static checks over a schema — reachability, dead ends, structural lints, path enumeration.
 * Nothing here runs a machine or looks inside a function: the graph checks read `to` and `emit`,
 * and the cell-level checks read only whether an edge has a guard, never what it decides. So
 * `unreachable`, `terminal` and `dead-rule` answer the same on `machine.schema` or on a schema
 * read from JSON. `duplicate-edge` needs more — it tells guards apart by identity, which a name
 * cannot do — so it stays quiet on a dumped schema rather than guessing.
 *
 * Returns pure data (`Analysis`, `Issue[]`, `Path[]`); rendering it for humans lives in
 * `machjs/formatters`.
 */
import { edges, nodes } from "../core/index.js";
import type { Edge } from "../core/types.js";
import type { Analysis, Issue, Path } from "./types.js";

export type { Analysis, Issue, Path } from "./types.js";

/** A schema's shape: all nodes, reachability from `start`, and terminal (dead-end) nodes. */
export function analyze<T, Q extends PropertyKey = PropertyKey>(
  schema: T,
  start?: Q,
): Analysis<Q> {
  const rows = edges(schema) as unknown as Edge<Q>[];
  const all = nodes(schema) as unknown as Q[];
  const terminal = all.filter((n) => !rows.some((r) => r.from === n));

  const reachable = new Set<Q>();
  if (start !== undefined) {
    const queue: Q[] = [start];
    reachable.add(start);
    for (let i = 0; i < queue.length; i++)
      for (const row of rows)
        if (row.from === queue[i] && !reachable.has(row.to)) {
          reachable.add(row.to);
          queue.push(row.to);
        }
  }

  return {
    nodes: all,
    reachable: [...reachable],
    unreachable:
      start === undefined ? [] : all.filter((n) => !reachable.has(n)),
    terminal,
  };
}

/**
 * Turn `analyze` facts plus the cell-level lints into a severity-ranked report.
 *
 *   error   — unreachable node (dead code; requires `start`)
 *   error   — dead rule: a rule sitting after an unguarded one, so it can never fire
 *   warning — terminal node (dead end, possibly an intended final state)
 *   warning — duplicate edge: two rules a run cannot tell apart
 *
 * `terminal` is a warning, not an error, since it is usually an intended final state. Several
 * rules on one cell is not itself a finding, nor is a cell whose every rule is guarded — an
 * absent `when` reads as ⊤, and a guard refusing an event is a legitimate outcome of δ's
 * partiality, the same reason `dispatch` answers with a verdict rather than a transition.
 */
export function validate<T, Q extends PropertyKey = PropertyKey>(
  schema: T,
  start?: Q,
): Issue<Q>[] {
  const issues: Issue<Q>[] = [];
  const rows = edges(schema) as unknown as Edge<Q>[];
  const { unreachable, terminal } = analyze(schema, start);

  for (const node of unreachable)
    issues.push({
      severity: "error",
      kind: "unreachable",
      node,
      message: `node "${String(node)}" is unreachable from "${String(start)}"`,
    });

  for (const node of terminal)
    issues.push({
      severity: "warning",
      kind: "terminal",
      node,
      message: `node "${String(node)}" has no outgoing transitions`,
    });

  // Group the rows back into cells: one cell is one (node, event) pair.
  const cells = new Map<string, Edge<Q>[]>();
  for (const row of rows) {
    const key = `${String(row.from)}\0${String(row.on)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(row);
  }

  for (const list of cells.values()) {
    const { from: node, on: event } = list[0];

    // Two rules with the same target, output event and guard object are indistinguishable at
    // run time, so the second can never fire — sharing a target is fine, sharing a target and
    // a guard is copy-paste. Reference equality is the test. Off a dumped schema every guard is
    // a name rather than the function it named, so nothing can be told apart by reference and
    // the check stays quiet instead of guessing.
    const seen = new Map<string, unknown[]>();
    for (const row of list) {
      const key = `${String(row.to)}\0${String(row.emit ?? "")}`;
      const guards = seen.get(key) ?? seen.set(key, []).get(key)!;
      if (typeof row.when !== "string" && guards.includes(row.when))
        issues.push({
          severity: "warning",
          kind: "duplicate-edge",
          node,
          event,
          message: `cell "${String(event)}" at "${String(node)}" repeats the edge to "${String(row.to)}"`,
        });
      guards.push(row.when);
    }

    // A rule with no guard always fires, so nothing after it is reachable.
    const open = list.findIndex((r) => !r.when);
    if (open !== -1 && open < list.length - 1)
      issues.push({
        severity: "error",
        kind: "dead-rule",
        node,
        event,
        message: `cell "${String(event)}" at "${String(node)}": rule ${open + 1} has no guard, so the ${list.length - open - 1} after it can never fire`,
      });
  }

  return issues;
}

/**
 * Enumerate every simple path from `from`: acyclic runs ending at a dead end
 * (`kind: 'terminal'`) and loops that revisit a node already on the path
 * (`kind: 'cycle'`, whose last node repeats an earlier one). Pure; the count can grow
 * large on dense graphs, since it lists all simple paths.
 */
export function paths<T, Q extends PropertyKey = PropertyKey>(
  schema: T,
  from: Q,
): Path<Q>[] {
  const out = edges(schema) as unknown as Edge<Q>[];
  const result: Path<Q>[] = [];

  const walk = (node: Q, nodes: Q[], legs: Edge<Q>[]): void => {
    const outgoing = out.filter((r) => r.from === node);
    if (outgoing.length === 0) {
      result.push({ nodes: [...nodes], legs: [...legs], kind: "terminal" });
      return;
    }
    for (const row of outgoing) {
      if (nodes.includes(row.to))
        result.push({
          nodes: [...nodes, row.to],
          legs: [...legs, row],
          kind: "cycle",
        });
      else walk(row.to, [...nodes, row.to], [...legs, row]);
    }
  };

  walk(from, [from], []);
  return result;
}
