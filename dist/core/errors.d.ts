/**
 * The kernel's error values. None are thrown: each rides inside one frozen `ok: false` response
 * (`UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` in `./index.js`) and exists as one instance,
 * so no dispatch allocates on any path.
 */
/** The current state has no cell for this event — other events may still fire. */
export declare class UnhandledError extends Error {
    constructor();
}
/** The cell exists, but every rule's `when` refused the event with this payload. */
export declare class RejectedError extends Error {
    constructor();
}
/** The current state has no outgoing transitions at all — no event will ever fire from it. */
export declare class TerminalError extends Error {
    constructor();
}
/**
 * Carried by `BUSY`: `dispatch` was called from inside a transition already in progress — a
 * listener, or a `when`/`with`/`by` of the rule itself. The inner call does nothing; defer it
 * with `queueMicrotask` to send the event after the current transition has finished.
 */
export declare class BusyError extends Error {
    constructor();
}
