[English](README.md) · **Русский**

# machjs — примеры

Примеры к [`@evgkch/machjs`](https://github.com/evgkch/machjs), небольшому типизированному автомату Мили. Каждый пример работает как страница на библиотеке и виджетах инспектора: чистый HTML и TypeScript, без фреймворков. К каждому приложен разбор того же кода, строка за строкой.

**Сайт: [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)**

| Пример                                   | Демонстрация                                               | Разбор                                                                            |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`selection-rect`](selection-rect)       | [открыть](https://evgkch.github.io/machjs/selection-rect/)  | [English](selection-rect/README.md) · [Русский](selection-rect/README.ru.md)       |
| [`review`](review)                       | [открыть](https://evgkch.github.io/machjs/review/)          | [English](review/README.md) · [Русский](review/README.ru.md)                       |
| [`wire`](wire)                           | [открыть](https://evgkch.github.io/machjs/wire/)            | [English](wire/README.md) · [Русский](wire/README.ru.md)                           |
| [`token`](token)                         | [открыть](https://evgkch.github.io/machjs/token/)           | [English](token/README.md) · [Русский](token/README.ru.md)                         |

## Запуск

Примеры лежат в workspace репозитория [`evgkch/machjs`](https://github.com/evgkch/machjs) и собраны в один проект Vite: индексная страница лежит в корне, каждый пример стоит по своему пути. Из корня репозитория:

```sh
npm ci
npm run dev:examples   # собирает библиотеку и виджеты, затем http://localhost:5173
```

Из этого каталога, когда библиотека и пакет инспектора уже собраны:

```sh
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + сборка в dist/
npm run preview   # посмотреть собранное
npm test          # каждая страница в DOM: машина прогоняется, виджеты сверяются
```

Библиотека и виджеты берутся из workspace, а не из npm: после правки в `packages/core` или `packages/inspector` этот пакет пересобирают.

## Оболочка

Три файла в корне общие для всех страниц примеров:

| Файл                       | Что в нём                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| [`page.css`](page.css)     | Сплошной текст и два свойства, которых нет в токенах                              |
| [`shell.css`](shell.css)   | Полноэкранный каркас (строка, сцена, док, палуба) и раскраска инструмента         |
| [`shell.ts`](shell.ts)     | `dockEdge` — переключатель, который переносит панели с края вниз и обратно        |

В примере пишут `@import "../../shell.css";`, затем `@layer subject { … }` и оформляют то, что стоит на сцене.

**Инструмент раскрашен в Gruvbox.** Область, помеченная `class="tool"`, в обеих системных темах показана в палитре Gruvbox, а страница остаётся в палитре токенов. Так помечены док, переключатели в верхней строке и легенда под машиной.

Схему из примера `review` правят в `machjs-editor` и рисуют в `machjs-diagram`, но она остаётся документом, а не инструментом. Поэтому схема стоит вне помеченной области и сохраняет цвета страницы, а конвейер, который её рецензирует, стоит в доке и раскрашен как инструмент.

Вся раскраска задана блоком custom properties и ничем больше: виджеты читают палитру как custom properties, а custom properties наследуются в теневое дерево.

## Как добавить пример

1. Каталог с `index.html` и `src/` рядом с `selection-rect`. Пути к файлам в разметке относительные: `./src/main.ts`, а не `/src/main.ts`.
2. Запись в `build.rollupOptions.input` в [`vite.config.ts`](vite.config.ts): сам Vite страницы не ищет.
3. Карточка в [`index.html`](index.html): копия существующего `<li class="card">` с исправленным текстом и ссылками.

## Сайт

[evgkch.github.io/machjs](https://evgkch.github.io/machjs/) собирается из этого каталога workflow-файлом `.github/workflows/pages.yml` при каждом пуше в `master`. Страницы инспектора лежат по пути `/inspector/`.

MIT.
