/**
 * The host: a balance, and every ticket it has already answered.
 *
 * Two guards carry the whole protocol. `known` answers a repeated question with the very words it
 * was answered with the first time and does not check anything again — so a duplicate the wire
 * made moves no money. `afford` decides the rest. Both read the context and the payload and
 * nothing else, which is why `can` is worth asking and why the same run replays the same way.
 *
 *   listening ── auth·known ──▸ listening    emit said  (the same answer, again)
 *   listening ── auth ───────▸ working
 *   working   ── ready·afford ▸ listening    emit said  (charged)
 *   working   ── ready ──────▸ listening    emit said  (refused)
 */
import { StateMachine } from "@evgkch/machjs";
import type { Ask, HQ, HΛ, HΣ, Ledger, Say, Working } from "./types.js";
import { money } from "./terminal.js";

/** What the host has to spend. */
export const FLOAT = 250_00;

// ── guards ──────────────────────────────────────────────────────────────────

/** This ticket has been answered before. The answer is on file; nothing is checked twice. */
function known(c: Ledger, p: Ask): boolean {
  return p.ticket in c.seen;
}

/** The check that is running is about this ticket. Anything else is not this host's business. */
function mine(c: Working, p: { ticket: number }): boolean {
  return p.ticket === c.ask.ticket;
}

const afford = (c: Working, p: { ticket: number }): boolean =>
  mine(c, p) && c.ask.amount <= c.balance;

// ── operations ──────────────────────────────────────────────────────────────

/** The question taken in. Nothing is decided yet — deciding is what `working` is. */
const took = (c: Ledger, ask: Ask): Working => ({ ...c, ask });

/** One answer, written into the file it will be repeated out of. */
const filed = (c: Working, said: Say): Ledger => ({
  balance: said.ok ? c.balance - c.ask.amount : c.balance,
  seen: { ...c.seen, [said.ticket]: said },
});

const charged = (c: Working): Ledger =>
  filed(c, {
    ticket: c.ask.ticket,
    ok: true,
    why: `charged ${money(c.ask.amount)}`,
  });

const refused = (c: Working): Ledger =>
  filed(c, {
    ticket: c.ask.ticket,
    ok: false,
    why: `declined — ${money(c.balance)} left`,
  });

/**
 * What rides on `said`, in every case: the answer on file for this ticket.
 *
 * `by` runs on the context the machine reached, so the answer has already been written down —
 * and the message on the wire is read out of the record rather than built a second time beside
 * it. A repeat therefore cannot drift from the original: there is one answer, in one place.
 */
const spoken = (c: Ledger, p: { ticket: number }): Say => c.seen[p.ticket]!;

const again = (c: Ledger, p: Ask): Say => c.seen[p.ticket]!;

export const host = new StateMachine<HQ, HΣ, HΛ>(
  {
    listening: {
      // Narrowest first: a question already answered never reaches the check.
      auth: [
        { when: known, to: "listening", emit: ["said", again] },
        { to: ["working", took] },
      ],
    },

    working: {
      ready: [
        { when: afford, to: ["listening", charged], emit: ["said", spoken] },
        { when: mine, to: ["listening", refused], emit: ["said", spoken] },
      ],
    },
  },
  { type: "listening", context: { balance: FLOAT, seen: {} } },
);
