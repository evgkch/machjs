**English** · [Русский](README.ru.md)

# machjs tokens

The shared design vocabulary of the machjs tools: palette, type, spacing steps, radii, state lanes
— and the controls built out of them. One file, `tokens.css`.

The inspector's own pages and widgets import it from here, by a relative path. The package
publishes a copy of it, so a page that draws the widgets itself gets the palette by name:

```css
@import "@evgkch/machjs-inspector/tokens.css";
```

The widgets require it. The palette reaches a shadow root through inherited custom properties;
without the tokens a widget is left without colours.

## The two layers

`tokens.css` declares its own order, `@layer tokens, controls;`, at the head of the file. A page
that adds a layer of its own writes `@layer tokens, page;` and gets `tokens, controls, page` — the
import is processed first, so both layers below are already ordered when the page names its own.

| Layer      | What is in it                                                              |
| ---------- | -------------------------------------------------------------------------- |
| `tokens`   | The custom properties, `* { box-sizing }`, `.tag`/`.label`, the corner shape |
| `controls` | `button`, `input`, `select`, `textarea`, `kbd`: one height, one focus ring   |

Every selector in `controls` is wrapped in `:where()`, so it carries no specificity: a page
overrides any of it with a plain `button { … }` of its own.

## The control sizes

| Property       | Value  | Where it is used                                    |
| -------------- | ------ | ---------------------------------------------------- |
| `--control`    | 36px   | Every pressable and typable box                     |
| `--control-sm` | 30px   | A dense strip inside another control — `.dense`      |
| `--ui`         | 14px   | The text inside a control                           |
| `--ui-sm`      | 13px   | The smaller text beside it                          |

36px is the module and a half (`--cell` is 24px): a control is taller than a row of the figure
because a finger lands on it and a row does not.
