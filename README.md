# Step highlights for Pi

This project extension displays matching progress lines in ordered deep-gold
blocks with black text. Other assistant Markdown stays in sequence around them.
The original assistant message remains unchanged and is the only content sent to
the model.

![Pi showing blue prompts and ordered gold Step highlights.](assets/step-highlight-demo.png)

## Configure

Edit `.pi/step-highlight.json`:

```json
{
  "phrases": ["Step", "Phase"]
}
```

Each phrase is a line label. Up to three leading spaces are allowed. A
highlight requires a standalone line in the form
`<phrase> <integer>/<integer>: <non-empty summary>`. For example,
`Phase 2/4: Implement the renderer` matches. An empty array disables
highlights. Missing or malformed configuration falls back to `Step`; blank and
non-string labels are ignored. The file is read when the extension loads; run
`/reload` after changing it.

Lines inside fenced code, blockquotes, list items, or indented blocks are not
matched.

## Load and test

From the project root, load the extension directly:

```bash
pi --no-extensions --extension ./.pi/extensions/step-highlight/index.ts
```

The extension also loads automatically from `.pi/extensions/` after project
trust is granted. Run the behavior tests with:

```bash
node --test test/step-highlight.test.mjs
```
