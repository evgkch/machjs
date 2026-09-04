/**
 * The terminal: digits, a question on the wire, and an answer matched by ticket.
 *
 * The schema is the whole policy. There is no `if (phase === …)` anywhere and no boolean called
 * `busy`: the keypad is dead while a question is out because `waiting` has no `key` rule, and an
 * answer to a bygone ticket is dropped because it satisfies neither guard of the cell it arrives
 * in — `dispatch` answers `REJECTED` and nothing moves.
 *
 *   idle     ── key ──────▸ entering
 *   entering ── send·payable ▸ waiting        emit auth
 *   waiting  ── said·yes ──▸ approved
 *   waiting  ── said·no  ──▸ declined
 *   waiting  ── said·(another ticket) ── nothing: no rule matches
 */
import { StateMachine } from "@evgkch/machjs";
import type { Card, Done, Flight, Say, TQ, TΛ, TΣ, Typed } from "./types.js";

/** The card in the slot. A real terminal would read it; this one has one. */
export const PAN = "4012 88 3316";

/** Six digits of minor units — enough for 9999.99, which is more than the host has. */
const WIDTH = 6;

/** The digits as money. An empty box is nothing, not zero. */
export const moneyOf = (typed: string): number => Number(typed || "0");

/** Money as it is written. The only place the minor unit turns into a point. */
export const money = (c: number): string => `${(c / 100).toFixed(2)} €`;

// ── guards ──────────────────────────────────────────────────────────────────

/** There is something to send. An empty box is not a payment of nothing. */
function payable(c: Typed): boolean {
  return moneyOf(c.typed) > 0;
}

/** The last digit is about to go, and the box will be empty. */
function lastOne(c: Typed): boolean {
  return c.typed.length <= 1;
}

/**
 * This answer is about the question in flight. Every other answer — a duplicate the wire made, a
 * straggler from a question already given up on — fails this and is dropped.
 */
function mine(c: Flight, p: Say): boolean {
  return p.ticket === c.ticket;
}

const yes = (c: Flight, p: Say): boolean => mine(c, p) && p.ok;
const no = (c: Flight, p: Say): boolean => mine(c, p) && !p.ok;

// ── operations: each returns the context of the phase being entered ─────────

const first = (c: Card, p: { digit: string }): Typed => ({
  ...c,
  typed: p.digit,
});

const more = (c: Typed, p: { digit: string }): Typed => ({
  ...c,
  typed: (c.typed + p.digit).slice(0, WIDTH),
});

const less = (c: Typed): Typed => ({ ...c, typed: c.typed.slice(0, -1) });

/** Back to an empty terminal. Rebuilt, not spread: `idle` carries no digits. */
const blank = (c: Typed): Card => ({ pan: c.pan, ticket: c.ticket });

/** The question, and the ticket it will be answered by. */
const booked = (c: Typed): Flight => ({
  pan: c.pan,
  ticket: c.ticket + 1,
  amount: moneyOf(c.typed),
});

const settled = (c: Flight, p: Say): Done => ({ ...c, why: p.why });

/** Given up on. The ticket stays used: the answer, if it ever comes, belongs to nothing. */
const abandoned = (c: Flight): Done => ({
  ...c,
  why: "given up on — no answer came",
});

/** Round again, with the same amount typed out, so a declined payment can be edited. */
const retype = (c: Done): Typed => ({
  pan: c.pan,
  ticket: c.ticket,
  typed: String(c.amount),
});

const cleared = (c: Done): Card => ({ pan: c.pan, ticket: c.ticket });

/** What rides on `auth`: the question, read off the context after the move. */
const asked = (c: Flight) => ({
  ticket: c.ticket,
  pan: c.pan,
  amount: c.amount,
});

export const terminal = new StateMachine<TQ, TΣ, TΛ>(
  {
    idle: {
      key: [{ to: ["entering", first] }],
    },

    entering: {
      key: [{ to: ["entering", more] }],
      // Two rules, narrowest first: the rub that empties the box is the one that leaves the
      // phase. Without the guard the second rule would take every rub and the box would sit
      // empty in `entering` — a state the display would have to explain.
      rub: [{ when: lastOne, to: ["idle", blank] }, { to: ["entering", less] }],
      send: [{ when: payable, to: ["waiting", booked], emit: ["auth", asked] }],
    },

    // No `key` rule, no `rub` rule: the keypad is dead here, and nothing had to be disabled to
    // make it so. The two `said` rules are guarded on both sides of the answer, so an answer
    // about another ticket matches neither.
    waiting: {
      said: [
        { when: yes, to: ["approved", settled] },
        { when: no, to: ["declined", settled] },
      ],
      giveUp: [{ to: ["declined", abandoned] }],
    },

    approved: {
      again: [{ to: ["idle", cleared] }],
    },

    declined: {
      again: [{ to: ["entering", retype] }],
    },
  },
  { type: "idle", context: { pan: PAN, ticket: 0 } },
);
