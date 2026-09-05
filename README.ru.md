[English](README.md) · **Русский**

<p align="center">
  <a href="https://www.npmjs.com/package/@evgkch/machjs"><img alt="npm: @evgkch/machjs" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs?color=cb3837&logo=npm&label=machjs"></a>
  <a href="https://www.npmjs.com/package/@evgkch/machjs-inspector"><img alt="npm: @evgkch/machjs-inspector" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs-inspector?color=cb3837&logo=npm&label=inspector"></a>
  <a href="https://github.com/evgkch/machjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/evgkch/machjs/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Лицензия MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

# machjs

Автомат Мили для TypeScript. Поведение задаётся одной таблицей правил, контекст привязан к состоянию, а не к автомату, а граф — проекция того же объекта: его сериализуют, рисуют и анализируют. В репозитории лежат библиотека, инспектор и примеры.

<p align="center">
  <a href="packages/core/README.ru.md">Руководство</a> ·
  <a href="https://evgkch.github.io/machjs/">Примеры</a> ·
  <a href="https://evgkch.github.io/machjs/inspector/">Инспектор</a> ·
  <a href="https://github.com/evgkch/machjs/issues">Issues</a>
</p>

---

## За минуту

### Шаг 1. Четыре слова

Правило — предложение из четырёх слов: **FROM** состояние, **ON** событие, **TO** состояние, и необязательное **EMIT** событие на выходе. Турникет — два правила:

```text
FROM locked ON coin TO open   EMIT opened
FROM open   ON push TO locked
```

Те же два правила кодом. Схема — таблица: состояние, событие, список правил для этой пары.

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

Полное правило — семь слов; всё, кроме `FROM`, `ON` и `TO`, необязательно:

```text
FROM <состояние> ON <событие> [WHEN <условие>] TO <состояние> [WITH <контекст>] [EMIT <событие> [BY <данные>]]
```

Порядок исполнения: `WHEN` → `TO` → `WITH` → `EMIT` → `BY`. `BY` работает с уже обновлённым контекстом.

Те же ворота, но проход стоит две монеты. Уплаченное лежит в контексте состояния, а не в автомате:

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

Первая монета оставляет ворота закрытыми: `short` пропускает своё правило, пока внесено меньше платы. Второй монете это правило не подходит, и берётся следующее в той же ячейке — без условия, оно и открывает ворота. Безусловное правило стоит в ячейке последним: правило после него не сработает никогда, и `validate` из `analysis` находит его как `dead-rule`.

Текст правил выше — не иллюстрация. Его печатает `toRules(gate.schema)` из `formatters`, и его же читает редактор инспектора.

Дальше: `can` проверяет то же, что проверит следующий `dispatch`. Этим включают элементы управления, не проверяя фазу вручную.

```ts
button.disabled = !gate.can("push").isOk();
```

Об остальном — [руководство](packages/core/README.ru.md).

## Что здесь лежит

| Каталог                                    | Пакет                                                                                | Что внутри                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [`packages/core`](packages/core)           | [`@evgkch/machjs`](https://www.npmjs.com/package/@evgkch/machjs)                     | Автомат и схема, которой он задаётся                            |
| [`packages/inspector`](packages/inspector) | [`@evgkch/machjs-inspector`](https://www.npmjs.com/package/@evgkch/machjs-inspector) | Шесть виджетов, две страницы, реле, палитра                     |
| [`examples`](examples)                     | приватный                                                                            | Четыре страницы на библиотеке и виджетах, к каждой разбор       |

В `packages/` лежат публикуемые пакеты и ничего кроме них. `analysis`, `formatters` и `debug` — точки входа пакета `@evgkch/machjs`, а не отдельные пакеты: версия у них общая.

## Документация

| Документ                                                                                     | О чём                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Руководство](packages/core/README.ru.md) · [Guide](packages/core/README.md)                 | Язык правил, схема, вердикты, граф, анализ                       |
| [Инспектор](packages/inspector/README.ru.md) · [Inspector](packages/inspector/README.md)     | Точки входа, виджеты, реле, файлы схем                           |
| [Примеры](examples/README.ru.md) · [Examples](examples/README.md)                             | Четыре страницы и общая для них оболочка                         |
| [Как работать](CONTRIBUTING.ru.md) · [Contributing](CONTRIBUTING.md)                          | Сборка, тесты, выпуск                                            |

## Лицензия

[MIT](LICENSE)
