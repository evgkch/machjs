import type { Edge } from "../core/types.js";
/** The keywords, in the order a rule runs. */
export declare const WORDS: readonly ["FROM", "ON", "WHEN", "TO", "WITH", "EMIT", "BY"];
export type Word = (typeof WORDS)[number];
/**
 * The words a transition can fill: where it came from, on what event, where it went, what it
 * emitted — not which operations the rule named.
 *
 * Two rules these four cannot tell apart are exactly what `validate` reports as
 * `duplicate-edge`, so on a machine that passes validation a line is unambiguous.
 */
export declare const LABELS: readonly ["FROM", "ON", "TO", "EMIT"];
/**
 * Build a writer: a function of one row, with the columns already sized.
 *
 * Widths come from the rows given here, not the row being written, so a stream of rows lines up
 * even when only the schema (not the run) is known in advance. A word no row can fill is
 * dropped; one some row fills is padded blank in the rest. Pass a single row for an unaligned
 * one-off line.
 */
export declare const writer: (rows: readonly Edge[], words: readonly Word[]) => (row: Edge) => string;
