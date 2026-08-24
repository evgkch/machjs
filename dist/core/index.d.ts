import type { Carrier, Graph, FsmEvent, Schema, FsmState } from "./types.js";
export * from "./errors.js";
export { edges, graph, nameIn, nameOf, nodes, opIn } from "./utils.js";
export type { Schema, Graph, FsmState, FsmEvent, Carrier, Nodes, Edge, Rule, When, With, By, IState, IEvent, Merge, } from "./types.js";
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
    [λ in keyof Λ | typeof TRANSITION]: λ extends typeof TRANSITION ? [transition: Transition<Q, Σ, Λ>] : [payload: Λ[λ & keyof Λ]];
};
/** Unsubscribe handle. Returns true if the listener was removed. */
export type Off = () => boolean;
/**
 * What `dispatch` and `can` answer: `ok: true` — the transition fired (for `can`: would fire);
 * `ok: false` carries the systemic reason. Exactly five frozen instances exist — `OK`,
 * `UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` — so no call allocates, and a verdict may be
 * compared by identity as well as read by field.
 */
export type Verdict = {
    readonly ok: true;
    readonly error?: undefined;
} | {
    readonly ok: false;
    readonly error: Error;
};
/** The transition fired; for `can` — it would. */
export declare const OK: Verdict;
/** No cell for the event in the current state. */
export declare const UNHANDLED: Verdict;
/** Every guard refused the event with this payload. */
export declare const REJECTED: Verdict;
/** The state is terminal: nothing will ever fire from it. */
export declare const TERMINAL: Verdict;
/** A `dispatch` nested inside a running one: the outer transition is still executing. */
export declare const BUSY: Verdict;
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
     * Answers the same verdict the next `dispatch` of the same message would, since `with`/`by`
     * cannot refuse a rule the guard admitted — which is why guards must be pure: asking twice must
     * give the same answer as asking once.
     */
    can(...args: Args<Σ>): Verdict;
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
