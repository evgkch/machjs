/**
 * The kernel: a machine is one object, `new StateMachine(schema, start)`, with no builder or
 * factory. `Q`, `Σ`, `Λ` are given explicitly because none can be read off the schema; naming
 * them types the machine as `StateMachine<Till, Σ, Λ>`. `dispatch(type, payload?)` advances and
 * `can(type, payload?)` asks whether it would, both from the machine's current state — there is
 * no second entry point. `toJSON` projects the schema to its graph (each operation reduced to a
 * name); `edges` and `nodes` read a schema in either form.
 */
import Channel from "@evgkch/chanjs";
import { BusyError, UnhandledError, RejectedError, TerminalError, } from "./errors.js";
import { graph, nameIn, opIn } from "./utils.js";
export * from "./errors.js";
export { edges, graph, nameIn, nameOf, nodes, opIn } from "./utils.js";
// Freezes every context outside production: `Readonly<Q[q]>` is compile-time only and `when`
// runs speculatively, so an in-place mutation could corrupt live state — including the
// pass-through case, where a rule with no `with` hands back the caller's own object. Gated off
// in production so it costs nothing there; the `typeof process` guard requires no bundler.
const freezing = typeof process === "undefined" || process.env?.NODE_ENV !== "production";
const freeze = (context) => freezing ? Object.freeze(context) : context;
/**
 * A rule read once: the labels resolved, the operations in their own slots, `null` for a neutral
 * one — a name off a dump included. One class for every rule, whatever shape it was written in,
 * so the dispatch path reads one object layout however varied the schema literals were.
 */
class TightRule {
    to;
    when;
    make;
    emit;
    by;
    constructor(rule) {
        this.to = nameIn(rule.to);
        this.when = typeof rule.when === "function" ? rule.when : null;
        const carry = opIn(rule.to);
        this.make = typeof carry === "function" ? carry : null;
        this.emit = nameIn(rule.emit);
        const pack = opIn(rule.emit);
        this.by = typeof pack === "function" ? pack : null;
    }
}
/** The reserved channel key a `Transition` rides on. */
export const TRANSITION = Symbol("transition");
/** The transition fired; for `can` — it would. */
export const OK = Object.freeze({ ok: true });
/** No cell for the event in the current state. */
export const UNHANDLED = Object.freeze({
    ok: false,
    error: Object.freeze(new UnhandledError()),
});
/** Every guard refused the event with this payload. */
export const REJECTED = Object.freeze({
    ok: false,
    error: Object.freeze(new RejectedError()),
});
/** The state is terminal: nothing will ever fire from it. */
export const TERMINAL = Object.freeze({
    ok: false,
    error: Object.freeze(new TerminalError()),
});
/** A `dispatch` nested inside a running one: the outer transition is still executing. */
export const BUSY = Object.freeze({
    ok: false,
    error: Object.freeze(new BusyError()),
});
/**
 * A state machine: the schema, where it currently is, and the output bus.
 *
 * `schema` is a public field so a wrapper can read it to draw or validate, operations included.
 * `Q` is a carrier (state ↦ context), so the state set is `keyof Q` and needs no parameter of
 * its own. The constructor takes the starting state as one `FsmState` value rather than two
 * arguments, since a separate state-name and context could be mismatched (`('empty', {…})`
 * naming one state but carrying another's context).
 */
export class StateMachine {
    schema;
    #type;
    #context;
    #channel;
    #dispatching = false;
    /** The schema as the kernel walks it — read once here; the schema is not watched afterwards. */
    #rules = new Map();
    /** The current state's cells, hoisted: one lookup per dispatch instead of two. */
    #cells;
    constructor(schema, start) {
        this.schema = schema;
        this.#type = start.type;
        this.#context = start.context;
        const loose = schema;
        // `ownKeys`, not `entries`: a state or an event may be a symbol.
        for (const q of Reflect.ownKeys(loose)) {
            const byLetter = loose[q];
            if (byLetter === undefined)
                continue;
            const cells = new Map();
            for (const σ of Reflect.ownKeys(byLetter)) {
                const cell = byLetter[σ];
                if (cell === undefined)
                    continue;
                cells.set(σ, cell.map((rule) => new TightRule(rule)));
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
    get state() {
        return { type: this.#type, context: this.#context };
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
    #rule(type, payload) {
        const cells = this.#cells;
        if (cells === undefined || cells.size === 0)
            return TERMINAL;
        const cell = cells.get(type);
        if (cell === undefined || cell.length === 0)
            return UNHANDLED;
        // A null `when` is a neutral one — absent, or a name off a dumped schema. It reads as ⊤,
        // so a dumped schema still runs.
        for (const rule of cell)
            if (rule.when === null || rule.when(this.#context, payload))
                return rule;
        return REJECTED;
    }
    // The rest parameter above types the pair; the fixed pair below keeps the call from
    // materializing an array on every ask.
    can(type, payload) {
        const found = this.#rule(type, payload);
        return found instanceof TightRule ? OK : found;
    }
    // As in `can`: the tuple types the pair, the fixed pair costs no array.
    dispatch(type, payload) {
        if (this.#dispatching)
            return BUSY;
        // Held for the whole call, not just the notifications, so a `with`/`by` that dispatches is
        // refused too, not only a listener that does. Released in `finally` so a listener that throws
        // does not leave the flag raised and every later `dispatch` answering `BUSY` forever.
        this.#dispatching = true;
        try {
            const rule = this.#rule(type, payload);
            if (!(rule instanceof TightRule))
                return rule;
            // Where the machine stood, as values — the `source` object is built only if a
            // `TRANSITION` listener will read it.
            const fromType = this.#type;
            const fromContext = this.#context;
            // A null `make`/`by` is a neutral one — absent, or a name off a dumped schema: `id` for
            // `with`, "no payload" for `by` — the same way a null `when` reads as ⊤.
            const reached = freeze(rule.make === null ? this.#context : rule.make(this.#context, payload));
            const tx = this.#channel?.tx;
            const heard = tx !== undefined && tx.has(TRANSITION);
            // `by` always runs — a nested dispatch from it must be refused, observed or not. The event
            // object is built only where something can read it: its own listener, or `TRANSITION`'s.
            const emitted = rule.by === null ? undefined : rule.by(reached, payload);
            const told = rule.emit !== undefined &&
                tx !== undefined &&
                (tx.has(rule.emit) || heard);
            const output = !told
                ? undefined
                : (rule.by === null
                    ? { type: rule.emit }
                    : { type: rule.emit, payload: emitted });
            this.#type = rule.to;
            this.#context = reached;
            this.#cells = this.#rules.get(rule.to);
            if (tx && output) {
                // The channel is keyed by event type and takes the payload as an argument, so the event
                // is taken apart again here — one shape for a value, another for a call.
                const { type: λ, payload: emitted } = output;
                tx.send(λ, emitted);
            }
            if (heard)
                tx.send(TRANSITION, {
                    input: {
                        type,
                        ...(payload !== undefined && { payload }),
                    },
                    source: { type: fromType, context: fromContext },
                    target: this.state,
                    output,
                    at: Date.now(),
                });
            return OK;
        }
        finally {
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
    restore(start) {
        this.#type = start.type;
        this.#context = start.context;
        this.#cells = this.#rules.get(this.#type);
    }
    /** The `JSON.stringify` hook: a machine serializes as its `graph`. */
    toJSON() {
        return graph(this.schema);
    }
}
