/* Tanach Reader — offline support and quick returns.
   The site itself (page, script, styles, icons, index): the saved copy at once, refreshed from the network
   in the background (an update is used from the next visit), so coming back to the site never waits on the
   network.
   Downloaded texts and commentaries (data/…): from the offline copy first.
   Other data the reader has opened lately: kept too (the last 60 files), served at once and refreshed in the
   background.
   Fonts: kept once fetched. */
const SHELL = "tanach-shell-v3", DATA = "tanach-data", RECENT = "tanach-recent", FONTS = "tanach-fonts";
const SHELL_FILES = ["./", "index.html", "app.js", "styles.css", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "data/index.json", "data/manifest.json", "data/lex.json", "data/shabbat-il.json"];
const BASE = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL)
    .then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("tanach-shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(BASE)) return;
    if (url.searchParams.has("dl")) return;                 // a download in progress: straight to the network
    const rel = url.pathname.slice(BASE.length);
    if (/^data\/.+\.json$/.test(rel) && !SHELL_FILES.includes(rel)) { e.respondWith(fromData(req)); return; }
    if (req.mode === "navigate" || SHELL_FILES.includes(rel)) e.respondWith(fromShell(req, rel));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") e.respondWith(fromFonts(req));
});

async function fromData(req) {
  const hit = await caches.match(req.url, { ignoreSearch: true, cacheName: DATA });
  if (hit) return hit;
  const recent = await caches.open(RECENT);
  const key = req.url.split("?")[0];
  const old = await recent.match(key);
  const net = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic") { await recent.put(key, res.clone()); trimRecent(recent); }
    return res;
  });
  if (old) { net.catch(() => {}); return old; }
  return net;
}
async function trimRecent(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - 60; i++) await cache.delete(keys[i]);   // oldest first
}

async function fromShell(req, rel) {
  const cache = await caches.open(SHELL);
  const key = req.mode === "navigate" || rel === "" || rel === "index.html" ? new URL("./", self.location).href : req.url;
  const cached = await cache.match(key, { ignoreSearch: true });
  const net = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  if (!cached) return net;
  net.catch(() => {});
  return cached;                                  // at once; the fresh copy is kept for next time
}

async function fromFonts(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") cache.put(req.url, res.clone());
  return res;
}
