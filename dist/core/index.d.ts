import type { Carrier, IState, Edge, Graph, FsmEvent, Nodes, Schema, FsmState } from "./types.js";
export type { Schema, Graph, FsmState, FsmEvent, Carrier, Nodes, Edge, Rule, When, With, By, IState, IEvent, Merge, } from "./types.js";
/**
 * One rule as the kernel reads it — the precise `Rule<…>` lives at the edges. Contexts are
 * untyped here on purpose: the kernel walks a schema without knowing its states, so each
 * context is just a value passed along; narrowing already happened where the schema was written.
 */
/** An operation as it may be found: code where the schema still has any, a name off a dump. */
type Op = ((context: never, payload: never) => unknown) | string;
/** A target or a letter: the name alone, or the name with what fills it. */
type Slot = PropertyKey | readonly [PropertyKey, Op | null];
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
type Args<M extends Carrier> = keyof M extends infer K ? K extends keyof M ? void extends M[K] ? [type: K] : [type: K, payload: M[K]] : never : never;
/** The reserved channel key a `Transition` rides on. */
export declare const TRANSITION: unique symbol;
/**
 * A transition that happened — sent after every *fired* dispatch.
 *
 * `input`, `source`, `target`, `output` materialize the step: the event and state going in, the
 * state and optional event coming out, each state in full since a type name alone carries no
 * context. `at` is stamped by the machine itself, not the listener, so a run stays dated by one
 * clock regardless of which process observes it.
 */
export interface Transition<Q extends Carrier, Σ extends Carrier, Λ extends Carrier> {
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
    readonly input: {
        readonly type: PropertyKey;
    };
    readonly source: {
        readonly type: PropertyKey;
    };
    readonly target: {
        readonly type: PropertyKey;
    };
    readonly output?: {
        readonly type: PropertyKey;
    };
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
    readonly state: {
        readonly type: PropertyKey;
    };
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
    [λ in keyof Λ | typeof TRANSITION]: λ extends typeof TRANSITION ? [transition: Transition<Q, Σ, Λ>] : [payload: Λ[λ & keyof Λ]];
};
/** Unsubscribe handle. Returns true if the listener was removed. */
export type Off = () => boolean;
/**
 * Thrown when `dispatch` is re-entered: called synchronously from inside a transition already
 * in progress, whether from a listener or from a `when`/`with`/`by` of the rule itself. Defer
 * it with `queueMicrotask` to send the event after the current transition has finished.
 */
export declare class DispatchInsideHandlerError extends Error {
    constructor();
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
export declare class StateMachine<Q extends Carrier, Σ extends Carrier, Λ extends Carrier = Σ> {
    #private;
    readonly schema: Schema<Q, Σ, Λ>;
    constructor(schema: Schema<Q, Σ, Λ>, start: FsmState<Q>);
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
    get state(): FsmState<Q>;
    /** The output bus. Built on first use, so a machine nobody listens to pays nothing. */
    get rx(): import("@evgkch/chanjs").Rx<Messages<Q, Σ, Λ>>;
    /**
     * Would this message fire from here? Runs the guards and nothing else; the machine does not
     * move.
     *
     * Equivalent to what the next `dispatch` of the same message would return, since `with`/`by`
     * cannot refuse a rule the guard admitted — which is why guards must be pure: asking twice must
     * give the same answer as asking once.
     */
    can(...args: Args<Σ>): boolean;
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
    /**
     * Move to a state directly (persistence, time travel). Sends nothing.
     *
     * Takes one `FsmState` value, like the constructor — no partial restore, since half a state
     * is not a state the machine could have been in, and a separate state/context pair could
     * mismatch.
     */
    restore(start: FsmState<Q>): void;
    /** The `JSON.stringify` hook: a machine serializes as its `graph`. */
    toJSON(): Graph<Q, Σ, Λ>;
}
