#!/usr/bin/env python3
"""Checks tools/translate/work/<cid>.<slug>.txt against the Hebrew phrases (one English line for each, in order) and
adds it to data/<cid>-cl/<slug>.json, then lists the sefer in data/index.json "cl" so the site uses it.
   python3 tools/translate/build.py <cid> <slug>      (run from the repo root)
A comment whose line count doesn't match is reported and left out (fix it and run again); the rest are added and the
work file is emptied of them."""
import os, json, sys, os, re
cid, slug = sys.argv[1], sys.argv[2]
units = {}
for line in open(f"tools/translate/units/{cid}/{slug}.jsonl"):
    r = json.loads(line); units[r["k"]] = r
work = f"tools/translate/work/{cid}.{slug}.txt"
blocks, cur = [], None
for line in open(work, encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("@"):
        cur = [line[1:].split()[0], []]; blocks.append(cur)
    elif cur is not None and line.strip():
        cur[1].append(re.sub(r"^\d+\|\s?", "", line).strip())
out_p = f"data/{cid}-cl/{slug}.json"
os.makedirs(os.path.dirname(out_p), exist_ok=True)
out = json.load(open(out_p)) if os.path.exists(out_p) else {}
bad, ok = [], 0
keep = []
for k, lines in blocks:
    r = units.get(k)
    if not r: bad.append(f"{k}: no such comment"); continue
    if len(lines) != len(r["u"]): bad.append(f"{k}: {len(lines)} lines for {len(r['u'])} phrases"); keep.append((k, lines)); continue
    out[k] = [r["d"], lines]; ok += 1
def order(k): return tuple(map(int, k.split(":")))
json.dump(dict(sorted(out.items(), key=lambda x: order(x[0]))), open(out_p, "w"), ensure_ascii=False, separators=(",", ":"))
if keep:
    with open(work, "w", encoding="utf-8") as f:
        for k, lines in keep:
            f.write(f"@{k}\n" + "\n".join(lines) + "\n")
else:
    os.remove(work)  # all used
idx_p = "data/index.json"; idx = json.load(open(idx_p))
cl = idx.setdefault("cl", {})
if out and slug not in cl.setdefault(cid, []): cl[cid].append(slug)
json.dump(idx, open(idx_p, "w"), ensure_ascii=False, separators=(",", ":"))
total = len(units)
print(f"{cid} {slug}: added {ok}; now {len(out)} of {total} comments translated ({100 * len(out) / total:.1f}%)")
for b in bad: print("  CHECK", b)
