import type { Off, StateMachine, Transition } from "../core/index.js";
import type { Carrier } from "../core/types.js";
import type { History } from "./types.js";
export type { History } from "./types.js";
/**
 * Subscribe to a machine's transitions. Returns an unsubscribe handle.
 *
 * `sink` gets the whole `Transition` and nothing else: print it, filter it, count it, ship it.
 * Reacting to every output type at once — something `rx.on` cannot do, since it wants one type —
 * is a conditional in the sink:
 *
 * ```ts
 * log(fsm, t => { if (t.output) send(t.output); });
 * ```
 *
 * A formatted log is a sink wrapped in a formatter:
 *
 * ```ts
 * log(fsm, rules(line => file.write(line + '\n')));
 * ```
 *
 * The default sink is `rules()`, so `log(fsm)` prints a line per transition unless a different
 * sink is passed.
 */
export declare function log<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(fsm: StateMachine<Q, Σ, Λ>, sink?: (transition: Transition<Q, Σ, Λ>) => void): Off;
/**
 * Wrap a sink so it is handed each transition already written as one line — a `log` sink.
 *
 * The line uses four of the seven words `toRules` prints for a schema — the ones a transition
 * can fill on its own — so formatting a transition needs no machine or schema. The wrapped sink
 * still gets the whole transition beside the line, so a sink that wants the payloads reads them
 * off the value rather than parsing the text. With no sink of its own it prints, which is what
 * `rules()` gives plain `log(fsm)`.
 */
export declare function rules<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(sink?: (line: string, transition: Transition<Q, Σ, Λ>) => void): (transition: Transition<Q, Σ, Λ>) => void;
/**
 * Assert a property of the context after every fired transition. Returns an unsubscribe handle.
 * On violation calls `onViolation` if given, otherwise throws.
 *
 * `onViolation` gets the offending transition and the same line the default message would have
 * carried, so a custom handler reports it the way the library does without formatting anything
 * itself.
 */
export declare function invariant<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(fsm: StateMachine<Q, Σ, Λ>, check: (context: Readonly<Q[keyof Q]>, transition: Transition<Q, Σ, Λ>) => boolean, onViolation?: (transition: Transition<Q, Σ, Λ>, line: string) => void): Off;
/**
 * Record a machine's states for undo/redo/jump.
 *
 * Records the state after every fired transition; navigation replays nothing, since a
 * `Transition` already carries its target — recording is a push, restoring is one `fsm.restore`,
 * both O(1). Dispatching after an undo truncates the redo future. Pass `{ maxSize }` (≥ 1) to cap
 * the buffer: once full it drops the oldest entry, so undo then reaches back only `maxSize`
 * transitions.
 *
 * `restore` itself publishes nothing, so `rx` is what tells every reader a move happened —
 * without it, each caller of `jump` would have to announce the move itself.
 */
export declare function history<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(fsm: StateMachine<Q, Σ, Λ>, opts?: {
    maxSize?: number;
}): History<Q>;
