# Prelims Practice

One page, all tests. Questions live as JSON in `data/`, the app (`index.html` + `assets/`) never changes when you add tests.

```
index.html          ← the only page
assets/style.css
assets/app.js       ← CFG.protect = true/false (copy blocking)
data/tests.json     ← catalogue (auto-generated)
data/<test>.json    ← one file per test
tools/convert.py    ← turns your old quiz .html files into JSON
.nojekyll
```

## Migrate your existing pages (one time)
1. Copy this folder into your repo root (replace old `index.html`).
2. Move all old quiz files into `old/`.
3. Run: `python tools/convert.py "old/*.html"`
4. Commit `index.html assets data tools .nojekyll` and push. (You can delete `old/` afterwards.)

The converter also fixes data issues found in the old files: options with "Ex: …" glued on, options cut off with "...", and explanations hidden inside the reference box.

## Add a new test later
Either drop the new generated .html in `old/` and re-run the converter, or write `data/my-test.json` directly:
```json
{ "title": "Test 7722", "category": "Vajiram Power Up 2026", "minutes": 60, "negative": 0.33,
  "questions": [ { "q": "Question text", "o": ["A","B","C","D"], "a": 2, "e": "Explanation" } ] }
```
then run `python tools/convert.py` (no args) to refresh `tests.json`.

## Test locally
`python -m http.server` → http://localhost:8000 (opening the file directly won't load JSON).

## Links
Each test has its own shareable link: `https://<user>.github.io/<repo>/#/test/<test-id>`
