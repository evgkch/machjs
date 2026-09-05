/**
 * The page: callers, a stand-in server, and one machine between them.
 *
 * Two things are worth watching for while reading this file.
 *
 * The first is what `ask` does *not* do. It never asks which phase the token is in before
 * deciding whether to fetch one — it dispatches `denied` and waits. Whether that started a
 * refresh, joined a queue, or was refused outright is the schema's answer, not this file's.
 * Requirement 3 — "refresh exactly once" — is therefore not implemented here at all.
 *
 * The second is that nobody hangs. A caller waits on a promise that only `wake` or `giveUp`
 * settles, and both are output events of the machine: every path out of `refreshing` emits one of
 * them. There is no branch here that could forget to.
 */
import { TRANSITION } from "@evgkch/machjs";
import { history } from "@evgkch/machjs/debug";
import { fromMachine } from "@evgkch/machjs-inspector/ui";
import { board, el } from "../../shell.js";
import { auth } from "./machine.js";
import type { Token } from "./types.js";

const asksOut = el<HTMLOListElement>("asks");
const waitingOut = el<HTMLElement>("waiting");
const fetchesOut = el<HTMLElement>("fetches");
const tokenOut = el<HTMLElement>("token");
const phaseOut = el<HTMLElement>("phase");
const saysOut = el<HTMLElement>("says");
const expire = el<HTMLButtonElement>("expire");
const five = el<HTMLButtonElement>("five");
const broken = el<HTMLInputElement>("broken");
const retry = el<HTMLButtonElement>("retry");

// ── the stand-in server ─────────────────────────────────────────────────────

const wait = (ms: number) => new Promise((go) => setTimeout(go, ms));

/**
 * The one token the server refuses. "Expire the token" marks whatever the client is holding —
 * so a refresh actually fixes things, and expiring again is a second press.
 */
let stale: Token | null = null;

async function send(token: Token): Promise<number> {
  await wait(300);
  return token === stale ? 401 : 200;
}

/**
 * Hands out a fresh token, or refuses to. Called once per refresh — the machine sees to that,
 * and the count beside the queue is the proof: five callers refused, one fetch.
 *
 * Counted on the way in, so a refresh that fails is counted too, and repainted at once, so the
 * number stands on the screen while the fetch is in flight and not only after it lands.
 */
let fetches = 0;
async function mint(): Promise<Token> {
  const n = ++fetches;
  paint();
  await wait(700);
  if (broken.checked) throw new Error("the refresh endpoint answered 500");
  return `tok-${n}`;
}

// ── the waiting callers ─────────────────────────────────────────────────────

/**
 * What a caller is waiting for: a token to try again with, or the reason there will not be one.
 *
 * The list is app plumbing, not state: how many are in it is the machine's business — `waiting`
 * is a field of the `refreshing` context — and this holds the promises that number stands for.
 */
type Settle = (got: { token: Token } | { why: string }) => void;
const queue: Settle[] = [];

auth.rx.on("refresh", () => {
  mint().then(
    (token) => auth.dispatch("renewed", { token }),
    (e: unknown) =>
      auth.dispatch("failed", { why: String((e as Error).message) }),
  );
});

auth.rx.on("wake", ({ token }) => {
  for (const settle of queue.splice(0)) settle({ token });
});

auth.rx.on("giveUp", ({ why }) => {
  for (const settle of queue.splice(0)) settle({ why });
});

/**
 * One caller, refused. Tell the machine and wait for whatever it decides.
 *
 * A `dead` machine answers `giveUp` during this very `dispatch`, before the promise below is
 * made — so the settler is pushed first and the queue drained after, which is why this reads in
 * the order it does.
 */
function refused(): Promise<{ token: Token } | { why: string }> {
  return new Promise((settle) => {
    queue.push(settle);
    auth.dispatch("denied");
  });
}

// ── the callers ─────────────────────────────────────────────────────────────

let asked = 0;

/** One request, from first send to final answer. Nothing here reads the machine's phase. */
async function ask(): Promise<void> {
  const row = line(++asked);
  const at = auth.state;
  // No token to send: one is being fetched, or there will not be one. Either way — `denied`.
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
    // One retry, and one only: a second 401 is an answer, not another round.
    if ((await send(token)) === 401)
      return say(row, "refused", "401 with a fresh token");
  }
  say(row, "done", `200 with ${token}`);
}

el<HTMLButtonElement>("one").addEventListener("click", () => void ask());
five.addEventListener("click", () => {
  for (let i = 0; i < 5; i++) void ask();
});
retry.addEventListener("click", () => auth.dispatch("retry"));
expire.addEventListener("click", () => {
  const at = auth.state;
  stale = at.type === "ok" ? at.context.token : stale;
  paint();
});

// ── drawing ─────────────────────────────────────────────────────────────────

function line(n: number): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "ask sent";
  const a = document.createElement("span");
  a.className = "no";
  a.textContent = `#${n}`;
  const b = document.createElement("span");
  b.className = "what";
  b.textContent = "starting";
  row.append(a, b);
  asksOut.prepend(row);
  return row;
}

function say(row: HTMLLIElement, cls: string, what: string): void {
  row.className = `ask ${cls}`;
  row.querySelector(".what")!.textContent = what;
}

/** The token panel, read off the machine and nothing else. */
function paint(): void {
  const s = auth.state;
  document.body.dataset["phase"] = s.type;
  phaseOut.textContent = s.type;
  tokenOut.textContent = s.type === "ok" ? s.context.token : "—";
  waitingOut.textContent = String(
    s.type === "refreshing" ? s.context.waiting : 0,
  );
  fetchesOut.textContent = String(fetches);
  saysOut.textContent =
    s.type === "ok"
      ? "A usable token is held."
      : s.type === "refreshing"
        ? `Fetching one. ${s.context.waiting} caller(s) waiting.`
        : s.context.why;
  // Every control, from one question — the same one the next dispatch would answer.
  retry.disabled = !auth.can("retry").isOk();
  // The server's own switch is not the machine's business: it is offered while there is a token
  // to spoil, and says so.
  expire.disabled = s.type !== "ok" || s.context.token === stale;
  // The next useful press, marked. Nothing is refused while the token is good, so the first move
  // is to spoil it; after that the callers are the point.
  const next = expire.disabled ? five : expire;
  for (const button of [expire, five])
    button.classList.toggle("go", button === next);
}

auth.rx.on(TRANSITION, paint);
paint();

// ── the machine, drawn ──────────────────────────────────────────────────────

board({
  subject: fromMachine(auth, { history: history(auth) }),
  enroll: (desk) => {
    for (const widget of document.querySelectorAll<HTMLElement>(
      "machjs-legend, machjs-diagram, machjs-history",
    ))
      desk.enroll(widget as Parameters<typeof desk.enroll>[0]);
  },
  own: ["about"],
});
