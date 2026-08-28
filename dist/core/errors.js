/**
 * The kernel's error values. None are thrown by the kernel: each rides inside one frozen
 * `Err` verdict (`UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` in `./index.js`) and exists as one
 * instance, so no dispatch allocates on any path. `Result.unwrap` throws the instance it holds.
 */
/** The current state has no cell for this event — other events may still fire. */
export class UnhandledError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    name = "UnhandledError";
    constructor() {
        super("the event is unhandled in the current state");
        Object.setPrototypeOf(this, UnhandledError.prototype);
    }
}
/** The cell exists, but every rule's `when` refused the event with this payload. */
export class RejectedError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    name = "RejectedError";
    constructor() {
        super("every guard rejected the event");
        Object.setPrototypeOf(this, RejectedError.prototype);
    }
}
/** The current state has no outgoing transitions at all — no event will ever fire from it. */
export class TerminalError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    name = "TerminalError";
    constructor() {
        super("the state is terminal: no outgoing transitions");
        Object.setPrototypeOf(this, TerminalError.prototype);
    }
}
/**
 * Carried by `BUSY`: `dispatch` was called from inside a transition already in progress — a
 * listener, or a `when`/`with`/`by` of the rule itself. The inner call does nothing; defer it
 * with `queueMicrotask` to send the event after the current transition has finished.
 */
export class BusyError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    name = "BusyError";
    constructor() {
        super("nested dispatch is refused; use queueMicrotask");
        Object.setPrototypeOf(this, BusyError.prototype);
    }
}
