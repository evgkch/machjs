**English** · [Русский](README.ru.md)

# machjs — examples

Examples for [`@evgkch/machjs`](https://github.com/evgkch/machjs), a small typed Mealy state machine. Each one is a working page built on the published package: plain HTML and TypeScript, no framework. Every example comes with a walkthrough of the same code, line by line.

**Live: [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)**

| Example                                  | Demo                                                       | Walkthrough                                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`selection-rect`](selection-rect)       | [open](https://evgkch.github.io/machjs/selection-rect/)     | [English](selection-rect/README.md) · [Русский](selection-rect/README.ru.md)       |
| [`review`](review)                       | [open](https://evgkch.github.io/machjs/review/)             | [English](review/README.md) · [Русский](review/README.ru.md)                       |
| [`form`](form)                           | [open](https://evgkch.github.io/machjs/form/)               | [English](form/README.md) · [Русский](form/README.ru.md)                           |

## Running locally

One Vite project holds every example: the index page is at the root, each example at its own path.

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + build to dist/
npm run preview   # serve the build
```

The examples depend on the package from npm, so nothing has to be built in the library repository first. To try them against unreleased changes, build the library and link it — from the library checkout, then from this one:

```sh
npm run build && npm link      # in machjs
npm link @evgkch/machjs         # here
```

## Adding an example

1. A directory with `index.html` and `src/`, next to `selection-rect`. Asset paths in the markup are relative — `./src/main.ts`, not `/src/main.ts`.
2. An entry in `build.rollupOptions.input` in [`vite.config.ts`](vite.config.ts): Vite does not look for pages on its own.
3. A card in [`index.html`](index.html) — copy the existing `<li class="card">` and change the text and links.

## Relation to the library repository

[`evgkch/machjs`](https://github.com/evgkch/machjs) includes this repository as a submodule at `examples/`, and publishes the site from it: pushing here changes nothing on the site until the submodule pointer in `machjs` is moved to the new commit.

MIT.
