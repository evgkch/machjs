**English** · [Русский](README.ru.md)

# Two machines over a wire

A complete walkthrough from problem statement to two working state machines: a card terminal and an authorisation host, joined by a wire that can be cut, slowed, or made to deliver twice. The sections follow the order of work — first the two transition graphs, then the contexts, guards and operations, then the seam between the machines, the wire, the browser wiring and the analysis. In the code the type definitions usually stand before the schema; here they appear as they become necessary.

Notation and definitions are given in the [guide](https://github.com/evgkch/machjs/blob/master/packages/core/README.md). References of the form “section 4.2” point to sections of this document; the guide is referenced by section title — “README, ‘Transition schema’”.

**Working project.** The example runs as a page — [live demo](https://evgkch.github.io/machjs/wire/). Vite, plain HTML and TypeScript, no frameworks; the commands are run from the root of this repository:

```sh
npm install
npm run dev       # http://localhost:5173/wire/
npm run build     # tsc --noEmit + build to dist/
npm test          # every page driven in a DOM
```

Files against the sections of this document:

| File                                   | Sections                                     |
| -------------------------------------- | -------------------------------------------- |
| [`src/types.ts`](src/types.ts)         | 2, 4 — states, events, contexts               |
| [`src/terminal.ts`](src/terminal.ts)   | 3.1, 5, 6 — the terminal's schema             |
| [`src/host.ts`](src/host.ts)           | 3.2, 5, 6 — the host's schema                 |
| [`src/wire.ts`](src/wire.ts)           | 8 — the wire, which is not a machine          |
| [`src/main.ts`](src/main.ts)           | 7, 9, 12 — the seam, the page, the widgets    |

**Contents**

1. [Problem statement](#1-problem-statement)
2. [Two machines, not one](#2-two-machines-not-one)
3. [Transition graphs](#3-transition-graphs)
4. [Contexts](#4-contexts)
5. [Guards](#5-guards)
6. [Operations](#6-operations)
7. [The seam: Λ becomes Σ](#7-the-seam-λ-becomes-σ)
8. [The wire](#8-the-wire)
9. [Interaction from the browser](#9-interaction-from-the-browser)
10. [Machine run](#10-machine-run)
11. [Schema analysis](#11-schema-analysis)
12. [The machines on the page](#12-the-machines-on-the-page)

## 1. Problem statement

The task: a card terminal takes an amount and asks an authorisation host to charge it. The host holds a float and answers yes or no. Between them is a network, and the network is not reliable — a message may take any amount of time, may be delivered twice, and may not arrive at all.

Three properties have to hold whatever the network does.

An answer belongs to one question. The terminal must not treat an answer to an earlier attempt as an answer to the current one, and must not treat the same answer twice as two events.

A question charges once. If the network delivers the same question twice, the balance moves once. The second delivery is answered — the asker cannot tell that it was a repeat — but nothing else happens.

Neither machine hangs on the other. A terminal whose question was lost stays where it is, and says so; it does not invent an answer and does not fall back into a state it cannot justify.

None of that is about the network. All of it is about what each machine will accept where it stands, which is what a transition schema says.

## 2. Two machines, not one

The pair could be written as one machine over the union of both state sets. It is not, for two reasons that are worth naming before any code.

The first is that they do not share a context. The terminal knows a card number and an amount; the host knows a balance and a file of answers. Neither has any business reading the other's, and a single `Q` would put both in every state.

The second is the wire. One machine's transition is atomic: `dispatch` returns after the whole step has run (README, “Executing a transition: `dispatch` and `can`”). Two machines separated by a network have no such step — the question leaves one and arrives at the other later, or never. That gap is not a state of either machine; it is what is between them.

So the join is exactly one thing: the terminal's output alphabet Λ is carried to the host's input alphabet Σ, and back again.

Table 1 — What crosses

| Message | From     | Carries                    | Arrives as        |
| ------- | -------- | -------------------------- | ------------------ |
| `auth`  | terminal | `{ ticket, pan, amount }` | the host's `auth`  |
| `said`  | host     | `{ ticket, ok, why }`     | the terminal's `said` |

`ticket` is on both. It is the whole of how an answer is matched to a question, and neither machine relies on the order messages arrive in.

## 3. Transition graphs

### 3.1 The terminal

Table 2 — The terminal's states

| State      | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| `idle`     | Nothing typed                                          |
| `entering` | Digits in the box                                      |
| `waiting`  | A question is out, and its ticket is the one in context |
| `approved` | The host charged it                                    |
| `declined` | The host refused it, or the reader gave up             |

Table 3 — The terminal's events

| Event    | Payload            | Where it comes from       |
| -------- | ------------------ | ------------------------- |
| `key`    | `{ digit }`        | The keypad                |
| `rub`    | —                  | Backspace                 |
| `send`   | —                  | The Send key              |
| `said`   | `Say`              | The host, over the wire   |
| `giveUp` | —                  | The reader, out of patience |
| `again`  | —                  | Starting over             |

Table 4 — The terminal's rules

| From       | On       | Guard      | To         | Emits  |
| ---------- | -------- | ---------- | ---------- | ------ |
| `idle`     | `key`    | —          | `entering` | —      |
| `entering` | `key`    | —          | `entering` | —      |
| `entering` | `rub`    | `lastOne`  | `idle`     | —      |
| `entering` | `rub`    | —          | `entering` | —      |
| `entering` | `send`   | `payable`  | `waiting`  | `auth` |
| `waiting`  | `said`   | `yes`      | `approved` | —      |
| `waiting`  | `said`   | `no`       | `declined` | —      |
| `waiting`  | `giveUp` | —          | `declined` | —      |
| `approved` | `again`  | —          | `idle`     | —      |
| `declined` | `again`  | —          | `entering` | —      |

Two absences carry as much as the ten rules.

`waiting` has no `key` rule and no `rub` rule. That is the whole of locking the keypad while a question is out: `dispatch("key", …)` from `waiting` finds no cell, answers `UNHANDLED`, and changes nothing (README, “Partiality”). No flag was set and no handler was disabled to make it so — and section 9 shows the keypad reading the same fact back out of the machine.

`waiting` has two `said` rules and both are guarded. An answer that satisfies neither — an answer about another ticket — matches no rule, and `dispatch` answers `REJECTED`. A duplicate and a straggler are the same case, and neither is written anywhere.

### 3.2 The host

Table 5 — The host's states

| State       | Meaning                              |
| ----------- | ------------------------------------ |
| `listening` | Idle, with a balance and a file      |
| `working`   | Checking one question                |

Table 6 — The host's events

| Event   | Payload       | Where it comes from             |
| ------- | ------------- | ------------------------------- |
| `auth`  | `Ask`         | The terminal, over the wire     |
| `ready` | `{ ticket }`  | The check finishing             |

Table 7 — The host's rules

| From        | On      | Guard    | To          | Emits  |
| ----------- | ------- | -------- | ----------- | ------ |
| `listening` | `auth`  | `known`  | `listening` | `said` |
| `listening` | `auth`  | —        | `working`   | —      |
| `working`   | `ready` | `afford` | `listening` | `said` |
| `working`   | `ready` | `mine`   | `listening` | `said` |

The first cell is a guard cascade and the order in it is the whole of idempotency. `known` is the narrow case and stands first: a ticket the host has answered before is answered again out of the file, without entering `working` and without touching the balance. The unguarded rule under it takes everything else. Written the other way round the second rule could never fire, and `validate` would say so — that is the `dead-rule` finding (README, “`validate`”).

`working` has no `auth` rule. A question that arrives while a check is running is refused, and section 9 shows the page writing that refusal down rather than swallowing it.

## 4. Contexts

`Q` is a carrier — state ↦ what that state remembers (README, “Carriers”). Writing it out is what makes a field unavailable where it has no meaning.

```ts
export type Card = { readonly pan: string; readonly ticket: number };
export type Typed = Card & { readonly typed: string };
export type Flight = Card & { readonly amount: Cents };
export type Done = Flight & { readonly why: string };

export type TQ = Merge<
  | IState<"idle", Card>
  | IState<"entering", Typed>
  | IState<"waiting", Flight>
  | IState<"approved", Done>
  | IState<"declined", Done>
>;
```

The ticket counter lives in the context, and that is not an accident of layout. An operation is a pure function of `(context, payload)` (README, “Operations”): a `next()` that incremented a variable outside the machine would make the same schema run two different ways, and would make a replay of a recorded run disagree with the run it replays. `booked` reads `ticket + 1` (section 6), and the number the machine is waiting on is a fact about the state it is waiting in.

`typed` exists in `entering` and nowhere else, so there is no state in which the terminal holds half-entered digits it is not entering. `why` exists only where there is something to say.

The host's context is two fields:

```ts
export type Ledger = {
  readonly balance: Cents;
  readonly seen: Readonly<Record<number, Say>>;
};
export type Working = Ledger & { readonly ask: Ask };
```

`seen` is the file the second delivery of a question is answered out of. `ask` exists only in `working`, because a question being checked is what `working` is.

## 5. Guards

A guard is a pure predicate on `(context, payload)`. Purity is what makes `can` worth asking: it answers the question the next `dispatch` would answer, without moving anything (README, “`can`”).

The terminal's:

```ts
function payable(c: Typed): boolean {
  return moneyOf(c.typed) > 0;
}

function lastOne(c: Typed): boolean {
  return c.typed.length <= 1;
}

function mine(c: Flight, p: Say): boolean {
  return p.ticket === c.ticket;
}

const yes = (c: Flight, p: Say): boolean => mine(c, p) && p.ok;
const no = (c: Flight, p: Say): boolean => mine(c, p) && !p.ok;
```

`mine` is the protocol. It is not a check the terminal does before deciding what to do — it is part of deciding whether anything happens at all, and it is written once, in two rules that both need it.

The host's:

```ts
function known(c: Ledger, p: Ask): boolean {
  return p.ticket in c.seen;
}

function mine(c: Working, p: { ticket: number }): boolean {
  return p.ticket === c.ask.ticket;
}

const afford = (c: Working, p: { ticket: number }): boolean =>
  mine(c, p) && c.ask.amount <= c.balance;
```

The two `mine`s are the same idea at both ends: a message names the exchange it belongs to, and a message that names another one moves nothing.

## 6. Operations

Each operation returns the context of the phase being entered. Where a phase carries less than the one before it, the context is rebuilt rather than spread — a spread would typecheck and carry a field into a state whose type does not include it.

```ts
const booked = (c: Typed): Flight => ({
  pan: c.pan,
  ticket: c.ticket + 1,
  amount: moneyOf(c.typed),
});

const asked = (c: Flight) => ({
  ticket: c.ticket,
  pan: c.pan,
  amount: c.amount,
});
```

`booked` is the `with` and `asked` is the `by` of the same rule. `by` runs on the context the machine reached (README, “Output events”), so the ticket on the wire is the ticket in `waiting` — one number, read once, in one place.

The host's operations are the same shape, and one of them is worth reading twice:

```ts
const filed = (c: Working, said: Say): Ledger => ({
  balance: said.ok ? c.balance - c.ask.amount : c.balance,
  seen: { ...c.seen, [said.ticket]: said },
});

const spoken = (c: Ledger, p: { ticket: number }): Say => c.seen[p.ticket]!;
```

`filed` writes the answer down; `spoken` — the `by` of both `working` rules — reads it back out. The message on the wire is therefore not built a second time beside the record: there is one answer, in one place, and a repeat cannot drift from the original because it is the same object.

## 7. The seam: Λ becomes Σ

The whole of the join is six lines.

```ts
terminal.rx.on("auth", (ask) => {
  wire.send("down", `auth #${ask.ticket} · ${money(ask.amount)}`, () =>
    host.dispatch("auth", ask),
  );
});

host.rx.on("said", (said) => {
  wire.send("up", `${said.ok ? "ok" : "no"} #${said.ticket}`, () =>
    terminal.dispatch("said", said),
  );
});
```

An output letter of one machine becomes an input letter of the other, unchanged. Neither module imports the other; both are subscribed to by the page, which is the only thing that knows there are two.

Nothing here handles a duplicate, and nothing here handles a straggler. If the wire calls the delivery twice, `dispatch` is called twice, and the second call is refused by the guards of section 5. The page learns that from the verdict and writes it down (section 8); the machines do not have to be told.

The check the host runs is a phase, not a promise:

```ts
host.rx.on(TRANSITION, ({ target }) => {
  if (target.type !== "working") return;
  const { ticket } = target.context.ask;
  setTimeout(() => host.dispatch("ready", { ticket }), 500);
});
```

`setTimeout` and not a direct call, because a `dispatch` nested inside a running one answers `BUSY` (README, “Nested `dispatch`”). While it runs, the host stands in `working`, and `working` is a state on the diagram like any other.

## 8. The wire

The wire is the one thing on this page that is not a machine. It is the world: it holds a message for a while and hands it over, and what the reader does to it — hold it longer, deliver it twice, lose it, carry nothing — is not a state of either machine.

```ts
export type Deliver = () => Verdict;

export type Wire = {
  readonly weather: Weather;
  send(way: Way, label: string, arrive: Deliver): void;
  readonly flying: readonly Parcel[];
  watch(on: () => void): () => void;
  readonly log: readonly string[];
};
```

`Deliver` returns the receiving machine's verdict, and that is what makes the example legible. A message that never arrives and a message that arrives and is refused are different events, and the journal tells them apart:

```ts
const took = arrive();
const said = `${label}${copy ? " (a copy)" : ""}`;
note(took.isOk() ? `▸ ${said}` : `⊘ ${said} — ${because(took)}`);
```

`because` reads the verdict's error, which is one of the library's five (README, “The verdict”): `UnhandledError` — no rule for it where the machine stands; `RejectedError` — no guard admitted it; `TerminalError`; `BusyError`.

The crossing time is a slider, and it selects which of the two duplicate cases the reader sees. The copy leaves a third of a crossing behind the original, and the host's check takes 500 ms:

| Crossing | Gap between the two | Where the copy lands | What happens                          |
| -------- | ------------------- | -------------------- | ------------------------------------- |
| 0.2 s    | 67 ms               | `working`            | no `auth` rule there — refused        |
| 2.4 s    | 800 ms              | `listening`          | `known` fires — answered off the file |

Both are correct behaviour, and the journal names both.

## 9. Interaction from the browser

Every input goes straight to a machine, with no test of the phase on the way:

```ts
for (const key of keys)
  key.addEventListener("click", () =>
    terminal.dispatch("key", { digit: key.dataset["key"]! }),
  );
rub.addEventListener("click", () => terminal.dispatch("rub"));
send.addEventListener("click", () => terminal.dispatch("send"));
```

And every control is offered by asking the machine the same question the next dispatch would answer:

```ts
for (const key of keys)
  key.disabled = !terminal.can("key", { digit: key.dataset["key"]! }).isOk();
rub.disabled = !terminal.can("rub").isOk();
send.disabled = !terminal.can("send").isOk();
giveUp.disabled = !terminal.can("giveUp").isOk();
again.disabled = !terminal.can("again").isOk();
```

The keypad greys out in `waiting` because the schema has no `key` rule there — not because a line of code disables it. Delete a rule from the table and the key goes grey; add one and it lights up. The row of controls is the alphabet, drawn.

## 10. Machine run

One payment of 5.00 €, with the wire delivering the question twice and the answer twice. The wire is driven by hand here, so the order is the one written down; on the page it is the timers'. Real output of `log` on both machines:

```text
| machine  | event    | from       | to         | output                         |
| -------- | -------- | ---------- | ---------- | ------------------------------ |
| terminal | key      | idle       | entering   | —                              |
| terminal | key      | entering   | entering   | —                              |
| terminal | key      | entering   | entering   | —                              |
| terminal | send     | entering   | waiting    | auth                           |
| host     | auth     | listening  | working    | —                              |
| host     | ready    | working    | listening  | said                           |
| host     | auth     | listening  | listening  | said                           |
| terminal | said     | waiting    | approved   | —                              |
| terminal | said     | approved   | —          | refused: UnhandledError        |

balance: 245.00 €  terminal: approved  why: charged 5.00 €
```

Three lines carry the three properties of section 1.

Row 7 is the copy of the question. It fires `listening → listening` and emits `said`, so the asker gets an answer — and the balance is 245.00 €, which is 250.00 € less 5.00 € once. The question charged once.

Row 9 is the copy of the answer. By the time it arrives the terminal is in `approved`, which has no `said` rule, so `dispatch` answers `UnhandledError` and nothing moves. The answer belonged to one question, and that question is closed.

Cut the wire between rows 4 and 5 and there is no row 5: the terminal stays in `waiting` and says so. There is no timer in the schema, and the only way out is `giveUp` — the reader, not a clock.

## 11. Schema analysis

`validate` on both schemas, from a real run:

```text
===== terminal: validate =====
[]

===== host: validate =====
[]
```

Nothing is wrong with either: no unreachable state, no rule an unguarded one ahead of it would always beat.

`analyze`:

```text
===== terminal: analyze =====
{
  "nodes": ["idle", "entering", "waiting", "approved", "declined"],
  "reachable": ["idle", "entering", "waiting", "approved", "declined"],
  "unreachable": [],
  "terminal": []
}

===== host: analyze =====
{
  "nodes": ["listening", "working"],
  "reachable": ["listening", "working"],
  "unreachable": [],
  "terminal": []
}
```

`terminal` is empty for both, and that is a statement about the protocol rather than about the code: neither machine has a state it cannot leave. The terminal's `approved` and `declined` both have `again`, and the host always returns to `listening`. A payment terminal with a dead end would be one that has to be restarted.

The host's cascade is worth checking against `validate` by breaking it. Put the unguarded `auth` rule first and the `known` rule under it, and `validate` reports a `dead-rule`: the second could never fire, and every repeated question would be checked again and charged again.

## 12. The machines on the page

Each machine is drawn by the inspector's widgets, and there are two of everything that belongs to a machine:

```ts
const termBand = ensemble(
  fromMachine(terminal, { history: past }),
  { diagram: termDia },
  { focus: termFocus },
);
termBand.enroll(termLegend);
termBand.draw();
```

Two subjects, two diagrams, two legends — one legend under each machine, so the two state sets are read where the machine is rather than in one row that would have to say which is which. The run is the terminal's: it is the one whose phases the reader steers.

The panels of the page take a switch on the same row as the widgets:

```ts
for (const [name] of own) desk.seat(name);
```

`seat` registers a name and draws a switch but shows nothing — the arrangement is a machine of the library's own, and the page reads it back. One row therefore governs the whole screen, and turning every switch off leaves the two machines and the wire alone on it.

The dock and the two legends carry `class="tool"`, and a marked region is painted in Gruvbox
rather than in the page's palette, in both schemes — so what the instrument draws is never
mistaken for what the application draws. The skin is a block of custom properties in `shell.css`:
the palette inherits through a shadow root, so nothing reaches inside a widget and no widget is
patched.

Where the panels stand is the reader's, not the page's:

```ts
dockEdge(document.getElementById("board")!, "right");
```

`dockEdge` writes the edge on `<body>` and the stylesheet lays the dock out from it — down the
right side, or along the bottom for a subject that is wide and shallow. The choice is remembered
per page.
