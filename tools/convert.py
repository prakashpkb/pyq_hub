#!/usr/bin/env python3
"""
Convert old single-file quiz HTML pages into clean JSON for the new PYQ site.

Usage (from repo root):
    python tools/convert.py old/*.html

What it does
  * Reads the `const qd={q:[...],m:null,tt:...,nm:...}` block from each HTML file
  * Repairs bad data:  options containing "Ex: ...", truncated "..." options,
    explanations hidden inside "Full Options" of the reference text
  * Writes  data/<slug>.json  for each test
  * Rebuilds data/tests.json (the catalogue shown on the home page)
"""
import json, re, sys, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# --------------------------------------------------------------- JS literal parser
class P:
    def __init__(s, t): s.t, s.i = t, 0
    def ws(s):
        while s.i < len(s.t) and s.t[s.i] in " \t\r\n": s.i += 1
    def val(s):
        s.ws(); c = s.t[s.i]
        if c == "{": return s.obj()
        if c == "[": return s.arr()
        if c in "\"'": return s.string()
        m = re.compile(r"-?\d+(\.\d+)?|null|true|false").match(s.t, s.i)
        if not m: raise ValueError(f"Unexpected {s.t[s.i:s.i+30]!r}")
        s.i = m.end(); w = m.group()
        return {"null": None, "true": True, "false": False}.get(w, float(w) if "." in w else int(w) if w[0] in "-0123456789" else w)
    def string(s):
        q = s.t[s.i]; s.i += 1; out = []
        esc = {"n": "\n", "t": "\t", "r": "", "\\": "\\", '"': '"', "'": "'", "/": "/"}
        while True:
            c = s.t[s.i]
            if c == "\\":
                n = s.t[s.i + 1]
                if n == "u": out.append(chr(int(s.t[s.i+2:s.i+6], 16))); s.i += 6; continue
                out.append(esc.get(n, n)); s.i += 2; continue
            if c == q: s.i += 1; return "".join(out)
            out.append(c); s.i += 1
    def arr(s):
        s.i += 1; r = []
        while True:
            s.ws()
            if s.t[s.i] == "]": s.i += 1; return r
            r.append(s.val()); s.ws()
            if s.t[s.i] == ",": s.i += 1
    def obj(s):
        s.i += 1; r = {}
        while True:
            s.ws()
            if s.t[s.i] == "}": s.i += 1; return r
            m = re.compile(r"[A-Za-z_$][\w$]*|\"[^\"]*\"").match(s.t, s.i)
            k = m.group().strip('"'); s.i = m.end(); s.ws(); s.i += 1  # skip ':'
            r[k] = s.val(); s.ws()
            if s.t[s.i] == ",": s.i += 1

# --------------------------------------------------------------- cleaning
EX = re.compile(r"\s+Ex:\s*", re.S)

def full_options(ref):
    """Pull 'Full Options: a) .. b) ..' out of ref text."""
    if "Full Options:" not in ref: return ref, [], ""
    head, tail = ref.split("Full Options:", 1)
    exp = ""
    m = EX.search(tail)
    if m: tail, exp = tail[:m.start()], tail[m.end():]
    opts = [o.strip() for o in re.split(r"\n?\s*[a-e]\)\s*", tail) if o.strip()]
    return head.strip(), opts, exp.strip()

def clean_q(q):
    ref = (q.get("ref") or "").strip()
    exp = (q.get("exp") or "").strip()
    opts = list(q.get("opts") or [])
    ref, full, ref_exp = full_options(ref)
    # option with embedded "Ex: ..." -> move to explanation
    for i, o in enumerate(opts):
        m = EX.search(o)
        if m:
            opts[i] = o[:m.start()].strip()
            if not exp and not ref_exp: exp = o[m.end():].strip().rstrip(".")
    # restore truncated options using the full list
    for i, o in enumerate(opts):
        if o.endswith("...") and full:
            pre = o[:-3].strip()
            hit = [f for f in full if f.startswith(pre)]
            if hit: opts[i] = hit[0]
    exp = exp or ref_exp
    # 'ref' that just repeats the question -> use as the full question text
    txt = q.get("txt", "").strip()
    if ref.startswith("Full Question:"):
        txt = ref[len("Full Question:"):].strip(); ref = ""
    return {"q": txt, "o": opts, "a": q.get("ci", 0), "e": exp, **({"r": ref} if ref else {})}

# --------------------------------------------------------------- categorise
def meta(fname, title):
    name = re.sub(r"\.html$", "", fname)
    name = re.sub(r"_1$", " (Part 2)", name)
    up = name.upper()
    if "PYQ" in up: cat = "UPSC Prelims PYQs"
    elif "POWER UP" in up: cat = "Vajiram Power Up 2026"
    elif "CAMP" in up: cat = "Vajiram Prelims Camp 2026"
    elif "CURRENT" in up: cat = "Vajiram Current Affairs 2026"
    else: cat = "Other"
    short = re.split(r"=+", name)[-1].strip() if "=" in name else re.sub(r"\s+", " ", name).strip()
    short = short.replace("$", "&").title() if short.isupper() else short
    if re.match(r"^[\d\s\-()]+(Part 2\))?$", short): short = "Test " + short
    slug = re.sub(r"[^a-z0-9]+", "-", f"{cat} {short}".lower()).strip("-")
    return slug, cat, short

def convert(path):
    raw = path.read_text(encoding="utf-8", errors="ignore")
    i = raw.find("const qd=")
    if i < 0: print(f"  skip (no quiz data): {path.name}"); return None
    p = P(raw); p.i = i + len("const qd=")
    qd = p.val()
    qs = [clean_q(q) for q in qd["q"]]
    m = re.search(r"<title>(.*?)</title>", raw, re.S)
    slug, cat, short = meta(path.name, html.unescape(m.group(1)) if m else path.stem)
    out = {"title": short, "category": cat, "minutes": round(qd.get("tt", 60 * len(qs)) / 60),
           "negative": qd.get("nm", 0.33), "questions": qs}
    (DATA / f"{slug}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  ok  {len(qs):4d} Q  ->  data/{slug}.json")
    return slug

def rebuild_catalogue():
    tests = []
    for f in sorted(DATA.glob("*.json")):
        if f.name == "tests.json": continue
        d = json.loads(f.read_text(encoding="utf-8"))
        tests.append({"id": f.stem, "title": d["title"], "category": d["category"],
                      "count": len(d["questions"]), "minutes": d["minutes"]})
    (DATA / "tests.json").write_text(json.dumps(tests, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\ncatalogue: {len(tests)} tests, {sum(t['count'] for t in tests)} questions -> data/tests.json")

if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    for a in sys.argv[1:]:
        for f in sorted(pathlib.Path().glob(a)) if "*" in a else [pathlib.Path(a)]:
            convert(f)
    rebuild_catalogue()
