"""data/manifest.json: every data file with its size and a short content hash.
The offline page uses it for sizes, and to notice when a downloaded file has changed."""
import hashlib, json, os, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the repo root
files = {}
for d, _, fs in os.walk(f"{ROOT}/data"):
    for f in sorted(fs):
        if not f.endswith(".json") or f == "manifest.json":
            continue
        p = os.path.join(d, f)
        rel = os.path.relpath(p, ROOT)
        b = open(p, "rb").read()
        files[rel] = [len(b), hashlib.sha1(b).hexdigest()[:10]]
out = {"v": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": dict(sorted(files.items()))}
json.dump(out, open(f"{ROOT}/data/manifest.json", "w"), separators=(",", ":"))
print(f"manifest: {len(files)} files, {sum(s for s, _ in files.values()) / 1e6:.1f} MB")
