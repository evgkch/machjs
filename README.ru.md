[English](README.md) · **Русский**

<p align="center">
  <a href="https://www.npmjs.com/package/@evgkch/machjs"><img alt="npm: @evgkch/machjs" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs?color=cb3837&logo=npm&label=machjs"></a>
  <a href="https://www.npmjs.com/package/@evgkch/machjs-inspector"><img alt="npm: @evgkch/machjs-inspector" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs-inspector?color=cb3837&logo=npm&label=inspector"></a>
  <a href="https://github.com/evgkch/machjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/evgkch/machjs/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Лицензия MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

# machjs

Автомат Мили для TypeScript. Поведение задаётся одной таблицей правил, контекст привязан к состоянию, а не к автомату, а граф — проекция того же объекта: его сериализуют, рисуют и анализируют. В репозитории лежат библиотека, инспектор, который рисует её автоматы, и примеры на том и другом.

<p align="center">
  <a href="packages/core/README.ru.md">Руководство</a> ·
  <a href="https://evgkch.github.io/machjs/">Примеры</a> ·
  <a href="https://evgkch.github.io/machjs/inspector/">Инспектор</a> ·
  <a href="https://github.com/evgkch/machjs/issues">Issues</a>
</p>

---

## Что здесь лежит

| Каталог                                    | Пакет                                                                                | Что внутри                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [`packages/core`](packages/core)           | [`@evgkch/machjs`](https://www.npmjs.com/package/@evgkch/machjs)                     | Автомат и схема, которой он задаётся                            |
| [`packages/inspector`](packages/inspector) | [`@evgkch/machjs-inspector`](https://www.npmjs.com/package/@evgkch/machjs-inspector) | Шесть виджетов, две страницы, реле, палитра                     |
| [`examples`](examples)                     | приватный                                                                            | Четыре страницы на библиотеке и виджетах, к каждой разбор       |

В `packages/` лежат публикуемые пакеты и ничего кроме них. `analysis`, `formatters` и `debug` — точки входа пакета `@evgkch/machjs`, а не отдельные пакеты: у них общая версия, и они импортируют друг друга.

## Документация

| Документ                                                                                     | О чём                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Руководство](packages/core/README.ru.md) · [Guide](packages/core/README.md)                 | Язык правил, схема, вердикты, граф, анализ                       |
| [Инспектор](packages/inspector/README.ru.md) · [Inspector](packages/inspector/README.md)     | Точки входа, виджеты, реле, файлы схем                           |
| [Примеры](examples/README.ru.md) · [Examples](examples/README.md)                             | Четыре страницы и общая для них оболочка                         |
| [Как работать](CONTRIBUTING.ru.md) · [Contributing](CONTRIBUTING.md)                          | Сборка, тесты, выпуск                                            |

## Сайты

| Сайт      | Адрес                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| Примеры   | [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)                       |
| Инспектор | [evgkch.github.io/machjs/inspector](https://evgkch.github.io/machjs/inspector/)    |

Оба публикуются из `master` через [`pages.yml`](.github/workflows/pages.yml).

## Лицензия

[MIT](LICENSE)
