/**
 * Type primitives for the machine.
 *
 * A machine is one schema: state → event type → rules. A rule is five words, one column per
 * fact:
 *
 *   | word   | kind     | what it says                                              |
 *   |--------|----------|-----------------------------------------------------------|
 *   | `to`   | label    | the target state                                          |
 *   | `with` | function | `(context, payload) => Q[to]` — the context arrived with   |
 *   | `emit` | label    | the output event type λ                                   |
 *   | `by`   | function | `(context, payload) => Λ[λ]` — that event's payload       |
 *   | `when` | function | `(context, payload) => boolean` — does this apply         |
 *
 * `to` is always required. `with` is required exactly where the target state carries something
 * the source does not, and forbidden where the target carries nothing; `by` is required exactly
 * where the emitted event carries data, forbidden where it does not — both are type errors, not
 * runtime checks.
 *
 * `toJSON` maps a schema onto `Graph`, keeping each label and replacing each function with its
 * *name* (`'?'` if none) — `JSON.stringify` alone already drops function-valued properties, so
 * this is what fills the gap. `when`'s presence must survive even unnamed: it decides whether a
 * rule applies, so dropping it would make a dumped machine read as nondeterministic instead of
 * conditional.
 *
 * `Q`, `Σ` and `Λ` are all carriers: `Σ`/`Λ` are event type ↦ payload, `Q` is state ↦ context.
 * The alphabets are `keyof Σ`/`keyof Λ`/`keyof Q`; a single element is written `q` or `σ`, and
 * `Q[q]` is the context of state `q`.
 */

/**
 * A carrier: tag ↦ what that tag carries. `Σ`/`Λ` are event type ↦ payload (set them equal for
 * a machine that can drive itself), `Q` is state ↦ context; `void` means the tag carries
 * nothing.
 *
 * Not the set of tags but the indexed family of what they carry — the tag set is `keyof` it
 * (`keyof Σ`, `keyof Q`), never the carrier itself.
 */
export type Carrier = Record<PropertyKey, unknown>;

/**
 * One entry of a carrier, written on its own: `IState<'ready', Ctx>` is `{ ready: Ctx }`. Several
 * tags may share a shape (`IState<'idle' | 'off', Ctx>`); the default `void` means the tag
 * carries nothing. Combine entries with `Merge`:
 *
 * ```ts
 * type Q = Merge<
 *   | IState<'empty'>                                  // carries nothing
 *   | IState<'ready',    { rect: Rect }>
 *   | IState<'dragging', { rect: Rect; from: Point }>
 * >;
 * // { empty: void; ready: { rect: Rect }; dragging: { rect: Rect; from: Point } }
 * ```
 *
 * A carrier is a plain map you may always write by hand; the helper only puts one tag and its
 * shape on one line.
 */
export type IState<Q extends PropertyKey, D = void> = { [q in Q]: D };

/** One entry of an input or output carrier. The same helper, named for the other axis. */
export type IEvent<T extends PropertyKey, D = void> = { [t in T]: D };

/**
 * Flatten a union of one-entry carriers into a single carrier.
 *
 * `IState<'a', X> | IState<'b', Y>` is a union of two maps, not itself a map; this takes every
 * key of every member and looks its value up in whichever member has it.
 */
export type Merge<U> = {
  [k in U extends unknown ? keyof U : never]: U extends Record<k, infer D>
    ? D
    : never;
};

/**
 * A state: its type and what it carries, together — the context belongs to the state and
 * cannot be recovered from a type name alone.
 *
 * A discriminated union rather than a pair of loose fields, so `type` narrows `context`: after
 * `if (s.type === 'dragging')` only that state's fields are in scope.
 */
export type FsmState<Q extends Carrier> = {
  [q in keyof Q]: {
    readonly type: q;
    readonly context: Readonly<Q[q]>;
  };
}[keyof Q];

/**
 * An event: which type it is, and what rides with it — `{ type: 'tick', payload: { dt: 1 } }`,
 * or `{ type: 'play' }` when it carries nothing. Same shape as `FsmState`.
 *
 * `payload` sits under its own key rather than being spread, so an event's data may itself have
 * a `type` field without colliding with the event's own `type`. `payload` is absent, not
 * `undefined`, on an event that carries nothing — `payload?: undefined` refuses a value attached
 * anyway.
 */
export type FsmEvent<M extends Carrier> = {
  [σ in keyof M]: void extends M[σ]
    ? { readonly type: σ; readonly payload?: undefined }
    : { readonly type: σ; readonly payload: M[σ] };
}[keyof M];

// ── the three operations ─────────────────────────────────────────────────────
//
// All three share the shape `(context, payload) => …`: `when` decides (the guard), `with`
// builds the context (algebra: the input folds into the state), `by` builds the output
// (coalgebra: the state unfolds into an observation). `with` sees the context before the move,
// `by` after it.
//
// Each is optional; an absent operation is its own neutral element — `⊤` for `when`, `id` for
// `with`, the unique map into the empty payload for `by`.

// Each type is named after the word it types, so a reader never has to translate one into the
// other: `when` is a `When`, `with` is a `With`, `by` is a `By`.

/** `when` — names the subset of states this rule applies to. */
export type When<C, X> = (context: Readonly<C>, payload: X) => boolean;

/**
 * `with` — the context of the state being entered, built from the one being left.
 *
 * Two context types: `From` is the source state's, `To` the target's. The target chosen by `to`
 * decides what `with` must return, so an arrival with the wrong shape does not type-check.
 */
export type With<From, To, X> = (context: Readonly<From>, payload: X) => To;

/** `by` — the emitted payload, built from the context *after* the move. */
export type By<C, X, Y> = (context: Readonly<C>, payload: X) => Y;

// ── a rule ───────────────────────────────────────────────────────────────────

/**
 * Where a rule leads: the state, and — where the state carries something — how to build it. One
 * slot rather than two siblings, since `with` builds exactly the context the state named by `to`
 * needs.
 *
 * Required, optional or forbidden, decided by the two contexts alone:
 *
 *   forbidden  the target carries nothing — a bare name
 *   optional   the source context already is a target context — carrying it over is legal
 *   required   the shapes differ — arriving means constructing the difference
 *
 * The required case guarantees a state cannot be entered without what it carries: no `blank`
 * to invent, no zero-valued placeholder standing in for its absence.
 */
type ToSlot<
  Q extends Carrier,
  q extends keyof Q,
  r extends keyof Q,
  X,
> = void extends Q[r]
  ? { readonly to: r }
  : [Readonly<Q[q]>] extends [Q[r]]
    ? { readonly to: r | readonly [r, With<Q[q], Q[r], X> | string] }
    : { readonly to: readonly [r, With<Q[q], Q[r], X> | string] };

/**
 * One rule: where it leads, and what it computes on the way.
 *
 * A distributed conditional over `keyof Q`: `to` picks a state and that state decides what
 * `with` must return; the same trick over `emit` makes `by` forbidden without an `emit`,
 * forbidden on an event with no payload, and mandatory (returning `Λ[λ]`) on one that has it.
 *
 * A name is admitted wherever a function is — what `toJSON` leaves behind — and reads as the
 * neutral element at run time, so a dumped schema still runs.
 */
export type Rule<Q extends Carrier, q extends keyof Q, X, Λ extends Carrier> = {
  [r in keyof Q]: {
    /**
     * The guard, or its name — what `toJSON` leaves behind. Never write a string here
     * yourself: it means the guard's code is not carried, and at run time reads as ⊤.
     */
    readonly when?: When<Q[q], X> | string;
  } & ToSlot<Q, q, r, X> &
    (
      | { readonly emit?: never }
      | {
          [λ in keyof Λ]: void extends Λ[λ]
            ? { readonly emit: λ }
            : { readonly emit: readonly [λ, By<Q[r], X, Λ[λ]> | string] };
        }[keyof Λ]
    );
}[keyof Q];

/**
 * The machine: state → event type → rules.
 *
 * Indexed by state first: one entry is one state and everything it accepts, so a rule at one
 * coordinate knows its source context (`Q[q]`) and payload (`Σ[σ]`) exactly.
 *
 * The rules at one (state, event) are called a *cell* in the docs and in `validate`'s messages,
 * but there is no `Cell` type — it would only alias `readonly Rule<…>[]`. The list is always a
 * list, even of one: a single-rule shorthand used to cost every consumer a branch.
 *
 * Two rules may share a target — each carries its own guard, so `[{ when: p, to: ['x', a] },
 * { when: q, to: ['x', b] }]` is two distinct rules, not a collision. A rule is addressed only
 * by its position in the list.
 */
export type Schema<Q extends Carrier, Σ extends Carrier, Λ extends Carrier> = {
  readonly [q in keyof Q]?: {
    readonly [σ in keyof Σ]?: readonly Rule<Q, q, Σ[σ], Λ>[];
  };
};

/**
 * The graph alone: `Schema` with the three functions replaced by strings (`?` where the author
 * gave none), so a diagram or rule line can still say "guarded by `short`" rather than just
 * "guarded". A pair stays a pair: `["ready", "grab"]`, the name where the function stood.
 *
 * A `Graph` still constructs and runs — a name is admitted wherever a function is — but it no
 * longer computes the difference: a named `with` carries the context over unchanged and a named
 * `by` attaches no payload. Rendering and analysis take either form the same way, reading labels
 * and names, never code.
 */
export type Graph<Q extends Carrier, Σ extends Carrier, Λ extends Carrier> = {
  readonly [q in keyof Q]?: {
    readonly [σ in keyof Σ]?: readonly {
      readonly to: keyof Q | readonly [keyof Q, string];
      readonly emit?: keyof Λ | readonly [keyof Λ, string];
      readonly when?: string;
    }[];
  };
};

/**
 * One row of the transition relation — a cell flattened into a standalone edge, as an element of
 * keyof Q × keyof Σ × (keyof Λ ∪ {ε}) × keyof Q. `from` and `on` are the rule's two coordinates
 * added in front; nothing else changes, and the same three words (`from`, `on`, `to`) are what
 * `toRules` prints.
 *
 * Operations ride along as functions where the schema still carries code, or as names (or `?`)
 * off a dump — `nameOf` turns either into a printable string. Testing `when` for presence answers
 * "is this edge guarded" the same way in both forms.
 */
export type Edge<N extends PropertyKey = PropertyKey> = {
  readonly from: N;
  readonly on: PropertyKey;
  readonly to: N;
  readonly emit?: PropertyKey;
  readonly when?: Function | string;
  readonly with?: Function | string;
  readonly by?: Function | string;
};

// ── reading the states back off a schema ──────────────────────────────────────

/**
 * Every state a rule of this cell can lead to.
 *
 * A target is a name or a [name, carrier] pair, so this looks through the pair: its first
 * element is the state, same as the bare form.
 */
export type EdgeNodes<C> = C extends readonly (infer E)[]
  ? E extends { to: infer R }
    ? R extends readonly [infer N, unknown]
      ? N
      : R
    : never
  : never;

/**
 * Q — every state a schema names, as a key or as some rule's target.
 *
 * Intersected with `PropertyKey` to drop the `undefined` an optional cell leaks in: `T[q]` is
 * `… | undefined`, and `keyof` through it would otherwise put `undefined` in the node set.
 */
export type Nodes<T> = (
  | keyof T
  | {
      [q in keyof T]: { [σ in keyof T[q]]: EdgeNodes<T[q][σ]> }[keyof T[q]];
    }[keyof T]
) &
  PropertyKey;

// No `Accepts<T, q>` / `Reached<T, σ, q>` here: they typed a transition chain like Rust's
// typestate, but only paid off when the event type was known at compile time. An event arrives
// from a handler at run time, so what is left is `can(type, payload?)`.
