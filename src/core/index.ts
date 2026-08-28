/**
 * The kernel: a machine is one object, `new StateMachine(schema, start)`, with no builder or
 * factory. `Q`, `Σ`, `Λ` are given explicitly because none can be read off the schema; naming
 * them types the machine as `StateMachine<Till, Σ, Λ>`. `dispatch(type, payload?)` advances and
 * `can(type, payload?)` asks whether it would, both from the machine's current state — there is
 * no second entry point. `toJSON` projects the schema to its graph (each operation reduced to a
 * name); `edges` and `nodes` read a schema in either form.
 */
import Channel from "@evgkch/chanjs";
import {
  BusyError,
  UnhandledError,
  RejectedError,
  TerminalError,
} from "./errors.js";
import type { MachineError } from "./errors.js";
import { Result } from "./result.js";
import { graph, nameIn, opIn } from "./utils.js";
import type { LooseRule, LooseSchema } from "./utils.js";
import type { Carrier, Graph, FsmEvent, Schema, FsmState } from "./types.js";

export * from "./errors.js";
export { Result } from "./result.js";
export { edges, graph, nameIn, nameOf, nodes, opIn } from "./utils.js";
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
  can(type: PropertyKey, payload?: unknown): Verdict;
  dispatch(type: PropertyKey, payload?: unknown): Verdict;
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

// ── the dispatch verdict ─────────────────────────────────────────────────────

/**
 * What `dispatch` and `can` answer: the `Ok` branch — the transition fired (for `can`: would
 * fire) — or the `Err` branch carrying the systemic reason. `true` rather than a target state or
 * a transition on the `Ok` branch: `can` runs the guards and nothing else, so the only thing both
 * asks can honestly report is that the answer is yes.
 *
 * Exactly five instances exist — `OK`, `UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` — so no call
 * allocates, and a verdict may be compared by identity as well as read by branch. Each is typed
 * as the branch it is, so `UNHANDLED.error` is reachable without a guard.
 */
export type Verdict = Result<true, MachineError>;

/** The transition fired; for `can` — it would. */
export const OK = Result.ok<true, MachineError>(true);
/** No cell for the event in the current state. */
export const UNHANDLED = Result.error<MachineError, true>(
  Object.freeze(new UnhandledError()),
);
/** Every guard refused the event with this payload. */
export const REJECTED = Result.error<MachineError, true>(
  Object.freeze(new RejectedError()),
);
/** The state is terminal: nothing will ever fire from it. */
export const TERMINAL = Result.error<MachineError, true>(
  Object.freeze(new TerminalError()),
);
/** A `dispatch` nested inside a running one: the outer transition is still executing. */
export const BUSY = Result.error<MachineError, true>(
  Object.freeze(new BusyError()),
);

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
   * The rule this message would fire from here, or the verdict that says why none would — the
   * only place a guard runs. Three refusals are told apart: `TERMINAL` — the state has no cells
   * at all; `UNHANDLED` — no cell for this event; `REJECTED` — every guard said no.
   *
   * Search and apply are split because the search is partial while `with`/`by` are total on what
   * it returns. `can` stops after the search; `dispatch` runs both.
   */
  #rule(type: PropertyKey, payload: unknown): TightRule | Verdict {
    const cells = this.#cells;
    if (cells === undefined || cells.size === 0) return TERMINAL;
    const cell = cells.get(type);
    if (cell === undefined || cell.length === 0) return UNHANDLED;
    // A null `when` is a neutral one — absent, or a name off a dumped schema. It reads as ⊤,
    // so a dumped schema still runs.
    for (const rule of cell)
      if (rule.when === null || rule.when(this.#context, payload)) return rule;
    return REJECTED;
  }

  /**
   * Would this message fire from here? Runs the guards and nothing else; the machine does not
   * move.
   *
   * Answers the same verdict the next `dispatch` of the same message would, since `with`/`by`
   * cannot refuse a rule the guard admitted — which is why guards must be pure: asking twice must
   * give the same answer as asking once.
   */
  can(...args: Args<Σ>): Verdict;
  // The rest parameter above types the pair; the fixed pair below keeps the call from
  // materializing an array on every ask.
  can(type: PropertyKey, payload?: unknown): Verdict {
    const found = this.#rule(type, payload);
    return found instanceof TightRule ? OK : found;
  }

  /**
   * Feed one event from wherever the machine now is. Answers `OK` when a transition fired;
   * otherwise the verdict names the reason (`UNHANDLED`, `REJECTED`, `TERMINAL`), and nothing
   * changes and nothing is sent. Operations run in order: `when` decides, `with` folds the input
   * into the context, `by` unfolds the reached context into the output.
   *
   * Synchronous throughout, including notifications, so a `dispatch` called from inside this one
   * (a listener, or the rule's own `when`/`with`/`by`) would nest one transition inside another.
   * The nested call answers `BUSY` and does nothing; defer with `queueMicrotask` to send an
   * event after this call returns. `can` is unaffected and stays callable from inside a handler.
   */
  dispatch(...args: Args<Σ>): Verdict;
  // As in `can`: the tuple types the pair, the fixed pair costs no array.
  dispatch(type: PropertyKey, payload?: unknown): Verdict {
    if (this.#dispatching) return BUSY;

    // Held for the whole call, not just the notifications, so a `with`/`by` that dispatches is
    // refused too, not only a listener that does. Released in `finally` so a listener that throws
    // does not leave the flag raised and every later `dispatch` answering `BUSY` forever.
    this.#dispatching = true;
    try {
      const rule = this.#rule(type, payload);
      if (!(rule instanceof TightRule)) return rule;

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
      // `by` always runs — a nested dispatch from it must be refused, observed or not. The event
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
      return OK;
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
