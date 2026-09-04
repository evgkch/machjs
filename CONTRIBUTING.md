**English** · [Русский](CONTRIBUTING.ru.md)

# Working in this repository

Node 22 or newer. Every command below runs from the repository root.

## Setup

```sh
npm ci
npm run build
```

The build runs three workspaces in order: `packages/core`, `packages/inspector`, `examples`. Each one takes the previous through its workspace link, and a link points at build output — `dist` for the library, `dist-lib` for the inspector. So `npm run typecheck` and `npm test` need a build before them: in a fresh clone, and after a change to a package's public types.

## Scripts

| Command                | What it does                                                            |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run build`        | The three workspaces, in order                                          |
| `npm run typecheck`    | `tsc --noEmit` in each of them                                          |
| `npm test`             | The three suites below                                                  |
| `npm run format`       | Prettier over the repository; `*.md` is laid out by hand and excluded   |
| `npm run dev:examples` | Builds the library and the inspector's package, then serves the examples |
| `npm run dev:inspector`| Builds the library, then serves the inspector's pages                   |
| `npm run site`         | `site/` out of the two builds: the examples at `/`, the inspector at `/inspector/` |

One workspace at a time: `npm run <script> -w <name>`, for example `npm test -w @evgkch/machjs`.

The relay — a WebSocket server for a machine running in another process — starts with `npm run inspect -w @evgkch/machjs-inspector`. The [inspector's README](packages/inspector/README.md#the-relay) says what crosses it.

[`pages.yml`](.github/workflows/pages.yml) builds the same `site/` on every push to `master` and deploys it: the examples at https://evgkch.github.io/machjs/, the inspector at https://evgkch.github.io/machjs/inspector/.

## The tests

| Suite                                  | What it presses                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/core/test/*.spec.ts`         | The kernel: dispatch, verdicts, re-entrancy, analysis, the formats                |
| `packages/inspector/scripts/matrix.mjs`| Every manual action on one widget against its reflection on the other three       |
| `examples/scripts/pages.mjs`           | Each example page in a DOM: the machine is driven, the widgets are counted        |

The first suite is jest. The last two run a real DOM (happy-dom) over the sources through Vite and exit 1 on the first count that disagrees: they are the library's integration tests, and what they press is the workspace, not the registry.

`packages/inspector/schemas/` holds dumps of the inspector's own machines, written by `npm run build -w @evgkch/machjs-inspector`. CI fails on a dump that was not committed.

## Conventions

- A commit message is one line that names the change. A version commit reads `0.5.0 — what changed`. No trailers.
- Prettier formats the code. Prose is laid out by hand: a table, a wrap and the width of a rule line carry meaning, and Prettier would reflow them.
- A comment states a constraint or an argument, in one to three sentences.
- `peerDependencies` in the inspector names the oldest library its adapters read correctly. A change to the library's public API that the inspector follows moves that range.

## Releasing

Two packages are published: `@evgkch/machjs` from `packages/core`, `@evgkch/machjs-inspector` from `packages/inspector`. A tag names the package and the version; [`publish.yml`](.github/workflows/publish.yml) builds the repository, runs the tests, checks the tag against the manifest, and publishes that one package with provenance. No token is stored here.

1. Set the version in the package's `package.json`.
2. Commit: `0.5.0 — …`.
3. Tag and push the tag.

```sh
git tag machjs@0.5.0 && git push origin machjs@0.5.0            # the library
git tag machjs-inspector@0.0.9 && git push origin machjs-inspector@0.0.9
```

Trusted publishing is set on npmjs.com once for each package, before the first tag: _Settings → Trusted publisher → GitHub Actions_, repository `evgkch/machjs`, workflow `publish.yml`.

## History before the move

The inspector, the examples and the palette were repositories of their own until `git subtree add` brought them in here, with all of their history. A subtree merge is where `git log --follow` and `git blame` stop. To read a file's history from before the move, name its path and ask for the full history:

```sh
git log --full-history -- packages/inspector/src/widgets/figure/figure.ts
git log --full-history -- examples/selection-rect/src/main.ts
```
