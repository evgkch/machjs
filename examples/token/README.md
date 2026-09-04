**English** · [Русский](README.ru.md)

# Refreshing a token

A complete walkthrough from problem statement to a working state machine: an HTTP client whose access token expires, five callers refused at once, and exactly one refresh. The sections follow the order of work — first the transition graph, then the context, the operations, then the browser wiring and the analysis. In the code the type definitions usually stand before the schema; here they appear as they become necessary.

Notation and definitions are given in the [guide](https://github.com/evgkch/machjs/blob/master/packages/core/README.md). References of the form “section 4.2” point to sections of this document; the guide is referenced by section title — “README, ‘Transition schema’”.

**Working project.** The example runs as a page — [live demo](https://evgkch.github.io/machjs/token/). Vite, plain HTML and TypeScript, no frameworks; the commands are run from the root of this repository:

```sh
npm install
npm run dev       # http://localhost:5173/token/
npm run build     # tsc --noEmit + build to dist/
npm test          # every page driven in a DOM
```

Files against the sections of this document:

| File                               | Sections                                    |
| ---------------------------------- | ------------------------------------------- |
| [`src/types.ts`](src/types.ts)     | 2, 3 — states, events, contexts             |
| [`src/machine.ts`](src/machine.ts) | 4, 5 — the operations and the schema        |
| [`src/main.ts`](src/main.ts)       | 6, 7 — the callers, the server, the widgets |

**Contents**

1. [Problem statement](#1-problem-statement)
2. [What is in the machine, and what is not](#2-what-is-in-the-machine-and-what-is-not)
3. [Context](#3-context)
4. [Operations](#4-operations)
5. [The schema](#5-the-schema)
6. [Interaction from the browser](#6-interaction-from-the-browser)
7. [Machine run](#7-machine-run)
8. [Schema analysis](#8-schema-analysis)

## 1. Problem statement

An HTTP client holds an access token. The server refuses a stale one with 401, and there is an endpoint that mints a new one. Six requirements:

1. A request goes out with the token the client holds.
2. A 401 means: get a new token and send the request again.
3. The refresh runs **once**, however many callers were refused at the same moment. The rest wait.
4. The refresh succeeds — every waiting caller goes again with the new token.
5. The refresh fails — every waiting caller is refused. Nobody hangs.
6. A second 401, with a token just minted, is an answer and not another round.

Requirement 3 is where the usual code goes wrong. A flag — `let refreshing = false` — is the obvious way to write it, and it is also the way to hang every caller in the process the first time the refresh throws: the flag stays raised, the queue is never drained, and every later request joins it.

## 2. What is in the machine, and what is not

The requests are not in the machine.

A request is a thing the page keeps: it has an id, a row on the screen, and a promise somebody is awaiting. The machine holds one thing — the state of the token — and the split is the design:

| In the machine                   | On the page                      |
| -------------------------------- | -------------------------------- |
| Is there a usable token          | The list of requests             |
| Is one being fetched             | Which row shows what             |
| How many callers are waiting     | The promise each caller awaits   |
| Whether there will not be one    | The stand-in server              |

Five callers refused at once are five rows on the page and **five events** to the machine — of which the first emits `refresh` and the other four do not. That difference is the whole of requirement 3, and section 5 shows it is one cell.

## 3. Context

`Q` is a carrier — state ↦ what that state remembers (README, “Carriers”):

```ts
export type Q = Merge<
  | IState<"ok", { token: Token }>
  | IState<"refreshing", { waiting: number }>
  | IState<"dead", { why: string }>
>;
```

**`refreshing` has no token.** While one is being fetched the old one is known to be refused, so there is nothing to send — and a caller cannot reach for it, because `Q["refreshing"]` has no such field. The stale-token bug is not guarded against; it is unwriteable.

**`dead` has no token either.** It has the reason instead, and the reason is what goes out to everyone waiting.

The alphabets:

```ts
export type Σ = Merge<
  | IEvent<"denied">
  | IEvent<"renewed", { token: Token }>
  | IEvent<"failed", { why: string }>
  | IEvent<"retry">
>;

export type Λ = Merge<
  | IEvent<"refresh">
  | IEvent<"wake", { token: Token }>
  | IEvent<"giveUp", { why: string }>
>;
```

`denied` is one letter for two situations: a caller was refused with 401, and a caller asked while there was nothing to ask with. From the token's side they are the same event — one more caller has nothing to send — so they are one letter, and the page does not tell them apart either.

## 4. Operations

Each returns the context of the phase being entered.

```ts
const first = (): { waiting: number } => ({ waiting: 1 });

const queue = (c: { waiting: number }): { waiting: number } => ({
  waiting: c.waiting + 1,
});

const accept = (_c: unknown, p: { token: Token }): { token: Token } => ({
  token: p.token,
});

const sorry = (c: { why: string }): { why: string } => ({ why: c.why });
```

`first` does not carry the old token over: it has just been refused. `accept` reads the new one off the payload rather than the context — there is none in `refreshing` — and the same function serves as the `by` of `wake`, because `by` runs on the context the machine reached (README, “Output events”). What goes out is therefore what was just written down, not a second copy of it that could drift from it.

## 5. The schema

```ts
export const auth = new StateMachine<Q, Σ, Λ>(
  {
    ok: {
      denied: [{ to: ["refreshing", first], emit: "refresh" }],
    },
    refreshing: {
      denied: [{ to: ["refreshing", queue] }],
      renewed: [{ to: ["ok", accept], emit: ["wake", accept] }],
      failed: [{ to: ["dead", note], emit: ["giveUp", sorry] }],
    },
    dead: {
      denied: [{ to: "dead", emit: ["giveUp", sorry] }],
      retry: [{ to: ["refreshing", again], emit: "refresh" }],
    },
  },
  { type: "ok", context: { token: FIRST } },
);
```

**Requirement 3 is a cell, not a flag.** `emit: "refresh"` stands in `ok · denied` and nowhere else in that column. The second caller's `denied` arrives in `refreshing`, where the rule for it counts the caller and emits nothing. There is no `if (refreshing)` because there is nothing that could go wrong: the schema has no way to start a second fetch.

**Requirement 5 is a phase with rules.** `failed` leads to `dead`, and `dead` answers: every later `denied` is refused out of it at once, with the reason on the ticket.

**`dead` is not a dead end.** Delete its two rules and `validate` says so — section 8.

## 6. Interaction from the browser

One caller, from first send to final answer. Nothing here reads the machine's phase to decide whether to fetch a token:

```ts
async function ask(): Promise<void> {
  const row = line(++asked);
  const at = auth.state;
  let token = at.type === "ok" ? at.context.token : null;

  if (token === null) {
    say(row, "waiting", "no token — waiting");
    const got = await refused();
    if ("why" in got) return say(row, "refused", got.why);
    token = got.token;
  }

  say(row, "sent", `sent with ${token}`);
  if ((await send(token)) === 401) {
    say(row, "waiting", "401 — waiting for a token");
    const got = await refused();
    if ("why" in got) return say(row, "refused", got.why);
    token = got.token;
    say(row, "sent", `sent again with ${token}`);
    if ((await send(token)) === 401)
      return say(row, "refused", "401 with a fresh token");
  }
  say(row, "done", `200 with ${token}`);
}
```

`at.type === "ok"` is not a phase test standing in for a decision — it is how the token is read at all, and the compiler requires it: outside `ok` the field does not exist. What to *do* about not having one is not decided here:

```ts
function refused(): Promise<{ token: Token } | { why: string }> {
  return new Promise((settle) => {
    queue.push(settle);
    auth.dispatch("denied");
  });
}
```

Whether that started a fetch, joined a queue, or was refused outright is the schema's answer. Requirement 3 is therefore not implemented in this file at all.

And nobody hangs, for a reason that can be checked by reading the schema rather than the page: a caller waits on a promise that only `wake` or `giveUp` settles, and **every path out of `refreshing` emits one of the two**.

## 7. Machine run

Five callers refused at once, then a refresh that succeeds. Real output of the page's own test:

```text
PASS  refreshing — the legend follows: refreshing
PASS  five waiting: 5
PASS  and one fetch, not five: 1
PASS  no token in refreshing: false
PASS  back to ok: ok
PASS  the waiting were woken once: 1
PASS  with the new token: tok-1
```

Then the same five with the refresh broken:

```text
PASS  dead — the legend follows: dead
PASS  the waiting were refused: 1
PASS  and a later caller is refused at once: true
PASS  refused, not queued: 2
PASS  the way back is offered: true
```

`and one fetch, not five` is requirement 3, counted rather than argued. `refused, not queued` is requirement 5: the caller who arrives after the refresh has already failed is refused during their own `dispatch`, without joining anything.

## 8. Schema analysis

`validate` on the schema as it stands, from a real run:

```text
(no findings)
```

`analyze`:

```text
{"nodes":["ok","refreshing","dead"],"reachable":["ok","refreshing","dead"],
 "unreachable":[],"terminal":[]}
```

`terminal` is empty, and that is a statement about the client rather than about the code: there is no phase it cannot leave. Delete the two rules of `dead` — which is exactly what the same program written with a `switch` usually has — and the same call answers:

```text
⚠ warning node "dead" has no outgoing transitions
```

One failed refresh, and the client refuses everything until the page is reloaded. Nothing was executed to find that: the machine did not run and no operation was called.

The schema, printed by the library:

```text
FROM ok         ON denied  TO refreshing WITH first  EMIT refresh
FROM refreshing ON denied  TO refreshing WITH queue
FROM refreshing ON renewed TO ok         WITH accept EMIT wake    BY accept
FROM refreshing ON failed  TO dead       WITH note   EMIT giveUp  BY sorry
FROM dead       ON denied  TO dead                   EMIT giveUp  BY sorry
FROM dead       ON retry   TO refreshing WITH again  EMIT refresh
```

Six sentences. Requirement 3 is the absence of `EMIT refresh` from the second of them.
