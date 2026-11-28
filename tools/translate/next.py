#!/usr/bin/env python3
"""The next comments of a meforash still to translate, numbered phrase by phrase.
   python3 tools/translate/next.py <cid> <slug> [max Hebrew words, default 1500] [from c:v]
Run from the repo root. Shows each comment as
   @c:v:i  (DH = the first phrase is the dibbur hamatchil)
   0| first Hebrew phrase
   1| …
Write the translation in the same blocks, one English line per Hebrew phrase, to tools/translate/work/<cid>.<slug>.txt,
then run build.py."""
import json, sys, os
cid, slug = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
start = tuple(map(int, sys.argv[4].split(":"))) if len(sys.argv) > 4 else (0, 0)
done = {}
p = f"data/{cid}-cl/{slug}.json"
if os.path.exists(p): done = json.load(open(p))
pend = f"tools/translate/work/{cid}.{slug}.txt"
if os.path.exists(pend):
    for line in open(pend):
        if line.startswith("@"): done[line[1:].split()[0]] = 1
words = 0; n = 0
for line in open(f"tools/translate/units/{cid}/{slug}.jsonl"):
    r = json.loads(line)
    c, v, i = map(int, r["k"].split(":"))
    if (c, v) < start or r["k"] in done: continue
    w = sum(len(x.split()) for x in r["u"])
    if n and words + w > limit: break
    print(f"@{r['k']}" + ("  (DH)" if r["d"] else ""))
    for k, u in enumerate(r["u"]): print(f"{k}| {u}")
    words += w; n += 1
print(f"# {n} comments, {words} Hebrew words", file=sys.stderr)
