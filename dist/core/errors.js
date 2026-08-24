/**
 * The kernel's error values. None are thrown: each rides inside one frozen `ok: false` response
 * (`UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` in `./index.js`) and exists as one instance,
 * so no dispatch allocates on any path.
 */
/** The current state has no cell for this event — other events may still fire. */
export class UnhandledError extends Error {
    constructor() {
        super("the event is unhandled in the current state");
        this.name = "UnhandledError";
        Object.setPrototypeOf(this, UnhandledError.prototype);
    }
}
/** The cell exists, but every rule's `when` refused the event with this payload. */
export class RejectedError extends Error {
    constructor() {
        super("every guard rejected the event");
        this.name = "RejectedError";
        Object.setPrototypeOf(this, RejectedError.prototype);
    }
}
/** The current state has no outgoing transitions at all — no event will ever fire from it. */
export class TerminalError extends Error {
    constructor() {
        super("the state is terminal: no outgoing transitions");
        this.name = "TerminalError";
        Object.setPrototypeOf(this, TerminalError.prototype);
    }
}
/**
 * Carried by `BUSY`: `dispatch` was called from inside a transition already in progress — a
 * listener, or a `when`/`with`/`by` of the rule itself. The inner call does nothing; defer it
 * with `queueMicrotask` to send the event after the current transition has finished.
 */
export class BusyError extends Error {
    constructor() {
        super("nested dispatch is refused; use queueMicrotask");
        this.name = "BusyError";
        Object.setPrototypeOf(this, BusyError.prototype);
    }
}
