**English** · [Русский](README.ru.md)

# machjs tokens

The shared design vocabulary of the machjs tools: palette, type, spacing steps, radii, state lanes
— and the controls built out of them. One file, `tokens.css`.

The inspector's own pages and widgets import it from here, by a relative path. The package
publishes a copy of it, so a page with widgets of its own takes the palette by name:

```css
@import "@evgkch/machjs-inspector/tokens.css";
```

The widgets require it: the palette crosses into a shadow root as inherited custom properties,
and without the tokens a widget is left without colours.

## The two layers

`tokens.css` declares its own order, `@layer tokens, controls;`, at the head of the file. A page
that adds a layer of its own writes `@layer tokens, page;` and gets `tokens, controls, page`.

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

36px is the module and a half (`--cell` is 24px).
