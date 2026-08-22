/**
 * The kernel: a machine is one object, `new StateMachine(schema, start)`, with no builder or
 * factory. `Q`, `Σ`, `Λ` are given explicitly because none can be read off the schema; naming
 * them types the machine as `StateMachine<Till, Σ, Λ>`. `dispatch(type, payload?)` advances and
 * `can(type, payload?)` asks whether it would, both from the machine's current state — there is
 * no second entry point. `toJSON` projects the schema to its graph (each operation reduced to a
 * name); `edges` and `nodes` read a schema in either form.
 */
import Channel from "@evgkch/chanjs";
import type {
  By,
  Carrier,
  IState,
  Edge,
  Graph,
  FsmEvent,
  Nodes,
  Schema,
  FsmState,
  When,
  With,
} from "./types.js";

export type {
  Schema,
  Graph,
  FsmState,
  FsmEvent,
  Carrier,
  Nodes,
  Edge,
  Rule,
  When,
  With,
  By,
  IState,
  IEvent,
  Merge,
} from "./types.js";

// Freezes every context outside production: `Readonly<Q[q]>` is compile-time only and `when`
// runs speculatively, so an in-place mutation could corrupt live state — including the
// pass-through case, where a rule with no `with` hands back the caller's own object. Gated off
// in production so it costs nothing there; the `typeof process` guard requires no bundler.
const freezing =
  typeof process === "undefined" || process.env?.NODE_ENV !== "production";
const freeze = <C>(context: C): C =>
  freezing ? (Object.freeze(context as object) as C) : context;

/**
 * One rule as the kernel reads it — the precise `Rule<…>` lives at the edges. Contexts are
 * untyped here on purpose: the kernel walks a schema without knowing its states, so each
 * context is just a value passed along; narrowing already happened where the schema was written.
 */
/** An operation as it may be found: code where the schema still has any, a name off a dump. */
type Op = ((context: never, payload: never) => unknown) | string;

/** A target or a letter: the name alone, or the name with what fills it. */
type Slot = PropertyKey | readonly [PropertyKey, Op | null];

type LooseRule = {
  // Operations are taken at their loosest here: `Readonly<C>` in the precise types rejects a
  // context that may be `void`, but here a context is only a value in transit.
  to: Slot;
  emit?: Slot;
  when?: ((context: never, payload: never) => boolean) | string;
};

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

type LooseSchema = Record<
  PropertyKey,
  Record<PropertyKey, LooseRule[] | undefined> | undefined
>;

type Guard = (context: unknown, payload: unknown) => boolean;
type Make = (context: unknown, payload: unknown) => unknown;

/**
 * A rule read once: the labels resolved, the operations in their own slots, `null` for a neutral
 * one — a name off a dump included. One class for every rule, whatever shape it was written in,
 * so the dispatch path reads one object layout however varied the schema literals were.
 */
class TightRule {
  readonly to: PropertyKey;
  readonly when: Guard | null;
  readonly make: Make | null;
  readonly emit: PropertyKey | undefined;
  readonly by: Make | null;
  constructor(rule: LooseRule) {
    this.to = nameIn(rule.to) as PropertyKey;
    this.when = typeof rule.when === "function" ? (rule.when as Guard) : null;
    const carry = opIn(rule.to);
    this.make = typeof carry === "function" ? (carry as Make) : null;
    this.emit = nameIn(rule.emit);
    const pack = opIn(rule.emit);
    this.by = typeof pack === "function" ? (pack as Make) : null;
  }
}

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

/**
 * The type behind `dispatch` and `can`: a variadic tuple union, `[type]` for an event with no
 * payload and `[type, payload]` for one that has it — one signature instead of two overloads, so
 * the editor offers every event name in one list and a wrong name is reported against the
 * concrete union of keys.
 *
 * Distributive on purpose: `keyof M` over a `Merge<…>` carrier does not reduce to a literal union
 * on its own, so distributing `K extends keyof M` is what folds each key into a literal shape —
 * `["coin"] | ["tick", { dt }]` — instead of leaving the mapped type symbolic.
 */
type Args<M extends Carrier> = keyof M extends infer K
  ? K extends keyof M
    ? void extends M[K]
      ? [type: K]
      : [type: K, payload: M[K]]
    : never
  : never;

/** The reserved channel key a `Transition` rides on. */
export const TRANSITION = Symbol("transition");

/**
 * A transition that happened — sent after every *fired* dispatch.
 *
 * `input`, `source`, `target`, `output` materialize the step: the event and state going in, the
 * state and optional event coming out, each state in full since a type name alone carries no
 * context. `at` is stamped by the machine itself, not the listener, so a run stays dated by one
 * clock regardless of which process observes it.
 */
export interface Transition<
  Q extends Carrier,
  Σ extends Carrier,
  Λ extends Carrier,
> {
  readonly input: FsmEvent<Σ>;
  readonly source: FsmState<Q>;
  readonly target: FsmState<Q>;
  readonly output?: FsmEvent<Λ>;
  /** When it fired — `Date.now()`, taken in the process the machine is running in. */
  readonly at: number;
}

/**
 * A transition erased to its four names and the time. Not `Transition<Carrier, Carrier, Carrier>`:
 * `Carrier` binds every payload to `unknown`, which the mapped `FsmEvent` reads as "carries
 * nothing" — so that instantiation would specifically mean no payloads, not any payload.
 */
export type AnyTransition = {
  readonly input: { readonly type: PropertyKey };
  readonly source: { readonly type: PropertyKey };
  readonly target: { readonly type: PropertyKey };
  readonly output?: { readonly type: PropertyKey };
  readonly at: number;
};

/**
 * The shape a generic reader of a machine needs — a logger, a recorder, a debugger — without
 * naming `Q`, `Σ`, `Λ`.
 *
 * `StateMachine<Q, Σ, Λ>` is invariant in all three, so no concrete machine is ever typed
 * `StateMachine<Carrier, Carrier, Carrier>`; a caller who needed that shape had to cast. This
 * asks only for what such a reader touches — current state, the transition channel, `can` and
 * `dispatch` — which any concrete machine satisfies structurally.
 */
export type AnyMachine = {
  readonly state: { readonly type: PropertyKey };
  readonly rx: {
    on(msg: typeof TRANSITION, hear: (t: AnyTransition) => void): Off;
  };
  can(type: PropertyKey, payload?: unknown): boolean;
  dispatch(type: PropertyKey, payload?: unknown): boolean;
  toJSON(): unknown;
};

/**
 * The channel's message map: every output event type keyed by itself, plus the reserved
 * `TRANSITION` key.
 *
 * One mapped type rather than an intersection of two, because with a generic `Λ` TS cannot prove
 * `Λ` lacks a `TRANSITION` member — an intersection would leak a phantom member into every
 * listener.
 */
type Messages<Q extends Carrier, Σ extends Carrier, Λ extends Carrier> = {
  [λ in keyof Λ | typeof TRANSITION]: λ extends typeof TRANSITION
    ? [transition: Transition<Q, Σ, Λ>]
    : [payload: Λ[λ & keyof Λ]];
};

/** Unsubscribe handle. Returns true if the listener was removed. */
export type Off = () => boolean;

/**
 * Thrown when `dispatch` is re-entered: called synchronously from inside a transition already
 * in progress, whether from a listener or from a `when`/`with`/`by` of the rule itself. Defer
 * it with `queueMicrotask` to send the event after the current transition has finished.
 */
export class DispatchInsideHandlerError extends Error {
  constructor() {
    super("nested dispatch is forbidden; use queueMicrotask");
    this.name = "DispatchInsideHandlerError";
    Object.setPrototypeOf(this, DispatchInsideHandlerError.prototype);
  }
}

/**
 * A state machine: the schema, where it currently is, and the output bus.
 *
 * `schema` is a public field so a wrapper can read it to draw or validate, operations included.
 * `Q` is a carrier (state ↦ context), so the state set is `keyof Q` and needs no parameter of
 * its own. The constructor takes the starting state as one `FsmState` value rather than two
 * arguments, since a separate state-name and context could be mismatched (`('empty', {…})`
 * naming one state but carrying another's context).
 */
export class StateMachine<
  Q extends Carrier,
  Σ extends Carrier,
  Λ extends Carrier = Σ,
> {
  #type: keyof Q;
  #context: Q[keyof Q];
  #channel?: Channel<Messages<Q, Σ, Λ>>;
  #dispatching: boolean = false;

  /** The schema as the kernel walks it — read once here; the schema is not watched afterwards. */
  #rules = new Map<PropertyKey, Map<PropertyKey, TightRule[]>>();

  /** The current state's cells, hoisted: one lookup per dispatch instead of two. */
  #cells: Map<PropertyKey, TightRule[]> | undefined;

  constructor(
    readonly schema: Schema<Q, Σ, Λ>,
    start: FsmState<Q>,
  ) {
    this.#type = start.type as keyof Q;
    this.#context = start.context as Q[keyof Q];
    const loose = schema as LooseSchema;
    // `ownKeys`, not `entries`: a state or an event may be a symbol.
    for (const q of Reflect.ownKeys(loose)) {
      const byLetter = loose[q];
      if (byLetter === undefined) continue;
      const cells = new Map<PropertyKey, TightRule[]>();
      for (const σ of Reflect.ownKeys(byLetter)) {
        const cell = byLetter[σ];
        if (cell === undefined) continue;
        cells.set(
          σ,
          cell.map((rule) => new TightRule(rule)),
        );
      }
      this.#rules.set(q, cells);
    }
    this.#cells = this.#rules.get(this.#type);
  }

  /**
   * Where the machine is: the state and the context it carries, as one value — `type` is the
   * discriminant, so narrowing it narrows `context` with it:
   *
   * ```ts
   * const at = machine.state;
   * if (at.type === 'resizing') at.context.handle;   // a field only that state has
   * ```
   *
   * The same `FsmState` shape as a `Transition`'s ends, `history`'s entries, and the constructor
   * and `restore` arguments.
   */
  get state(): FsmState<Q> {
    return { type: this.#type, context: this.#context } as FsmState<Q>;
  }

  /** The output bus. Built on first use, so a machine nobody listens to pays nothing. */
  get rx() {
    return (this.#channel ??= new Channel()).rx;
  }

  /**
   * The rule this message would fire from here, or `undefined` — the only place a guard runs.
   *
   * Search and apply are split because the search is partial (a cell may be absent, every guard
   * may refuse) while `with`/`by` are total on what it returns. `can` stops after the search;
   * `dispatch` runs both.
   */
  #rule(type: PropertyKey, payload: unknown): TightRule | undefined {
    const cell = this.#cells?.get(type);
    if (cell === undefined) return; // no cell here
    // A null `when` is a neutral one — absent, or a name off a dumped schema. It reads as ⊤,
    // so a dumped schema still runs.
    for (const rule of cell)
      if (rule.when === null || rule.when(this.#context, payload)) return rule;
    return; // every guard rejected
  }

  /**
   * Would this message fire from here? Runs the guards and nothing else; the machine does not
   * move.
   *
   * Equivalent to what the next `dispatch` of the same message would return, since `with`/`by`
   * cannot refuse a rule the guard admitted — which is why guards must be pure: asking twice must
   * give the same answer as asking once.
   */
  can(...args: Args<Σ>): boolean;
  // The rest parameter above types the pair; the fixed pair below keeps the call from
  // materializing an array on every ask.
  can(type: PropertyKey, payload?: unknown): boolean {
    return this.#rule(type, payload) !== undefined;
  }

  /**
   * Feed one event from wherever the machine now is. Returns `true` if a transition fired; a
   * dispatch that fires nothing changes and sends nothing. Operations run in order: `when`
   * decides, `with` folds the input into the context, `by` unfolds the reached context into the
   * output.
   *
   * Synchronous throughout, including notifications, so a `dispatch` called from inside this one
   * (a listener, or the rule's own `when`/`with`/`by`) would nest one transition inside another.
   * That throws `DispatchInsideHandlerError` instead of happening silently; defer with
   * `queueMicrotask` to send an event after this call returns. `can` is unaffected and stays
   * callable from inside a handler.
   */
  dispatch(...args: Args<Σ>): boolean;
  // As in `can`: the tuple types the pair, the fixed pair costs no array.
  dispatch(type: PropertyKey, payload?: unknown): boolean {
    if (this.#dispatching) throw new DispatchInsideHandlerError();

    // Held for the whole call, not just the notifications, so a `with`/`by` that dispatches is
    // caught too, not only a listener that does. Released in `finally` so a listener that throws
    // does not leave the flag raised and every later `dispatch` throwing forever.
    this.#dispatching = true;
    try {
      const rule = this.#rule(type, payload);
      if (rule === undefined) return false;

      // Where the machine stood, as values — the `source` object is built only if a
      // `TRANSITION` listener will read it.
      const fromType = this.#type;
      const fromContext = this.#context;
      // A null `make`/`by` is a neutral one — absent, or a name off a dumped schema: `id` for
      // `with`, "no payload" for `by` — the same way a null `when` reads as ⊤.
      const reached = freeze(
        rule.make === null ? this.#context : rule.make(this.#context, payload),
      ) as Q[keyof Q];

      const tx = this.#channel?.tx;
      const heard = tx !== undefined && tx.has(TRANSITION);
      // `by` always runs — a nested dispatch from it must be caught, observed or not. The event
      // object is built only where something can read it: its own listener, or `TRANSITION`'s.
      const emitted = rule.by === null ? undefined : rule.by(reached, payload);
      const told =
        rule.emit !== undefined &&
        tx !== undefined &&
        (tx.has(rule.emit as never) || heard);
      const output = !told
        ? undefined
        : ((rule.by === null
            ? { type: rule.emit }
            : { type: rule.emit, payload: emitted }) as unknown as FsmEvent<Λ>);

      this.#type = rule.to as keyof Q;
      this.#context = reached;
      this.#cells = this.#rules.get(rule.to);

      if (tx && output) {
        // The channel is keyed by event type and takes the payload as an argument, so the event
        // is taken apart again here — one shape for a value, another for a call.
        const { type: λ, payload: emitted } = output as unknown as {
          type: keyof Λ;
          payload?: unknown;
        };
        (tx.send as (k: keyof Λ, p: unknown) => boolean)(λ, emitted);
      }
      if (heard)
        (tx.send as (k: typeof TRANSITION, t: Transition<Q, Σ, Λ>) => boolean)(
          TRANSITION,
          {
            input: {
              type,
              ...(payload !== undefined && { payload }),
            } as unknown as FsmEvent<Σ>,
            source: { type: fromType, context: fromContext } as FsmState<Q>,
            target: this.state,
            output,
            at: Date.now(),
          },
        );
      return true;
    } finally {
      this.#dispatching = false;
    }
  }

  /**
   * Move to a state directly (persistence, time travel). Sends nothing.
   *
   * Takes one `FsmState` value, like the constructor — no partial restore, since half a state
   * is not a state the machine could have been in, and a separate state/context pair could
   * mismatch.
   */
  restore(start: FsmState<Q>): void {
    this.#type = start.type as keyof Q;
    this.#context = start.context as Q[keyof Q];
    this.#cells = this.#rules.get(this.#type);
  }

  /** The `JSON.stringify` hook: a machine serializes as its `graph`. */
  toJSON(): Graph<Q, Σ, Λ> {
    return graph(this.schema) as unknown as Graph<Q, Σ, Λ>;
  }
}
