/**
 * Reading a schema without running it: the slot readers (`nameIn`, `opIn`), the projections
 * (`edges`, `nodes`, `graph`) and the operation namer (`nameOf`). The kernel in `./index.js`
 * reads rules and serializes through these; formatters and analysis read schemas the same way,
 * so every representation names things identically.
 */
import type { Carrier, Edge, Graph, IState, Nodes } from "./types.js";

/** An operation as it may be found: code where the schema still has any, a name off a dump. */
export type Op = ((context: never, payload: never) => unknown) | string;

/** A target or a letter: the name alone, or the name with what fills it. */
export type Slot = PropertyKey | readonly [PropertyKey, Op | null];

/**
 * One rule as the kernel reads it — the precise `Rule<…>` lives at the edges. Contexts are
 * untyped here on purpose: the kernel walks a schema without knowing its states, so each
 * context is just a value passed along; narrowing already happened where the schema was written.
 */
export type LooseRule = {
  // Operations are taken at their loosest here: `Readonly<C>` in the precise types rejects a
  // context that may be `void`, but here a context is only a value in transit.
  to: Slot;
  emit?: Slot;
  when?: ((context: never, payload: never) => boolean) | string;
};

export type LooseSchema = Record<
  PropertyKey,
  Record<PropertyKey, LooseRule[] | undefined> | undefined
>;

/**
 * The two halves of a slot — the only place that reads whether a slot is a bare name or a
 * [name, operation] pair. `edges` and `dispatch` both go through this rather than branching on
 * the shape themselves.
 */
const isPair = (
  slot: Slot | undefined,
): slot is readonly [PropertyKey, Op | null] =>
  slot !== undefined && Array.isArray(slot);

export const nameIn = (slot: Slot | undefined): PropertyKey | undefined =>
  isPair(slot) ? slot[0] : slot;

export const opIn = (slot: Slot | undefined): Op | undefined => {
  if (!isPair(slot)) return undefined;
  // Same reason as in `nameOf`: a pair off a plain `stringify` is `["ready", null]`, and a null
  // carrier is no carrier — not a carrier that crashes whoever asks it its name.
  return slot[1] ?? undefined;
};

/**
 * Flatten a schema into the transition relation: one `Edge` per rule, in schema order, each row
 * the rule itself with its `from`/`on` coordinates in front. Operations ride along as functions,
 * or are absent on a schema loaded from JSON.
 */
export function edges<T>(schema: T): Edge<Nodes<T>>[] {
  type Q = Nodes<T>;
  const rows: Edge<Q>[] = [];
  for (const [from, byLetter] of Object.entries((schema ?? {}) as LooseSchema))
    for (const [on, cell] of Object.entries(byLetter ?? {}))
      for (const rule of cell ?? [])
        // Target and carrier come apart into flat fields here.
        rows.push({
          ...(rule.when !== undefined && { when: rule.when }),
          from: from as Q,
          on,
          to: nameIn(rule.to) as Q,
          ...(opIn(rule.to) !== undefined && { with: opIn(rule.to) }),
          ...(nameIn(rule.emit) !== undefined && { emit: nameIn(rule.emit) }),
          ...(opIn(rule.emit) !== undefined && { by: opIn(rule.emit) }),
        });
  return rows;
}

/**
 * Every state the schema names: its own keys, plus every target some rule leads to.
 *
 * Reads the schema's keys directly rather than only `edges`, because a state written with an
 * empty cell (`ghost: {}`) has no rows and would otherwise be missed.
 */
export function nodes<T>(schema: T): Nodes<T>[] {
  const found = new Set<PropertyKey>(Object.keys((schema ?? {}) as object));
  for (const row of edges(schema)) found.add(row.to);
  return [...found] as Nodes<T>[];
}

/**
 * Name an operation: its own function name, or a name already read off a dump, passed through
 * unchanged. Falls back to `?` when there is nothing to show.
 *
 * `slot` discounts the property name JS assigns an anonymous arrow (`{ when: () => {} }.when.name`
 * is `"when"`, not `""`) — without it every anonymous guard would misreport as one named "when".
 * Exported for `machjs/formatters`, so the dump and the diagrams name operations the same way.
 */
export function nameOf(
  operation: Function | string | null | undefined,
  slot: string,
): string | undefined {
  // `null` and not only `undefined`: a schema that went through a plain `JSON.stringify` — rather
  // than through `toJSON` — has a hole where each function was, and inside a pair an array keeps
  // that hole as `null`. Such a schema is still a schema, and reading one is this library's job.
  if (operation === undefined || operation === null) return undefined;
  if (typeof operation === "string") return operation;
  return operation.name && operation.name !== slot ? operation.name : "?";
}

/**
 * The graph: the labels, and each operation's name where one was there.
 *
 * `with`, `by` and `when` become names instead of being dropped like `JSON.stringify` would drop
 * them — a name cannot run, but it still says a rule was guarded or transformed. `when`'s
 * presence must survive even unnamed: it decides whether a rule applies, so dropping it would
 * make a dumped machine read as nondeterministic instead of conditional, and `validate` would
 * misreport a sound cell's second rule as dead.
 */
export function graph<
  T,
  Σ extends Carrier = Carrier,
  Λ extends Carrier = Carrier,
>(schema: T): Graph<IState<Nodes<T>, unknown>, Σ, Λ> {
  const out: Record<string, Record<string, unknown[]>> = {};
  for (const [q, byLetter] of Object.entries((schema ?? {}) as LooseSchema)) {
    const cells: Record<string, unknown[]> = (out[q] = {});
    for (const [σ, cell] of Object.entries(byLetter ?? {}))
      cells[σ] = (cell ?? []).map((rule) => {
        const carry = opIn(rule.to);
        const pack = opIn(rule.emit);
        const letter = nameIn(rule.emit);
        return {
          // Pair survives as a pair: a name in place of the function, nothing else.
          to:
            carry === undefined
              ? nameIn(rule.to)
              : [nameIn(rule.to), nameOf(carry, "with")],
          ...(letter !== undefined && {
            emit: pack === undefined ? letter : [letter, nameOf(pack, "by")],
          }),
          ...(rule.when !== undefined && { when: nameOf(rule.when, "when") }),
        };
      });
  }
  return out as unknown as Graph<IState<Nodes<T>, unknown>, Σ, Λ>;
}
