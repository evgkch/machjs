/**
 * The token's lifetime, as a schema.
 *
 * Requirement 3 — "refresh runs once, however many callers were refused" — is not a flag and not
 * an `if`. Down the `denied` column `emit: "refresh"` stands in one cell, `ok · denied`. The
 * second caller's `denied` arrives in `refreshing`, where the rule for it is a different one: it
 * counts the caller and emits nothing. There is nothing to check, because there is nothing that
 * could go wrong. (`dead · retry` emits it too, but that is the reader asking for another try,
 * not a caller being refused.)
 *
 * Requirement 5 — "a failed refresh refuses the waiting callers, nobody hangs" — is `failed`
 * leading to a phase that answers. `dead` is a state with rules, not a flag somebody forgot to
 * clear: every later `denied` is refused out of it, at once, with the reason on the ticket.
 *
 *   ok         ── denied ──▸ refreshing   emit refresh
 *   refreshing ── denied ──▸ refreshing               (one more waiting; nothing emitted)
 *   refreshing ── renewed ─▸ ok           emit wake
 *   refreshing ── failed ──▸ dead         emit giveUp
 *   dead       ── denied ──▸ dead         emit giveUp
 *   dead       ── retry ───▸ refreshing   emit refresh
 */
import { StateMachine } from "@evgkch/machjs";
import type { Q, Token, Λ, Σ } from "./types.js";

/** What the client starts with. The stand-in server refuses it once the reader says so. */
export const FIRST: Token = "tok-0";

// ── operations: each returns the context of the phase being entered ─────────

/** The first refused caller. The old token is not carried over: it has just been refused. */
const first = (): { waiting: number } => ({ waiting: 1 });

/** One more caller with nothing to send. */
const queue = (c: { waiting: number }): { waiting: number } => ({
  waiting: c.waiting + 1,
});

/**
 * The new token, taken from the answer rather than from the context — there is none in
 * `refreshing`. The same function serves `wake`: `by` runs on the context the machine reached, so
 * what goes out is what was just written down, not a second copy of it.
 */
const accept = (_c: unknown, p: { token: Token }): { token: Token } => ({
  token: p.token,
});

const note = (_c: unknown, p: { why: string }): { why: string } => ({
  why: p.why,
});

/** What `giveUp` carries, read off the phase it is emitted from. */
const sorry = (c: { why: string }): { why: string } => ({ why: c.why });

/** Trying again from `dead`: nobody is waiting yet — the caller who asked comes in as `denied`. */
const again = (): { waiting: number } => ({ waiting: 0 });

export const auth = new StateMachine<Q, Σ, Λ>(
  {
    ok: {
      denied: [{ to: ["refreshing", first], emit: "refresh" }],
    },

    refreshing: {
      // No `emit` here, and that is requirement 3: the second caller starts nothing.
      denied: [{ to: ["refreshing", queue] }],
      renewed: [{ to: ["ok", accept], emit: ["wake", accept] }],
      failed: [{ to: ["dead", note], emit: ["giveUp", sorry] }],
    },

    // Not a dead end. Without the two rules below `validate` reports `dead` as terminal — and it
    // would be right: a client that never recovers from one failed refresh is a bug, not a design.
    dead: {
      denied: [{ to: "dead", emit: ["giveUp", sorry] }],
      retry: [{ to: ["refreshing", again], emit: "refresh" }],
    },
  },
  { type: "ok", context: { token: FIRST } },
);
