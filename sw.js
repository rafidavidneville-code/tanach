/* Tanach Reader — offline support.
   The site itself (page, script, styles, icons, index): from the network when online, so updates
   arrive; from the saved copy when offline or when the network is very slow.
   Downloaded texts and commentaries (data/…): from the offline copy first.
   Fonts: kept once fetched. */
const SHELL = "tanach-shell-v1", DATA = "tanach-data", FONTS = "tanach-fonts";
const SHELL_FILES = ["./", "index.html", "app.js", "styles.css", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "data/index.json", "data/manifest.json"];
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
    if (/^data\/.+\.json$/.test(rel) && rel !== "data/index.json" && rel !== "data/manifest.json") { e.respondWith(fromData(req)); return; }
    if (req.mode === "navigate" || SHELL_FILES.includes(rel)) e.respondWith(fromShell(req, rel));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") e.respondWith(fromFonts(req));
});

async function fromData(req) {
  const hit = await caches.match(req.url, { ignoreSearch: true, cacheName: DATA });
  return hit || fetch(req);
}

async function fromShell(req, rel) {
  const cache = await caches.open(SHELL);
  const key = req.mode === "navigate" || rel === "" || rel === "index.html" ? new URL("./", self.location).href : req.url;
  const cached = await cache.match(key, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  if (!cached) return net;
  // online: the fresh copy; offline or a very slow network: the saved one
  const slow = new Promise((r) => setTimeout(() => r(cached), 3500));
  return Promise.race([net.catch(() => cached), slow]);
}

async function fromFonts(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") cache.put(req.url, res.clone());
  return res;
}
