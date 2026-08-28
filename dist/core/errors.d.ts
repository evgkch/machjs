/**
 * The kernel's error values. None are thrown by the kernel: each rides inside one frozen
 * `Err` verdict (`UNHANDLED`, `REJECTED`, `TERMINAL`, `BUSY` in `./index.js`) and exists as one
 * instance, so no dispatch allocates on any path. `Result.unwrap` throws the instance it holds.
 */
/** The current state has no cell for this event — other events may still fire. */
export declare class UnhandledError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    readonly name = "UnhandledError";
    constructor();
}
/** The cell exists, but every rule's `when` refused the event with this payload. */
export declare class RejectedError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    readonly name = "RejectedError";
    constructor();
}
/** The current state has no outgoing transitions at all — no event will ever fire from it. */
export declare class TerminalError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    readonly name = "TerminalError";
    constructor();
}
/**
 * Carried by `BUSY`: `dispatch` was called from inside a transition already in progress — a
 * listener, or a `when`/`with`/`by` of the rule itself. The inner call does nothing; defer it
 * with `queueMicrotask` to send the event after the current transition has finished.
 */
export declare class BusyError extends Error {
    /** Literal, so a `switch` over `MachineError` narrows on `name` and is checked for exhaustiveness. */
    readonly name = "BusyError";
    constructor();
}
/**
 * Every error the kernel answers with. A closed union: a caller that translates verdicts into its
 * own vocabulary switches on `name` and the compiler reports the case it forgot.
 */
export type MachineError = UnhandledError | RejectedError | TerminalError | BusyError;
