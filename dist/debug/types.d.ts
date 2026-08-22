/** Types for the debug module. */
import type { Rx } from "@evgkch/chanjs";
import type { Carrier, FsmState } from "../core/types.js";
/** Published when the recorder moves the machine: the index moved to. */
export type Moved = {
    moved: [index: number];
};
/** A time-travel view over a machine's states. */
export interface History<Q extends Carrier> {
    /**
     * Published whenever the recorder moves the machine — `undo`, `redo`, `jump`.
     *
     * `restore` sends no `Transition`, so this is the only signal a reader has that the machine
     * moved; without it, every reader would need the caller of `jump` to announce it directly.
     */
    readonly rx: Rx<Moved>;
    /** Recorded states, oldest first (index 0 is the initial one). */
    readonly states: readonly FsmState<Q>[];
    /** Current position within `states`. */
    readonly index: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /** Step back one state. Returns false at the start. */
    undo(): boolean;
    /** Step forward one state. Returns false at the end. */
    redo(): boolean;
    /** Restore the state at `index`. Returns false if out of range. */
    jump(index: number): boolean;
    /** Detach from the machine (stop recording). */
    stop(): void;
}
