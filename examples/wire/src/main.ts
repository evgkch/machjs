/**
 * The page: two machines, and the wire between them.
 *
 * Three things are worth watching for while reading this file.
 *
 * The first is the join, and how little there is of it. `terminal.rx.on("auth", …)` hands the
 * message to the wire and `wire.send`'s arrival hands it to `host.dispatch("auth", …)` — one
 * output letter of one machine becoming one input letter of the other. Neither machine imports
 * the other, and neither knows there is a wire.
 *
 * The second is that nothing here tests a phase. The keypad is dead while a question is out
 * because `waiting` has no `key` rule; every button is enabled by `can()`; a duplicate answer is
 * dropped because it satisfies no guard, not because a handler counted anything.
 *
 * The third is that the wire is not a machine. It is the world — it loses things, holds them, and
 * copies them — and both machines are written as though it will.
 */
import { TRANSITION } from "@evgkch/machjs";
import { board, el } from "../../shell.js";
import {
  MachjsDiagram,
  MachjsLegend,
  ensemble,
  fromMachine,
  newFocus,
} from "@evgkch/machjs-inspector/ui";
import { history } from "@evgkch/machjs/debug";
import { PAN, money, terminal } from "./terminal.js";
import { host } from "./host.js";
import { newWire } from "./wire.js";
import type { Parcel } from "./wire.js";

const amountOut = el<HTMLElement>("amount");
const saysOut = el<HTMLElement>("says");
const doingOut = el<HTMLElement>("doing");
const balanceOut = el<HTMLElement>("balance");
const seenOut = el<HTMLUListElement>("seen");
const lane = el<HTMLElement>("lane");
const logOut = el<HTMLOListElement>("log");
const send = el<HTMLButtonElement>("send");
const rub = el<HTMLButtonElement>("rub");
const giveUp = el<HTMLButtonElement>("giveUp");
const again = el<HTMLButtonElement>("again");
const keys = [...document.querySelectorAll<HTMLButtonElement>("[data-key]")];

el<HTMLElement>("pan").textContent = PAN;

// ── the wire, and the two machines joined through it ────────────────────────

const wire = newWire();

/**
 * The terminal asks. The output letter goes on the wire, and what comes off the wire is the
 * host's input letter — the same object, unchanged.
 *
 * A question that crosses twice is dispatched twice, and the host's `known` guard answers the
 * second one out of its file. Neither of those cases is written here.
 */
terminal.rx.on("auth", (ask) => {
  wire.send("down", `auth #${ask.ticket} · ${money(ask.amount)}`, () =>
    host.dispatch("auth", ask),
  );
});

/**
 * The host answers. The same seam the other way — and the same absence of care about duplicates:
 * an answer about a ticket the terminal is not waiting on satisfies neither guard of `waiting`,
 * so `dispatch` refuses it and the page is not told anything happened.
 */
host.rx.on("said", (said) => {
  answered.set(said.ticket, (answered.get(said.ticket) ?? 0) + 1);
  paintHost();
  wire.send("up", `${said.ok ? "ok" : "no"} #${said.ticket}`, () =>
    terminal.dispatch("said", said),
  );
});

/**
 * How many times each question was answered. The host keeps one answer per ticket and the
 * balance moves once; a copy delivered later is answered out of that file. Without this count the
 * second delivery looks like nothing happening, which is exactly what it must not look like.
 */
const answered = new Map<number, number>();

/**
 * The check the host is running. It is not a promise held anywhere: the host stands in `working`
 * until this arrives, and `working` is a phase of the machine like any other.
 */
host.rx.on(TRANSITION, ({ target }) => {
  if (target.type !== "working") return;
  const { ticket } = target.context.ask;
  setTimeout(() => host.dispatch("ready", { ticket }), 500);
});

// ── input: straight to the machines, with no phase test on the way ──────────

for (const key of keys)
  key.addEventListener("click", () =>
    terminal.dispatch("key", { digit: key.dataset["key"]! }),
  );
rub.addEventListener("click", () => terminal.dispatch("rub"));
send.addEventListener("click", () => terminal.dispatch("send"));
giveUp.addEventListener("click", () => terminal.dispatch("giveUp"));
again.addEventListener("click", () => terminal.dispatch("again"));

addEventListener("keydown", (e) => {
  if (/^[0-9]$/.test(e.key)) terminal.dispatch("key", { digit: e.key });
  if (e.key === "Backspace") terminal.dispatch("rub");
  if (e.key === "Enter") terminal.dispatch("send");
});

// ── the weather on the wire ─────────────────────────────────────────────────

const cut = el<HTMLInputElement>("cut");
const takes = el<HTMLInputElement>("takes");
const takesOut = el<HTMLElement>("takes-out");
const twice = el<HTMLButtonElement>("twice");
const lose = el<HTMLButtonElement>("lose");

cut.addEventListener("change", () => {
  wire.weather.cut = cut.checked;
  document.body.dataset["cut"] = String(cut.checked);
});
takes.addEventListener("input", () => {
  wire.weather.takes = Number(takes.value);
  takesOut.textContent = `${(wire.weather.takes / 1000).toFixed(1)} s`;
});
// Armed, and disarmed by the next message that goes: the button says which it is.
twice.addEventListener("click", () => {
  wire.weather.twice = !wire.weather.twice;
  paintWire();
});
lose.addEventListener("click", () => {
  wire.weather.lose = !wire.weather.lose;
  paintWire();
});

// ── drawing ─────────────────────────────────────────────────────────────────

/** One message on the wire. The crossing is a CSS animation of its own duration. */
function chip(p: Parcel): HTMLElement {
  const box = document.createElement("span");
  box.className = `parcel ${p.way}${p.copy ? " copy" : ""}`;
  box.style.setProperty("--takes", `${p.takes}ms`);
  box.textContent = p.label;
  return box;
}

/**
 * What is on the lane, by the id of the message it is drawing.
 *
 * Kept, rather than rebuilt on every redraw: a chip's position is its animation's progress, and a
 * fresh element starts that animation over. Rebuilding would send a message that is halfway
 * across back to the beginning every time a second one appeared — which is precisely when there
 * are two to watch.
 */
const chips = new Map<number, HTMLElement>();

/** The lane holds the rail and whatever is crossing it. */
function paintWire(): void {
  const flying = new Set<number>();
  for (const p of wire.flying) {
    flying.add(p.id);
    if (chips.has(p.id)) continue;
    const box = chip(p);
    chips.set(p.id, box);
    lane.append(box);
  }
  for (const [id, box] of chips)
    if (!flying.has(id)) {
      box.remove();
      chips.delete(id);
    }
  twice.setAttribute("aria-pressed", String(wire.weather.twice));
  lose.setAttribute("aria-pressed", String(wire.weather.lose));
  logOut.replaceChildren(
    ...wire.log.map((line) => {
      const row = document.createElement("li");
      row.textContent = line;
      return row;
    }),
  );
}

wire.watch(paintWire);

/** One row per ticket the host has answered, so a repeat can be seen not to move the balance. */
function ticket(said: {
  ticket: number;
  ok: boolean;
  why: string;
}): HTMLElement {
  const row = document.createElement("li");
  row.className = said.ok ? "yes" : "no";
  const a = document.createElement("span");
  a.className = "no-";
  a.textContent = `#${said.ticket}`;
  const b = document.createElement("span");
  b.className = "why";
  b.textContent = said.why;
  row.append(a, b);
  const twice = answered.get(said.ticket) ?? 0;
  if (twice > 1) {
    const again = document.createElement("span");
    again.className = "again";
    again.textContent = `answered ×${twice}, charged once`;
    row.append(again);
  }
  return row;
}

/** The terminal, read off the machine and nothing else. */
function paintTerm(): void {
  const s = terminal.state;
  document.body.dataset["term"] = s.type;
  amountOut.textContent =
    s.type === "entering"
      ? money(Number(s.context.typed || "0"))
      : s.type === "idle"
        ? money(0)
        : money(s.context.amount);
  saysOut.textContent =
    s.type === "idle"
      ? "Type an amount."
      : s.type === "entering"
        ? "Press Send."
        : s.type === "waiting"
          ? `Waiting on #${s.context.ticket}…`
          : s.context.why;

  // Every control, from one question — the same one the next dispatch would answer.
  for (const key of keys)
    key.disabled = !terminal.can("key", { digit: key.dataset["key"]! }).isOk();
  rub.disabled = !terminal.can("rub").isOk();
  send.disabled = !terminal.can("send").isOk();
  giveUp.disabled = !terminal.can("giveUp").isOk();
  again.disabled = !terminal.can("again").isOk();
}

/** The host, the same way. */
function paintHost(): void {
  const s = host.state;
  document.body.dataset["host"] = s.type;
  balanceOut.textContent = money(s.context.balance);
  doingOut.textContent =
    s.type === "working" ? `Checking #${s.context.ask.ticket}…` : "Listening.";
  const said = Object.values(s.context.seen).sort(
    (a, b) => b.ticket - a.ticket,
  );
  seenOut.replaceChildren(...said.map(ticket));
}

terminal.rx.on(TRANSITION, paintTerm);
host.rx.on(TRANSITION, paintHost);
paintTerm();
paintHost();
paintWire();

// ── the machines, drawn ──────────────────────────────────────────────────────
//
// Two subjects, not one: each machine has a diagram of its own and a legend of its own, standing
// under the machine it belongs to. The run is the terminal's — it is the one whose phases the
// reader is steering.
//
// A widget class that appears only where a type is expected is dropped by the transform, and its
// tag left unupgraded; every widget here is therefore built rather than written in the markup.

const termFocus = newFocus();
const hostFocus = newFocus();

const termDia = new MachjsDiagram();
termDia.setAttribute("name", "terminal");
el<HTMLElement>("term-dia").append(termDia);
const hostDia = new MachjsDiagram();
hostDia.setAttribute("name", "host");
el<HTMLElement>("host-dia").append(hostDia);

const termLegend = new MachjsLegend();
termLegend.setAttribute("kind", "states");
el<HTMLElement>("term-legend").append(termLegend);
const hostLegend = new MachjsLegend();
hostLegend.setAttribute("kind", "states");
el<HTMLElement>("host-legend").append(hostLegend);

const past = history(terminal);
const termBand = ensemble(
  fromMachine(terminal, { history: past }),
  { diagram: termDia },
  { focus: termFocus },
);
termBand.enroll(termLegend);
termBand.draw();

const hostBand = ensemble(
  fromMachine(host),
  { diagram: hostDia },
  { focus: hostFocus },
);
hostBand.enroll(hostLegend);
hostBand.draw();

// The desk runs the run and hands a switch to everything else on the page. The two diagrams and
// the two legends belong to their own ensembles, so only the run is enrolled here.
board({
  subject: fromMachine(terminal, { history: past }),
  enroll: (desk) => desk.enroll(document.querySelector("machjs-history")!),
  own: [["terminal", "term-dia"], ["host", "host-dia"], "about", "journal"],
});
