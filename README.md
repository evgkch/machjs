**English** · [Русский](README.ru.md)

<p align="center">
  <a href="https://www.npmjs.com/package/@evgkch/machjs"><img alt="npm: @evgkch/machjs" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs?color=cb3837&logo=npm&label=machjs"></a>
  <a href="https://www.npmjs.com/package/@evgkch/machjs-inspector"><img alt="npm: @evgkch/machjs-inspector" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs-inspector?color=cb3837&logo=npm&label=inspector"></a>
  <a href="https://github.com/evgkch/machjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/evgkch/machjs/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

# machjs

A Mealy state machine for TypeScript: one table of rules, a context that belongs to the state rather than to the machine, and a graph that is a projection of the same object — serialize it, draw it, analyse it. The repository holds the library, the inspector that draws its machines, and the examples that run on both.

<p align="center">
  <a href="packages/core/README.md">Guide</a> ·
  <a href="https://evgkch.github.io/machjs/">Examples</a> ·
  <a href="https://evgkch.github.io/machjs/inspector/">Inspector</a> ·
  <a href="https://github.com/evgkch/machjs/issues">Issues</a>
</p>

---

## What is here

| Directory                                  | Package                                                                              | What is in it                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`packages/core`](packages/core)           | [`@evgkch/machjs`](https://www.npmjs.com/package/@evgkch/machjs)                     | The machine, and the schema it is written as                 |
| [`packages/inspector`](packages/inspector) | [`@evgkch/machjs-inspector`](https://www.npmjs.com/package/@evgkch/machjs-inspector) | Six widgets, the two pages, the relay, the palette           |
| [`examples`](examples)                     | private                                                                              | Four pages on the library and the widgets, a walkthrough each |

`packages/` holds the published packages, and nothing else. `analysis`, `formatters` and `debug` are entry points of `@evgkch/machjs`, not packages of their own: they share its version and import one another.

## Documentation

| Document                                                                                                | What it covers                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Guide](packages/core/README.md) · [Руководство](packages/core/README.ru.md)                             | The rule language, the schema, the verdicts, the graph, analysis |
| [Inspector](packages/inspector/README.md) · [Инспектор](packages/inspector/README.ru.md)                 | The entry points, the widgets, the relay, the schema files       |
| [Examples](examples/README.md) · [Примеры](examples/README.ru.md)                                        | The four pages and the shell they share                          |
| [Contributing](CONTRIBUTING.md) · [Как работать](CONTRIBUTING.ru.md)                                     | Building, the tests, releasing                                   |

## Sites

| Site          | Address                                                                          |
| ------------- | ---------------------------------------------------------------------------------- |
| The examples  | [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)                      |
| The inspector | [evgkch.github.io/machjs/inspector](https://evgkch.github.io/machjs/inspector/)   |

Both are published from `master` by [`pages.yml`](.github/workflows/pages.yml).

## License

[MIT](LICENSE)
