/**
 * Debug layer (opt-in via `machjs/debug`).
 *
 * Runtime observation built on the machine's reserved `Transition`, sent after every *fired*
 * dispatch: logging, runtime invariants, time-travel history. The machine builds the value only
 * while `TRANSITION` has a listener, so an unobserved machine pays nothing; a dispatch that
 * fires nothing sends nothing.
 *
 * Three exports, one per question: `log` — what is happening; `invariant` — has a property of
 * the context broken; `history` — how to go back. Formatting is a separate concern — `rules`
 * wraps a sink into one handed pre-formatted lines, and `log` takes any sink, with `rules()` as
 * the default.
 *
 * `can` is not covered: it asks the guards a question and answers the caller, so nothing
 * observable happens.
 */
import Channel from "@evgkch/chanjs";
import { TRANSITION } from "../core/index.js";
import { LABELS, writer } from "../formatters/words.js";
/**
 * A transition read as a row of the transition relation — internal.
 *
 * A transition already carries all four labels (from, on, to, emit); this only renames them
 * into an `Edge`, which lets the same word writer print both the schema and the run. Not
 * exported: a formatter takes a schema, and an `Edge` on its own has nowhere to go.
 */
function asEdge(t) {
    return {
        from: t.source.type,
        on: t.input.type,
        to: t.target.type,
        ...(t.output && { emit: t.output.type }),
    };
}
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
export function log(fsm, sink = rules()) {
    return fsm.rx.on(TRANSITION, sink);
}
/**
 * Wrap a sink so it is handed each transition already written as one line — a `log` sink.
 *
 * The line uses four of the seven words `toRules` prints for a schema — the ones a transition
 * can fill on its own — so formatting a transition needs no machine or schema. The wrapped sink
 * still gets the whole transition beside the line, so a sink that wants the payloads reads them
 * off the value rather than parsing the text. With no sink of its own it prints, which is what
 * `rules()` gives plain `log(fsm)`.
 */
export function rules(sink = console.log) {
    return (t) => sink(formatTransition(t), t);
}
/**
 * One transition as a rule — internal.
 *
 * Columns are sized by the row itself, so a line stands alone rather than lining up against the
 * rest of the machine. Not exported: the two callers that need a line, `rules` and `invariant`'s
 * `onViolation` message, are both here.
 */
function formatTransition(t) {
    const row = asEdge(t);
    return writer([row], LABELS)(row);
}
/**
 * Assert a property of the context after every fired transition. Returns an unsubscribe handle.
 * On violation calls `onViolation` if given, otherwise throws.
 *
 * `onViolation` gets the offending transition and the same line the default message would have
 * carried, so a custom handler reports it the way the library does without formatting anything
 * itself.
 */
export function invariant(fsm, check, onViolation) {
    return fsm.rx.on(TRANSITION, (t) => {
        if (check(t.target.context, t))
            return;
        const line = formatTransition(t);
        if (onViolation)
            onViolation(t, line);
        else
            throw new Error(`fsm invariant violated: ${line}`);
    });
}
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
export function history(fsm, opts) {
    const maxSize = opts?.maxSize !== undefined ? Math.max(1, opts.maxSize) : undefined;
    const states = [fsm.state];
    const said = new Channel();
    let index = 0;
    // `restore` does not dispatch, so it never sends a `Transition` and never re-enters this.
    const off = fsm.rx.on(TRANSITION, (t) => {
        states.length = index + 1; // drop any redo future
        states.push(t.target);
        index = states.length - 1;
        if (maxSize !== undefined && states.length > maxSize) {
            const excess = states.length - maxSize;
            states.splice(0, excess); // drop oldest to keep the buffer bounded
            index -= excess;
        }
    });
    const go = (i) => {
        if (i < 0 || i >= states.length)
            return false;
        index = i;
        fsm.restore(states[i]);
        said.tx.send("moved", i);
        return true;
    };
    return {
        rx: said.rx,
        get states() {
            return states;
        },
        get index() {
            return index;
        },
        get canUndo() {
            return index > 0;
        },
        get canRedo() {
            return index < states.length - 1;
        },
        undo: () => go(index - 1),
        redo: () => go(index + 1),
        jump: go,
        stop: () => {
            off();
            said.clear();
        },
    };
}
