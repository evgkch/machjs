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
    to: Slot;
    emit?: Slot;
    when?: ((context: never, payload: never) => boolean) | string;
};
export type LooseSchema = Record<PropertyKey, Record<PropertyKey, LooseRule[] | undefined> | undefined>;
export declare const nameIn: (slot: Slot | undefined) => PropertyKey | undefined;
export declare const opIn: (slot: Slot | undefined) => Op | undefined;
/**
 * Flatten a schema into the transition relation: one `Edge` per rule, in schema order, each row
 * the rule itself with its `from`/`on` coordinates in front. Operations ride along as functions,
 * or are absent on a schema loaded from JSON.
 */
export declare function edges<T>(schema: T): Edge<Nodes<T>>[];
/**
 * Every state the schema names: its own keys, plus every target some rule leads to.
 *
 * Reads the schema's keys directly rather than only `edges`, because a state written with an
 * empty cell (`ghost: {}`) has no rows and would otherwise be missed.
 */
export declare function nodes<T>(schema: T): Nodes<T>[];
/**
 * Name an operation: its own function name, or a name already read off a dump, passed through
 * unchanged. Falls back to `?` when there is nothing to show.
 *
 * `slot` discounts the property name JS assigns an anonymous arrow (`{ when: () => {} }.when.name`
 * is `"when"`, not `""`) — without it every anonymous guard would misreport as one named "when".
 * Exported for `machjs/formatters`, so the dump and the diagrams name operations the same way.
 */
export declare function nameOf(operation: Function | string | null | undefined, slot: string): string | undefined;
/**
 * The graph: the labels, and each operation's name where one was there.
 *
 * `with`, `by` and `when` become names instead of being dropped like `JSON.stringify` would drop
 * them — a name cannot run, but it still says a rule was guarded or transformed. `when`'s
 * presence must survive even unnamed: it decides whether a rule applies, so dropping it would
 * make a dumped machine read as nondeterministic instead of conditional, and `validate` would
 * misreport a sound cell's second rule as dead.
 */
export declare function graph<T, Σ extends Carrier = Carrier, Λ extends Carrier = Carrier>(schema: T): Graph<IState<Nodes<T>, unknown>, Σ, Λ>;
