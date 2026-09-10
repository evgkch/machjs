[English](README.md) · **Русский**

<p align="center">
  <a href="https://www.npmjs.com/package/@evgkch/machjs"><img alt="npm: @evgkch/machjs" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs?color=cb3837&logo=npm&label=machjs"></a>
  <a href="https://www.npmjs.com/package/@evgkch/machjs-inspector"><img alt="npm: @evgkch/machjs-inspector" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs-inspector?color=cb3837&logo=npm&label=inspector"></a>
  <a href="https://github.com/evgkch/machjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/evgkch/machjs/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Лицензия MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

# machjs

Библиотека machjs реализует конечный автомат Мили для TypeScript: вы пишете таблицу правил, а получаете объект с `dispatch`, `can` и шиной выходных событий. Контекст привязан к состоянию, а не к автомату; ту же таблицу читают анализ, форматтеры и инспектор. В репозитории лежат библиотека, инспектор и примеры.

<p align="center">
  <a href="packages/core/README.ru.md">Руководство</a> ·
  <a href="https://evgkch.github.io/machjs/">Примеры</a> ·
  <a href="https://evgkch.github.io/machjs/inspector/">Инспектор</a> ·
  <a href="https://github.com/evgkch/machjs/issues">Issues</a>
</p>

---

## За минуту

### Шаг 1. Четыре слова

Правило состоит из четырёх слов: **FROM** состояние, **ON** событие, **TO** состояние и необязательное **EMIT** событие на выходе. Турникету хватает двух правил:

```text
FROM locked ON coin TO open   EMIT opened
FROM open   ON push TO locked
```

Те же два правила кодом. Схема раскладывает их в таблицу: состояние, событие, список правил для этой пары.

```ts
import { StateMachine } from "@evgkch/machjs";
import type { IState, IEvent, Merge } from "@evgkch/machjs";

type Q = IState<"locked" | "open">;                // состояния
type Σ = Merge<IEvent<"coin"> | IEvent<"push">>;   // входные события
type Λ = IEvent<"opened">;                         // выходные

const gate = new StateMachine<Q, Σ, Λ>(
  {
    locked: { coin: [{ to: "open", emit: "opened" }] },
    open:   { push: [{ to: "locked" }] },
  },
  { type: "locked", context: undefined },
);

gate.rx.on("opened", () => console.log("турникет открыт"));

gate.dispatch("push"); // UNHANDLED — в locked такого правила нет
gate.dispatch("coin"); // OK — переход, и на выходе opened
gate.state.type;       // "open"
```

В обработчике нет проверки фазы: событие уходит в `dispatch`, а что с ним будет, записано в схеме.

### Шаг 2. Ещё три слова

В полном правиле семь слов, и обязательны из них `FROM`, `ON` и `TO`:

```text
FROM <состояние> ON <событие> [WHEN <условие>] TO <состояние> [WITH <контекст>] [EMIT <событие> [BY <данные>]]
```

Порядок выполнения: `WHEN` → `TO` → `WITH` → `EMIT` → `BY`. `BY` работает с уже обновлённым контекстом.

Те же ворота, но проход стоит две монеты. Внесённая сумма лежит в контексте состояния, а не в автомате:

```text
FROM locked ON coin WHEN short TO locked WITH add
FROM locked ON coin            TO open   WITH add   EMIT opened BY fare
FROM open   ON push            TO locked WITH clear
```

```ts
import { StateMachine } from "@evgkch/machjs";
import type { IState, IEvent, Merge } from "@evgkch/machjs";

type Paid = { paid: number };

type Q = Merge<IState<"locked", Paid> | IState<"open", Paid>>;
type Σ = Merge<IEvent<"coin"> | IEvent<"push">>;
type Λ = IEvent<"opened", Paid>;

const FARE = 2;

const short = (c: Paid) => c.paid + 1 < FARE;    // WHEN: условие
const add = (c: Paid) => ({ paid: c.paid + 1 }); // WITH: контекст цели
const clear = () => ({ paid: 0 });
const fare = (c: Paid) => ({ paid: c.paid });    // BY: данные выходного события

const gate = new StateMachine<Q, Σ, Λ>(
  {
    locked: {
      coin: [
        { when: short, to: ["locked", add] },
        { to: ["open", add], emit: ["opened", fare] },
      ],
    },
    open: { push: [{ to: ["locked", clear] }] },
  },
  { type: "locked", context: { paid: 0 } },
);

gate.rx.on("opened", ({ paid }) => console.log(`открыто, уплачено ${paid}`));

gate.dispatch("coin"); // locked → locked, paid = 1
gate.dispatch("coin"); // locked → open,   paid = 2, на выходе opened
gate.dispatch("push"); // open   → locked, paid = 0
```

Первая монета оставляет ворота закрытыми: пока внесено меньше платы, `short` возвращает `true` и срабатывает первое правило. Второй монете это правило не подходит, и берётся следующее в той же ячейке; оно идёт без условия и открывает ворота. Безусловное правило стоит в ячейке последним: правило после него не сработает никогда, и `validate` из `analysis` находит его как `dead-rule`.

Текст правил выше не выдуман для документа: его печатает `toRules(gate.schema)` из `formatters`, и его же читает редактор инспектора.

`can` проверяет то же, что проверит следующий `dispatch`. Этим включают элементы управления, не проверяя фазу вручную.

```ts
button.disabled = !gate.can("push").isOk();
```

Об остальном написано в [руководстве](packages/core/README.ru.md).

## Что здесь лежит

| Каталог                                    | Пакет                                                                                | Что внутри                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [`packages/core`](packages/core)           | [`@evgkch/machjs`](https://www.npmjs.com/package/@evgkch/machjs)                     | Автомат и схема, которой он задаётся                            |
| [`packages/inspector`](packages/inspector) | [`@evgkch/machjs-inspector`](https://www.npmjs.com/package/@evgkch/machjs-inspector) | Шесть виджетов, две страницы, реле, палитра                     |
| [`examples`](examples)                     | приватный                                                                            | Четыре страницы на библиотеке и виджетах, к каждой разбор       |

В `packages/` лежат публикуемые пакеты и ничего кроме них. `analysis`, `formatters` и `debug` входят в пакет `@evgkch/machjs` отдельными точками входа, а не отдельными пакетами: версия у них общая.

## Документация

| Документ                                                                                     | О чём                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Руководство](packages/core/README.ru.md) · [Guide](packages/core/README.md)                 | Язык правил, схема, вердикты, граф, анализ                       |
| [Инспектор](packages/inspector/README.ru.md) · [Inspector](packages/inspector/README.md)     | Точки входа, виджеты, реле, файлы схем                           |
| [Примеры](examples/README.ru.md) · [Examples](examples/README.md)                             | Четыре страницы и общая для них оболочка                         |
| [Как работать](CONTRIBUTING.ru.md) · [Contributing](CONTRIBUTING.md)                          | Сборка, тесты, выпуск                                            |

## Лицензия

[MIT](LICENSE)
