/**
 * The kernel: a machine is one object, `new StateMachine(schema, start)`, with no builder or
 * factory. `Q`, `Σ`, `Λ` are given explicitly because none can be read off the schema; naming
 * them types the machine as `StateMachine<Till, Σ, Λ>`. `dispatch(type, payload?)` advances and
 * `can(type, payload?)` asks whether it would, both from the machine's current state — there is
 * no second entry point. `toJSON` projects the schema to its graph (each operation reduced to a
 * name); `edges` and `nodes` read a schema in either form.
 */
import Channel from "@evgkch/chanjs";
// Freezes every context outside production: `Readonly<Q[q]>` is compile-time only and `when`
// runs speculatively, so an in-place mutation could corrupt live state — including the
// pass-through case, where a rule with no `with` hands back the caller's own object. Gated off
// in production so it costs nothing there; the `typeof process` guard requires no bundler.
const freezing = typeof process === "undefined" || process.env?.NODE_ENV !== "production";
const freeze = (context) => freezing ? Object.freeze(context) : context;
/**
 * The two halves of a slot — the only place that reads whether a slot is a bare name or a
 * [name, operation] pair. `edges` and `dispatch` both go through this rather than branching on
 * the shape themselves.
 */
const isPair = (slot) => slot !== undefined && Array.isArray(slot);
export const nameIn = (slot) => isPair(slot) ? slot[0] : slot;
export const opIn = (slot) => {
    if (!isPair(slot))
        return undefined;
    // Same reason as in `nameOf`: a pair off a plain `stringify` is `["ready", null]`, and a null
    // carrier is no carrier — not a carrier that crashes whoever asks it its name.
    return slot[1] ?? undefined;
};
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
/**
 * Flatten a schema into the transition relation: one `Edge` per rule, in schema order, each row
 * the rule itself with its `from`/`on` coordinates in front. Operations ride along as functions,
 * or are absent on a schema loaded from JSON.
 */
export function edges(schema) {
    const rows = [];
    for (const [from, byLetter] of Object.entries((schema ?? {})))
        for (const [on, cell] of Object.entries(byLetter ?? {}))
            for (const rule of cell ?? [])
                // Target and carrier come apart into flat fields here.
                rows.push({
                    ...(rule.when !== undefined && { when: rule.when }),
                    from: from,
                    on,
                    to: nameIn(rule.to),
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
export function nodes(schema) {
    const found = new Set(Object.keys((schema ?? {})));
    for (const row of edges(schema))
        found.add(row.to);
    return [...found];
}
/**
 * Name an operation: its own function name, or a name already read off a dump, passed through
 * unchanged. Falls back to `?` when there is nothing to show.
 *
 * `slot` discounts the property name JS assigns an anonymous arrow (`{ when: () => {} }.when.name`
 * is `"when"`, not `""`) — without it every anonymous guard would misreport as one named "when".
 * Exported for `machjs/formatters`, so the dump and the diagrams name operations the same way.
 */
export function nameOf(operation, slot) {
    // `null` and not only `undefined`: a schema that went through a plain `JSON.stringify` — rather
    // than through `toJSON` — has a hole where each function was, and inside a pair an array keeps
    // that hole as `null`. Such a schema is still a schema, and reading one is this library's job.
    if (operation === undefined || operation === null)
        return undefined;
    if (typeof operation === "string")
        return operation;
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
export function graph(schema) {
    const out = {};
    for (const [q, byLetter] of Object.entries((schema ?? {}))) {
        const cells = (out[q] = {});
        for (const [σ, cell] of Object.entries(byLetter ?? {}))
            cells[σ] = (cell ?? []).map((rule) => {
                const carry = opIn(rule.to);
                const pack = opIn(rule.emit);
                const letter = nameIn(rule.emit);
                return {
                    // Pair survives as a pair: a name in place of the function, nothing else.
                    to: carry === undefined
                        ? nameIn(rule.to)
                        : [nameIn(rule.to), nameOf(carry, "with")],
                    ...(letter !== undefined && {
                        emit: pack === undefined ? letter : [letter, nameOf(pack, "by")],
                    }),
                    ...(rule.when !== undefined && { when: nameOf(rule.when, "when") }),
                };
            });
    }
    return out;
}
/** The reserved channel key a `Transition` rides on. */
export const TRANSITION = Symbol("transition");
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
     * The rule this message would fire from here, or `undefined` — the only place a guard runs.
     *
     * Search and apply are split because the search is partial (a cell may be absent, every guard
     * may refuse) while `with`/`by` are total on what it returns. `can` stops after the search;
     * `dispatch` runs both.
     */
    #rule(type, payload) {
        const cell = this.#cells?.get(type);
        if (cell === undefined)
            return; // no cell here
        // A null `when` is a neutral one — absent, or a name off a dumped schema. It reads as ⊤,
        // so a dumped schema still runs.
        for (const rule of cell)
            if (rule.when === null || rule.when(this.#context, payload))
                return rule;
        return; // every guard rejected
    }
    // The rest parameter above types the pair; the fixed pair below keeps the call from
    // materializing an array on every ask.
    can(type, payload) {
        return this.#rule(type, payload) !== undefined;
    }
    // As in `can`: the tuple types the pair, the fixed pair costs no array.
    dispatch(type, payload) {
        if (this.#dispatching)
            throw new DispatchInsideHandlerError();
        // Held for the whole call, not just the notifications, so a `with`/`by` that dispatches is
        // caught too, not only a listener that does. Released in `finally` so a listener that throws
        // does not leave the flag raised and every later `dispatch` throwing forever.
        this.#dispatching = true;
        try {
            const rule = this.#rule(type, payload);
            if (rule === undefined)
                return false;
            // Where the machine stood, as values — the `source` object is built only if a
            // `TRANSITION` listener will read it.
            const fromType = this.#type;
            const fromContext = this.#context;
            // A null `make`/`by` is a neutral one — absent, or a name off a dumped schema: `id` for
            // `with`, "no payload" for `by` — the same way a null `when` reads as ⊤.
            const reached = freeze(rule.make === null ? this.#context : rule.make(this.#context, payload));
            const tx = this.#channel?.tx;
            const heard = tx !== undefined && tx.has(TRANSITION);
            // `by` always runs — a nested dispatch from it must be caught, observed or not. The event
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
            return true;
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
