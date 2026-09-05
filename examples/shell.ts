/**
 * What every example page arranges the same way: the element by id, and the row of switches over
 * the desk, the widgets and the page's own panels.
 *
 * The panels are the reader's, not the page's — where they sit is a question about the screen in
 * front of them, not about the example. A wide subject in narrow columns wants them along the
 * bottom; a tall one wants them down the side. So the choice is offered rather than decided, and
 * remembered per page.
 *
 * The edge is written on `<body>` and read from the stylesheet. Nothing in an example refers to
 * it, and no widget is told anything: they are laid out by the shell either way.
 */
import { TRANSITION } from "@evgkch/machjs";
import { MachjsDesk } from "@evgkch/machjs-inspector/ui";
import type { Subject } from "@evgkch/machjs-inspector/ui";

export type Edge = "right" | "bottom";

/** The element by id. Every page reaches for one; none needs its own way to. */
export const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const EDGES: readonly { edge: Edge; word: string; title: string }[] = [
  { edge: "right", word: "side", title: "Panels down the right side" },
  { edge: "bottom", word: "below", title: "Panels along the bottom" },
];

/**
 * Where this page's panels were left last time.
 *
 * Wrapped, because a browser may refuse storage outright — a private window, or site data turned
 * off — and a page that cannot remember a preference should still open.
 */
function remembered(key: string): Edge | null {
  try {
    const was = localStorage.getItem(key);
    return was === "right" || was === "bottom" ? was : null;
  } catch {
    return null;
  }
}

function remember(key: string, edge: Edge): void {
  try {
    localStorage.setItem(key, edge);
  } catch {
    /* nothing to do: the choice holds for this visit and no longer. */
  }
}

/**
 * Put the switch in `host` — the bar's slot, beside the desk's own switches, because both are
 * controls of the tool rather than of the example.
 */
export function dockEdge(host: HTMLElement, fallback: Edge = "right"): void {
  const key = `machjs-examples:dock:${location.pathname}`;
  let edge: Edge = remembered(key) ?? fallback;

  const box = document.createElement("div");
  box.className = "edge";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Where the panels stand");

  const buttons = EDGES.map(({ edge: which, word, title }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = word;
    button.title = title;
    button.addEventListener("click", () => put(which));
    box.append(button);
    return [which, button] as const;
  });

  function put(which: Edge): void {
    edge = which;
    document.body.dataset["dock"] = edge;
    for (const [own, button] of buttons)
      button.setAttribute("aria-pressed", String(own === edge));
    remember(key, edge);
  }

  put(edge);
  host.prepend(box);
}

/**
 * The row of switches, and the panels under it.
 *
 * The desk wires each widget to one subject and gives it a switch; `seat` registers a name and
 * draws a switch that shows nothing, for a panel the page lays out itself. So one row governs the
 * whole screen, and turning every switch off leaves the subject alone on it.
 *
 * `enroll` runs before the page's own panels are seated, because the switches stand in the order
 * they were registered: the widgets first, then the page's.
 *
 * The arrangement records only what a reader has touched — a name absent from it was never
 * switched, and a panel nobody has switched is up. So the test is against `false` and not against
 * absence. Subscribed to `TRANSITION` rather than to the clicks: the switch is one way to move
 * that machine and not necessarily the only one.
 */
export function board({
  subject,
  enroll,
  own = [],
  edge = "right",
}: {
  subject: Subject;
  enroll?: (desk: MachjsDesk) => void;
  /**
   * Panels the page lays out itself: the name its switch carries, and the element it stands on
   * where the two differ.
   */
  own?: readonly (string | readonly [name: string, id: string])[];
  edge?: Edge;
}): MachjsDesk {
  const host = el<HTMLElement>("board");
  const desk = new MachjsDesk();
  desk.wiring = { subject };
  host.append(desk);

  enroll?.(desk);

  const panels = own.map((it) => {
    const [name, id] = typeof it === "string" ? [it, it] : it;
    return [name, el<HTMLElement>(id)] as const;
  });
  for (const [name] of panels) desk.seat(name);

  const dress = () => {
    const up = desk.panels.state.context;
    for (const [name, box] of panels) box.hidden = up[name] === false;
  };
  desk.panels.rx.on(TRANSITION, dress);
  dress();

  dockEdge(host, edge);
  return desk;
}
