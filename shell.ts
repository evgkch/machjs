/**
 * The shell's one control: which edge the dock stands on.
 *
 * The panels are the reader's, not the page's — where they sit is a question about the screen in
 * front of them, not about the example. A wide subject in narrow columns wants them along the
 * bottom; a tall one wants them down the side. So the choice is offered rather than decided, and
 * remembered per page.
 *
 * The edge is written on `<body>` and read from the stylesheet. Nothing in an example refers to
 * it, and no widget is told anything: they are laid out by the shell either way.
 */
export type Edge = "right" | "bottom";

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
