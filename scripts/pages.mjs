// The examples, pressed: each page runs in a DOM, its machine is driven with real payloads, and
// every widget is checked against the machine after every move. Any uncaught error fails the
// run. `npm test`; exits 1 on the first count that disagrees.
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const { Window } = await import(`${root}/node_modules/happy-dom/lib/index.js`);
const { createServer } = await import(
  `${root}/node_modules/vite/dist/node/index.js`
);

let failed = 0;
const eq = (name, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: ${String(got)}${ok ? "" : ` (want ${String(want)})`}`,
  );
};
const tick = () => new Promise((r) => setTimeout(r, 60));

/** One page in a DOM: its window, and the errors nothing caught. */
async function raise(page) {
  const win = new Window({ url: `http://localhost/${page}/` });
  const html = fs
    .readFileSync(`${root}/${page}/index.html`, "utf8")
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, "");
  win.document.write(html);
  const caught = [];
  win.addEventListener("error", (e) => caught.push(e.message ?? String(e)));
  for (const k of [
    "window",
    "document",
    "customElements",
    "HTMLElement",
    "SVGElement",
    "ResizeObserver",
    "getComputedStyle",
    "CSSStyleSheet",
    "requestAnimationFrame",
    "location",
    "navigator",
  ]) {
    try {
      Object.defineProperty(globalThis, k, {
        value: win[k] ?? win.window[k],
        configurable: true,
      });
    } catch {}
  }
  for (const k of ["addEventListener", "removeEventListener", "dispatchEvent"])
    Object.defineProperty(globalThis, k, {
      configurable: true,
      value: win[k].bind(win),
    });
  Object.defineProperty(globalThis, "Option", {
    configurable: true,
    value: function (text, value) {
      const o = win.document.createElement("option");
      if (text !== undefined) o.textContent = String(text);
      if (value !== undefined) o.value = String(value);
      return o;
    },
  });
  const trap = (e) => caught.push(String(e?.message ?? e));
  process.on("uncaughtException", trap);
  process.on("unhandledRejection", trap);
  const server = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true },
    ssr: {
      noExternal: [
        "@evgkch/machjs-inspector",
        "@evgkch/machjs",
        "@evgkch/chanjs",
      ],
    },
  });
  const done = async () => {
    process.off("uncaughtException", trap);
    process.off("unhandledRejection", trap);
    await server.close();
  };
  return { win, server, caught, done };
}

const q = (el, sel) => el.shadowRoot.querySelectorAll(sel).length;
const here = (el) =>
  el.shadowRoot.querySelector(".word.here, g.chip.here text")?.textContent;

// ── selection-rect ────────────────────────────────────────────────────────────
{
  console.log("— selection-rect —");
  const { win, server, caught, done } = await raise("selection-rect");
  try {
    await server.ssrLoadModule("/selection-rect/src/main.ts");
    const { sel } = await server.ssrLoadModule(
      "/selection-rect/src/machine.ts",
    );
    await tick();

    const desk = win.document.querySelector("machjs-desk");
    const leg = win.document.querySelector("machjs-legend");
    const dia = win.document.querySelector("machjs-diagram");
    const hist = win.document.querySelector("machjs-history");
    // Three widgets and the two panels the page lays out itself, on one row of switches.
    eq("desk switches", q(desk, "label"), 5);
    eq("legend words", q(leg, ".word"), 5);
    eq("standing at", here(leg), "empty");
    eq("open arcs at empty", q(dia, "g.arc.can"), 1);
    eq("dim arcs at empty", q(dia, "g.arc.dim"), 14);
    const caps = [...dia.shadowRoot.querySelectorAll(".caps text")].map(
      (c) => c.textContent,
    );
    const downs = caps.filter((c) => c.startsWith("down"));
    eq("three downs, told apart by their guards", new Set(downs).size, 3);
    eq(
      "a guard rides the label",
      downs.some((c) => c.includes("· onHandle")),
      true,
    );

    // A whole drag, with the payloads the page would build.
    const at = (x, y) => ({ x, y, area: { w: 400, h: 300 } });
    sel.dispatch("down", at(10, 10));
    await tick();
    eq("drawing — legend follows", here(leg), "drawing");
    eq("drawing — diagram follows", here(dia), "drawing");
    eq("the taken arrow runs its dashes", q(dia, "g.arc.took"), 1);
    sel.dispatch("move", at(40, 40));
    sel.dispatch("move", at(80, 60));
    await tick();
    eq("the self-loop runs while dragging", q(dia, "g.arc.took"), 1);
    sel.dispatch("up");
    await tick();
    eq("ready — legend follows", here(leg), "ready");
    eq("ready — diagram follows", here(dia), "ready");
    eq("the run is on the board", q(hist, ".step") > 0, true);
    eq(
      "the readout shows the rectangle",
      /×/.test(win.document.getElementById("rect").textContent),
      true,
    );

    // Undo one whole drag, from the page's own key.
    win.dispatchEvent(
      new win.KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
      }),
    );
    await tick();
    eq("undo — legend back at", here(leg), "empty");
    eq("undo — diagram back at", here(dia), "empty");
    eq("undo — no arrow still running", q(dia, "g.arc.took"), 0);

    eq("uncaught errors", caught.length, 0);
    if (caught.length) console.log("  caught:", caught.slice(0, 3));
  } catch (e) {
    failed++;
    console.log("FAIL  the page did not load:", e.message);
  } finally {
    await done();
  }
}

// ── review ────────────────────────────────────────────────────────────────────
{
  console.log("— review —");
  const { win, server, caught, done } = await raise("review");
  try {
    await server.ssrLoadModule("/review/src/main.ts");
    const { flow } = await server.ssrLoadModule("/review/src/machine.ts");
    await tick();

    const leg = win.document.querySelector("machjs-legend");
    // Two diagrams on this page: the submission under review, and the pipeline reviewing it.
    // The pipeline's is the one the widgets are checked against.
    const drawn = win.document.querySelector("#drawn machjs-diagram");
    const dia = win.document.querySelector("#flow machjs-diagram");
    const hist = win.document.querySelector("machjs-history");
    eq("legend words", q(leg, ".word"), 7);
    eq("standing at", here(leg), "draft");
    // The document under review is a schema, and the page draws it: two states, and an arc each.
    eq("the submission is drawn", q(drawn, "g.arc") > 0, true);
    eq("the submission stands at its own start", here(drawn), "locked");

    // A submission the gate refuses: `b` is a state no rule leads to, so nothing reaches it.
    flow.dispatch("write", "FROM a ON go TO a\nFROM b ON back TO b");
    await tick();
    eq("write — a step on the board", q(hist, ".step"), 1);
    eq("write — the taken arrow runs", q(dia, "g.arc.took"), 1);
    flow.dispatch("submit");
    await tick();
    eq("checking — legend follows", here(leg), "checking");
    await new Promise((r) => setTimeout(r, 900));
    eq("the gate answered — legend follows", here(leg), "blocked");
    eq("the diagram stands with it", here(dia), "blocked");
    eq("three steps on the board", q(hist, ".step"), 3);

    eq("uncaught errors", caught.length, 0);
    if (caught.length) console.log("  caught:", caught.slice(0, 3));
  } catch (e) {
    failed++;
    console.log("FAIL  the page did not load:", e.message);
  } finally {
    await done();
  }
}

// ── wire ──────────────────────────────────────────────────────────────────────
//
// Two machines and the wire between them. The wire is driven directly rather than through the
// page's controls, so the crossing takes no real time and the run is deterministic.
{
  console.log("— wire —");
  const { win, server, caught, done } = await raise("wire");
  try {
    await server.ssrLoadModule("/wire/src/main.ts");
    const { terminal, money } = await server.ssrLoadModule(
      "/wire/src/terminal.ts",
    );
    const { host, FLOAT } = await server.ssrLoadModule("/wire/src/host.ts");
    await tick();

    const legends = win.document.querySelectorAll("machjs-legend");
    eq("a legend per machine", legends.length, 2);
    eq("the terminal's states", q(legends[0], ".word"), 5);
    eq("the host's states", q(legends[1], ".word"), 2);
    eq("the terminal stands at", here(legends[0]), "idle");
    eq("the host stands at", here(legends[1]), "listening");

    // 5.00 €, typed.
    for (const digit of ["5", "0", "0"]) terminal.dispatch("key", { digit });
    await tick();
    eq(
      "the amount is on the screen",
      win.document.getElementById("amount").textContent,
      money(500),
    );
    eq("send is open", terminal.can("send").ok, true);

    terminal.dispatch("send");
    await tick();
    eq("waiting — the terminal follows", here(legends[0]), "waiting");
    // The keypad is dead because `waiting` has no `key` rule, and nothing was disabled to do it.
    eq("the keypad is dead", terminal.can("key", { digit: "1" }).ok, false);

    // The wire, by hand: the question crosses, the host checks, the answer crosses back.
    const ask = { ticket: 1, pan: terminal.state.context.pan, amount: 500 };
    eq("the host takes the question", host.dispatch("auth", ask).ok, true);
    await tick();
    eq("checking — the host follows", here(legends[1]), "working");
    eq("the host answers it", host.dispatch("ready", { ticket: 1 }).ok, true);
    await tick();
    eq("the balance moved once", host.state.context.balance, FLOAT - 500);

    // The same question again, the way a wire that copies delivers it: answered off the file,
    // and the balance does not move a second time.
    eq("a repeat is taken", host.dispatch("auth", ask).ok, true);
    eq("and the balance is unchanged", host.state.context.balance, FLOAT - 500);
    eq("still listening", here(legends[1]), "listening");

    const said = host.state.context.seen[1];
    eq("the answer is on file", said.ok, true);
    eq(
      "approved — the terminal follows",
      terminal.dispatch("said", said).ok,
      true,
    );
    await tick();
    eq("the terminal stands at", here(legends[0]), "approved");

    // The copy of that answer, arriving after the terminal has left `waiting`: no rule for it.
    const late = terminal.dispatch("said", said);
    eq("a straggler is refused", late.ok, false);
    eq("and says why", late.error.name, "UnhandledError");

    eq("uncaught errors", caught.length, 0);
    if (caught.length) console.log("  caught:", caught.slice(0, 3));
  } catch (e) {
    failed++;
    console.log("FAIL  the page did not load:", e.message);
  } finally {
    await done();
  }
}

// ── token ─────────────────────────────────────────────────────────────────────
//
// One machine, and the property the example exists for: five callers refused at once fetch one
// token. The machine is driven directly, so the run takes no real time.
{
  console.log("— token —");
  const { win, server, caught, done } = await raise("token");
  try {
    await server.ssrLoadModule("/token/src/main.ts");
    const { auth } = await server.ssrLoadModule("/token/src/machine.ts");
    await tick();

    const leg = win.document.querySelector("machjs-legend");
    const dia = win.document.querySelector("machjs-diagram");
    const hist = win.document.querySelector("machjs-history");
    eq("legend words", q(leg, ".word"), 3);
    eq("standing at", here(leg), "ok");

    // Five callers refused. The first starts the fetch; the other four only count.
    let asked = 0;
    auth.rx.on("refresh", () => asked++);
    for (let i = 0; i < 5; i++) auth.dispatch("denied");
    await tick();
    eq("refreshing — the legend follows", here(leg), "refreshing");
    eq("five waiting", auth.state.context.waiting, 5);
    eq("and one fetch, not five", asked, 1);
    // No token to reach for while one is being fetched: the context has no such field.
    eq("no token in refreshing", "token" in auth.state.context, false);

    let woke = 0;
    auth.rx.on("wake", () => woke++);
    auth.dispatch("renewed", { token: "tok-1" });
    await tick();
    eq("back to ok", here(leg), "ok");
    eq("the waiting were woken once", woke, 1);
    eq("with the new token", auth.state.context.token, "tok-1");
    eq("the diagram stands with it", here(dia), "ok");

    // A failed refresh refuses everyone rather than leaving them waiting.
    let gaveUp = 0;
    auth.rx.on("giveUp", () => gaveUp++);
    auth.dispatch("denied");
    auth.dispatch("failed", { why: "the refresh endpoint answered 500" });
    await tick();
    eq("dead — the legend follows", here(leg), "dead");
    eq("the waiting were refused", gaveUp, 1);
    eq(
      "and a later caller is refused at once",
      auth.dispatch("denied").ok,
      true,
    );
    eq("refused, not queued", gaveUp, 2);

    // `dead` is not a dead end: `validate` would say so, and the schema has the way back.
    eq("the way back is offered", auth.can("retry").ok, true);
    auth.dispatch("retry");
    await tick();
    eq("refreshing again", here(leg), "refreshing");
    eq("the run is on the board", q(hist, ".step") > 0, true);

    eq("uncaught errors", caught.length, 0);
    if (caught.length) console.log("  caught:", caught.slice(0, 3));
  } catch (e) {
    failed++;
    console.log("FAIL  the page did not load:", e.message);
  } finally {
    await done();
  }
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
