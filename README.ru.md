[English](README.md) · **Русский**

# machjs — примеры

Примеры к [`@evgkch/machjs`](https://github.com/evgkch/machjs), небольшому типизированному автомату Мили. Каждый пример — работающая страница на опубликованном пакете: чистый HTML и TypeScript, без фреймворков. К каждому приложен разбор того же кода, строка за строкой.

**Сайт: [evgkch.github.io/machjs](https://evgkch.github.io/machjs/)**

| Пример                                   | Демонстрация                                               | Разбор                                                                            |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`selection-rect`](selection-rect)       | [открыть](https://evgkch.github.io/machjs/selection-rect/)  | [English](selection-rect/README.md) · [Русский](selection-rect/README.ru.md)       |
| [`review`](review)                       | [открыть](https://evgkch.github.io/machjs/review/)          | [English](review/README.md) · [Русский](review/README.ru.md)                       |
| [`form`](form)                           | [открыть](https://evgkch.github.io/machjs/form/)            | [English](form/README.md) · [Русский](form/README.ru.md)                           |

## Запуск

Все примеры собраны в один проект Vite: индексная страница лежит в корне, каждый пример — по своему пути.

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + сборка в dist/
npm run preview   # посмотреть собранное
```

Примеры зависят от пакета из npm, поэтому предварительно собирать библиотеку не нужно. Чтобы проверить их на неопубликованных изменениях, соберите библиотеку и подключите её через `npm link` — сначала из каталога библиотеки, затем отсюда:

```sh
npm run build && npm link      # в machjs
npm link @evgkch/machjs         # здесь
```

## Как добавить пример

1. Каталог с `index.html` и `src/` рядом с `selection-rect`. Пути к файлам в разметке относительные — `./src/main.ts`, а не `/src/main.ts`.
2. Запись в `build.rollupOptions.input` в [`vite.config.ts`](vite.config.ts): сам Vite страницы не ищет.
3. Карточка в [`index.html`](index.html) — скопировать существующий `<li class="card">` и поправить текст и ссылки.

## Связь с репозиторием библиотеки

[`evgkch/machjs`](https://github.com/evgkch/machjs) подключает этот репозиторий сабмодулем в `examples/` и публикует сайт из него: пуш сюда ничего не меняет на сайте, пока в `machjs` указатель сабмодуля не переведён на новый коммит.

MIT.
