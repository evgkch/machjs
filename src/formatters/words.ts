/**
 * The word language, shared by the schema printer and the live log — internal.
 *
 * One rule reads as one sentence: `FROM ON WHEN TO WITH EMIT BY`, in the order the rule runs —
 * `when` decides, `to` names the target, `with` folds the input in, `emit`/`by` unfold the
 * output. `toRules` writes all seven over a schema; `rules` (in `machjs/debug`) writes the four
 * label words over transitions as they fire, using the same writer with different arguments.
 *
 * Not exported: the writer is a factory, not a `Formatter`, and a second public entry point
 * into the same language would invite the two to drift apart.
 */
import { nameOf } from "../core/index.js";
import type { Edge } from "../core/types.js";

/** The keywords, in the order a rule runs. */
export const WORDS = [
  "FROM",
  "ON",
  "WHEN",
  "TO",
  "WITH",
  "EMIT",
  "BY",
] as const;

export type Word = (typeof WORDS)[number];

/**
 * The words a transition can fill: where it came from, on what event, where it went, what it
 * emitted — not which operations the rule named.
 *
 * Two rules these four cannot tell apart are exactly what `validate` reports as
 * `duplicate-edge`, so on a machine that passes validation a line is unambiguous.
 */
export const LABELS = [
  "FROM",
  "ON",
  "TO",
  "EMIT",
] as const satisfies readonly Word[];

/** What a row puts under one word — a label as it stands, an operation by name. */
const said = (row: Edge, word: Word): string | undefined => {
  switch (word) {
    case "FROM":
      return String(row.from);
    case "ON":
      return String(row.on);
    case "TO":
      return String(row.to);
    case "EMIT":
      return row.emit === undefined ? undefined : String(row.emit);
    case "WHEN":
      return nameOf(row.when, "when");
    case "WITH":
      return nameOf(row.with, "with");
    case "BY":
      return nameOf(row.by, "by");
  }
};

/**
 * Build a writer: a function of one row, with the columns already sized.
 *
 * Widths come from the rows given here, not the row being written, so a stream of rows lines up
 * even when only the schema (not the run) is known in advance. A word no row can fill is
 * dropped; one some row fills is padded blank in the rest. Pass a single row for an unaligned
 * one-off line.
 */
export const writer = (rows: readonly Edge[], words: readonly Word[]) => {
  const width = (word: Word) =>
    Math.max(0, ...rows.map((r) => (said(r, word) ?? "").length));
  const sized = words
    .map((word) => [word, width(word)] as const)
    .filter(([, w]) => w > 0);

  return (row: Edge): string =>
    sized
      .map(([word, w]) => {
        const value = said(row, word);
        return value === undefined
          ? " ".repeat(word.length + 1 + w)
          : `${word} ${value.padEnd(w)}`;
      })
      .join(" ")
      .trimEnd();
};
