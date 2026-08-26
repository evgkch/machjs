/**
 * The page: a queue of one submission, and the review sheet that moves it.
 *
 * Four things are worth watching for while reading this file, because all four are the point.
 *
 * The first is that no handler tests the phase. A control is enabled by asking the machine
 * `can(event)` — the same question the next `dispatch` would answer — so the set of things you may
 * do right now is held by the schema and read off it, never mirrored here. Delete a rule from the
 * table and the control goes grey; add one and it lights up. The question narrows by payload too:
 * once anna has signed, `can("sign", { who: "anna", … })` is false while the same question about
 * boris is still true, and the two rows diverge without any code about signers.
 *
 * The second is the wait. `submit` emits `gate`, this file runs the checks and dispatches
 * `checked` back, and in between the machine sits in `checking` — a phase, with no `write` rule in
 * it, which is what makes the document uneditable while CI has it. The waiting is in the machine.
 * Nothing here holds a promise, a flag, or a boolean called `busy`.
 *
 * The third is that the document under review is a machine too, and the page treats it as one:
 * the same `readSchema` the gate checks with feeds the editor's colours and the drawing beside it,
 * and a gutter mark runs the submitted schema where it stands. A reviewer reads it, breaks it, and
 * watches the drawing break with it.
 *
 * The signature is real: ECDSA P-256 over the document text, computed here before the event is
 * dispatched — WebCrypto is asynchronous and the machine is not, so the signing happens in the
 * handler and the machine receives a finished signature.
 */
import { TRANSITION } from "@evgkch/machjs";
import { dockEdge } from "../../shell.js";
import {
  MachjsDesk,
  MachjsDiagram,
  MachjsEditor,
  ensemble,
  flaws,
  fromMachine,
  fromText,
  newFocus,
  palette,
  ruleId,
} from "@evgkch/machjs-inspector/ui";
import type { Ensemble, Subject, Written } from "@evgkch/machjs-inspector/ui";
import { QUORUM, flow } from "./machine.js";
import { gate, read } from "./gate.js";
import type { Closed, Fault } from "./types.js";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// The three panels are written in a `<template>` and placed here, so the markup keeps them
// together with the rest of the page while the script decides which column they stand in.
el<HTMLElement>("sheets").append(
  el<HTMLTemplateElement>("panels").content.cloneNode(true),
);

/*
 * The three widgets this page wires itself are built here rather than written in the markup.
 * A widget class that appears only where a type is expected is dropped by the transform, and the
 * tag would be left in the page unupgraded; naming the class as a value registers it. The
 * markup keeps the slot each one stands in.
 */
const editor = new MachjsEditor();
el<HTMLElement>("paper").append(editor);

/** The submission, drawn. */
const drawn = new MachjsDiagram();
el<HTMLElement>("drawn").append(drawn);

/** The review pipeline, drawn — a different machine, and the one this example is about. */
const pipeline = new MachjsDiagram();
el<HTMLElement>("flow").append(pipeline);
const sayOut = el<HTMLElement>("say");
const fileOut = el<HTMLElement>("file");
const why = el<HTMLInputElement>("why");
const roundOut = el<HTMLElement>("round");
const faultsOut = el<HTMLUListElement>("faults");
const settledBox = el<HTMLElement>("settled");
const closedOut = el<HTMLUListElement>("closed");
const signsOut = el<HTMLElement>("signs");
const feed = el<HTMLOListElement>("feed");
const submit = el<HTMLButtonElement>("submit");
const ship = el<HTMLButtonElement>("ship");
const withdraw = el<HTMLButtonElement>("withdraw");

/** The board: one row per member, the name in `data-who`. Nothing else lists the members. */
const members = [...document.querySelectorAll<HTMLLIElement>("[data-who]")].map(
  (row) => {
    const who = row.dataset["who"]!;
    return {
      who,
      row,
      mark: row.querySelector<HTMLElement>(".mark")!,
      sign: row.querySelector<HTMLButtonElement>("[data-sign]")!,
      ask: row.querySelector<HTMLButtonElement>("[data-ask]")!,
    };
  },
);

// ── the keys, and the signature ─────────────────────────────────────────────

/** One P-256 keypair per board member, generated on load. A real pipeline would look them up. */
const keys = new Map<string, CryptoKeyPair>();
for (const { who } of members)
  keys.set(
    who,
    await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ),
  );

/** The signature itself: ECDSA over the document text, hex-encoded. */
async function autograph(who: string, text: string): Promise<string> {
  const bytes = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.get(who)!.privateKey,
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── the submission, read once and shown twice ───────────────────────────────
//
// The editor and the drawing share one focus, so pointing at a line bands the arc and pointing at
// an arc lights the line. Behind the drawing stands a real machine built out of the submitted
// text — which is what lets a gutter mark run the schema under review, in the middle of reviewing
// it.

const focus = newFocus();

/** The submission as a running machine, rebuilt whenever the text reads as a different one. */
let shown: Ensemble | null = null;
let subject: Subject | null = null;
let watching: (() => boolean) | null = null;

/** The rule a gutter mark names, in the one spelling everything that names a rule uses. */
const idOfWritten = (r: Written) => ruleId(r.edge.from, r.edge.on, r.slot);

editor.wiring = {
  focus,
  onEdit: () => {
    // Straight to the machine: a keystroke folds into the context, and the reading below is what
    // is slower. Where `write` has no rule, the machine refuses and the text is put back.
    if (!flow.dispatch("write", editor.text()).ok) editor.set(text());
    later();
  },
  fires: (r) => subject?.drive?.can(idOfWritten(r)) ?? false,
  here: () => subject?.at ?? "",
  fire: (r) => shown?.fire(idOfWritten(r)),
};

/** The text the machine holds — the one the signatures are over. */
const text = () => flow.state.context.doc.text;

/**
 * Read the text and show what it turned out to be.
 *
 * A complaint stops here: the last good drawing stays on the screen beside the line that broke,
 * which is what a reviewer wants to compare against. A reading rebuilds the machine behind the
 * drawing, because a schema is not something a running machine can be edited into.
 */
function reread(): void {
  const got = read(editor.text());
  if (!got.ok) {
    editor.blame(got.say, got.line);
    sayOut.textContent = got.say;
    return;
  }
  editor.blame(null, null);
  sayOut.textContent = "";
  editor.show(
    got.rules,
    palette(got.graph, got.start),
    flaws(got.graph, got.start),
  );

  watching?.();
  shown?.destroy();
  subject?.stop();
  subject = null;
  const next = (subject = fromText(got.graph, got.start));
  shown = ensemble(next, { diagram: drawn }, { focus });
  shown.draw();
  // The gutter marks say which rules could fire from where the submitted machine stands, so they
  // are refreshed by the same thing that moves it.
  watching = next.watch(() => editor.mark());
  editor.mark();
}

/** The reading is per keystroke and the rebuild is not: 200 ms of quiet, as the inspector waits. */
let soon: ReturnType<typeof setTimeout> | undefined;
function later(): void {
  clearTimeout(soon);
  soon = setTimeout(reread, 200);
}

// ── input: straight to the machine, with no phase test on the way ───────────

submit.addEventListener("click", () => flow.dispatch("submit"));
ship.addEventListener("click", () => flow.dispatch("ship"));
withdraw.addEventListener("click", () => flow.dispatch("withdraw"));

for (const { who, sign, ask } of members) {
  // The signature is computed over the text as it stands; whether the machine still accepts the
  // event after the await is the machine's answer, as everywhere else.
  sign.addEventListener("click", async () =>
    flow.dispatch("sign", { who, sig: await autograph(who, text()) }),
  );
  // The reason box is cleared only if the dispatch was accepted — the verdict's `ok` says so.
  ask.addEventListener("click", () => {
    const sent = flow.dispatch("reject", {
      who,
      why: why.value.trim() || "no reason given",
    });
    if (sent.ok) why.value = "";
  });
}

// ── the gate, driven by what the machine emits ──────────────────────────────

// `setTimeout`, because a nested `dispatch` answers `BUSY`; the 700 ms stand in for CI.
flow.rx.on("gate", ({ text }) => {
  setTimeout(() => flow.dispatch("checked", gate(text)), 700);
});

/** Everything the machine says happened, in the order it happened. The page keeps no other log. */
flow.rx.on("logged", ({ line }) => {
  const row = document.createElement("li");
  row.textContent = line;
  feed.prepend(row);
});

// ── drawing ─────────────────────────────────────────────────────────────────

/** One row of two lines: what it is about, and what it says. Text is set, never interpolated. */
const item = (cls: string, where: string, what: string) => {
  const row = document.createElement("li");
  row.className = cls;
  const a = document.createElement("span");
  a.className = "where";
  a.textContent = where;
  const b = document.createElement("span");
  b.className = "what";
  b.textContent = what;
  row.append(a, b);
  return row;
};

const fault = (f: Fault) => item(f.rank, f.where, f.what);

/** An item that was raised and answered — kept, and marked as the round it belonged to. */
const closed = (c: Closed) =>
  item("done", `round ${c.round} · ${c.by}`, c.what);

/**
 * One function, run after every transition, that reads the machine and nothing else.
 *
 * The state is a discriminated union, so `s.type` narrows `s.context`: inside the `review` branch
 * the signatures are in scope and the fault list is not, because a document in review has no
 * fault list. The compiler is enforcing the same thing the schema is, which is the whole reason
 * the context belongs to the state.
 */
function paint(): void {
  const s = flow.state;
  document.body.dataset["phase"] = s.type;
  fileOut.textContent = s.context.doc.name;

  // The text comes from the machine. It is written back only when the two have actually parted —
  // an undo from another phase, or an edit the schema refused — because writing it resets the
  // caret.
  if (editor.text() !== s.context.doc.text) {
    editor.set(s.context.doc.text);
    later();
  }

  // What is open right now, which is a fact about the phase and lasts as long as the phase does.
  faultsOut.replaceChildren(
    ...(s.type === "blocked"
      ? s.context.faults.map(fault)
      : s.type === "review"
        ? s.context.notes.map(fault)
        : s.type === "changes"
          ? [item("caution", s.context.by, s.context.asked)]
          : []),
  );

  // And what has been answered, which is a fact about the submission and outlives every phase of
  // it. Both come off the same context; only one of them is still open.
  closedOut.replaceChildren(...s.context.closed.map(closed));
  settledBox.hidden = s.context.closed.length === 0;

  const held =
    s.type === "review" || s.type === "approved" || s.type === "shipped"
      ? s.context.signs
      : [];
  signsOut.textContent = `${held.length} / ${QUORUM}`;

  roundOut.textContent =
    s.type === "checking"
      ? "at the gate…"
      : s.context.round === 0
        ? "not submitted"
        : `round ${s.context.round}`;

  // Every control, from one question. `can` is answerable without moving the machine, because a
  // guard is the only thing that decides and guards are pure.
  submit.disabled = !flow.can("submit").ok;
  ship.disabled = !flow.can("ship").ok;
  withdraw.disabled = !flow.can("withdraw").ok;
  for (const { who, row, mark, sign, ask } of members) {
    sign.disabled = !flow.can("sign", { who, sig: "" }).ok;
    ask.disabled = !flow.can("reject", { who, why: "" }).ok;
    const given = held.find((x) => x.who === who);
    // The signature is the mark, eight hex digits of it — enough to see that two are not one.
    mark.textContent = given ? `${given.sig.slice(0, 8)}…` : "";
    if (given) row.dataset["signed"] = "";
    else delete row.dataset["signed"];
  }
}

flow.rx.on(TRANSITION, paint);
editor.set(text());
reread();
paint();

// ── the machine, drawn ────────────────────────────────────────────────────────
//
// The inspector's widgets on the review pipeline — a different machine from the one on the stage,
// and the one this example is about. The desk wires each to that subject and gives it a switch;
// the three panels of the deck take a switch on the same row.
const desk = new MachjsDesk();
desk.wiring = { subject: fromMachine(flow) };
el<HTMLElement>("board").append(desk);
desk.enroll(document.querySelector("machjs-legend")!);
desk.enroll(pipeline, "diagram");
desk.enroll(document.querySelector("machjs-history")!);

/** The deck's panels, by the name their switch carries. */
const own = ["sheet", "notes", "trace"].map(
  (name) => [name, el<HTMLElement>(name)] as const,
);
for (const [name] of own) desk.seat(name);

/**
 * The arrangement records only what a reader has touched, so a name absent from it was never
 * switched — and a panel nobody has switched is up.
 */
const panels = desk.panels;
function dress() {
  const up = panels.state.context;
  for (const [name, box] of own) box.hidden = up[name] === false;
}
panels.rx.on(TRANSITION, dress);
dress();

// Where the panels stand — the reader's call, kept for this page.
dockEdge(document.getElementById("board")!, "bottom");
