/** Types for the analysis module. */
import type { Edge } from "../core/types.js";

/**
 * Static facts about a schema, computable without running anything.
 * Each field is a *subset* of the node set — hence readonly; order carries no meaning.
 */
export type Analysis<Q extends PropertyKey> = {
  nodes: readonly Q[];
  reachable: readonly Q[]; // reachable from `start` (empty if no start given)
  unreachable: readonly Q[]; // present but not reachable from `start`
  terminal: readonly Q[]; // no outgoing edges (dead ends)
};

/**
 * A problem found by `validate`.
 *
 * `dead-rule` needs to know *that* an edge is guarded, and no more — presence, which `toJSON`
 * keeps (as the guard's name), so it answers the same on a machine in hand and on one loaded
 * from JSON. `duplicate-edge` wants identity rather than presence, and is quiet without it.
 */
export type Issue<Q extends PropertyKey> = {
  severity: "error" | "warning";
  kind:
    | "unreachable" // node not reachable from start
    | "terminal" // node with no outgoing edges
    | "duplicate-edge" // two rules a run cannot tell apart
    | "dead-rule"; // a rule after an unguarded one — can never fire
  node: Q;
  /** The event type whose cell the finding is about; absent for node-level findings. */
  event?: PropertyKey;
  message: string;
};

/** A walk from the start node — either to a dead end, or closing a loop. */
export type Path<Q extends PropertyKey> = {
  nodes: Q[]; // node sequence, start … end
  legs: Edge<Q>[]; // rows traversed, in order
  kind: "terminal" | "cycle";
};
