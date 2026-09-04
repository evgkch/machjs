**English** · [Русский](README.ru.md)

# machjs — examples

Examples for [`@evgkch/machjs`](https://github.com/evgkch/machjs), a small typed Mealy state machine. Each one is a working page built on the library and the inspector's widgets: plain HTML and TypeScript, no framework. Every example comes with a walkthrough of the same code, line by line.

**Live: [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)**

| Example                                  | Demo                                                       | Walkthrough                                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`selection-rect`](selection-rect)       | [open](https://evgkch.github.io/machjs/selection-rect/)     | [English](selection-rect/README.md) · [Русский](selection-rect/README.ru.md)       |
| [`review`](review)                       | [open](https://evgkch.github.io/machjs/review/)             | [English](review/README.md) · [Русский](review/README.ru.md)                       |
| [`wire`](wire)                           | [open](https://evgkch.github.io/machjs/wire/)               | [English](wire/README.md) · [Русский](wire/README.ru.md)                           |
| [`token`](token)                         | [open](https://evgkch.github.io/machjs/token/)              | [English](token/README.md) · [Русский](token/README.ru.md)                         |

## Running locally

The examples are a workspace of [`evgkch/machjs`](https://github.com/evgkch/machjs), and one Vite project holds every one of them: the index page is at the root, each example at its own path. From the repository root:

```sh
npm ci
npm run dev:examples   # builds the library and the widgets, then http://localhost:5173
```

In this directory, once the library and the inspector's package are built:

```sh
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + build to dist/
npm run preview   # serve the build
npm test          # every page in a DOM: the machine is driven, the widgets are checked
```

The library and the widgets come from the workspace, not from npm: after a change in `packages/core` or `packages/inspector`, rebuild that package.

## The shell

Three files at the root are shared by every example page:

| File                           | What it holds                                                                |
| ------------------------------ | ---------------------------------------------------------------------------- |
| [`page.css`](page.css)         | The running text and the two properties the tokens have no opinion about      |
| [`shell.css`](shell.css)       | The full-screen frame: the bar, the stage, the dock, the deck — and the skin  |
| [`shell.ts`](shell.ts)         | `dockEdge` — the switch that moves the panels between the side and the bottom |

An example writes `@import "../../shell.css";` and then `@layer subject { … }`, and styles what is on the stage.

**The tool is Gruvbox.** A region marked `class="tool"` — the dock, the bar's switches, a legend standing under a machine — is painted in Gruvbox in both schemes, while the page keeps the tokens' own palette.

The schema under review in `review` is edited in `machjs-editor` and drawn in `machjs-diagram`, and it is the document, not the instrument — so it stands outside a marked region and keeps the page's colours, while the pipeline reviewing it sits in the dock, in the tool's.

The skin is a block of custom properties and nothing more: the widgets read the palette as custom properties, and custom properties inherit through a shadow root.

## Adding an example

1. A directory with `index.html` and `src/`, next to `selection-rect`. Asset paths in the markup are relative — `./src/main.ts`, not `/src/main.ts`.
2. An entry in `build.rollupOptions.input` in [`vite.config.ts`](vite.config.ts): Vite does not look for pages on its own.
3. A card in [`index.html`](index.html) — copy the existing `<li class="card">` and change the text and links.

## The site

[evgkch.github.io/machjs](https://evgkch.github.io/machjs/) is built from this directory by `.github/workflows/pages.yml` on every push to `master`, with the inspector's pages under `/inspector/`.

MIT.
