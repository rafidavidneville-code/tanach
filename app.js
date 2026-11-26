/* Tanach Reader — vanilla JS single-page app.
   Data: data/index.json
         data/text/<slug>.json          {he:[[...]], en:[[...]]}
         data/<commentary>/<slug>.json   [chapter][verse][comment]   (Hebrew)
         data/<commentary>-en/<slug>.json  same shape, English, aligned 1:1
   Routes (hash): ""                     → home
                  #<slug>-<ch>[-<v>]     → perek
                  #parsha-<id>[-<ch>-<v>] → parsha */
(() => {
  "use strict";
  /* the page puts you back in your place itself (on the same pasuk); the browser restoring an old scroll position on
     a reload or a return — at a moment of its own choosing, into a page that is laid out differently — would move it */
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  /* ───────── Commentaries registry (add more here later) ───────── */
  const COMMENTARIES = [
    { id: "rashi", he: "רש״י", en: "Rashi", dir: "data/rashi/", enDir: "data/rashi-en/" },
    { id: "ibnezra", he: "אבן עזרא", heIntro: "הקדמת אבן עזרא", en: "Ibn Ezra", dir: "data/ibnezra/", enDir: "data/ibnezra-en/", introDir: "data/ibnezra-intro/", note: "Torah and much of Nach" },
    { id: "ramban", he: "רמב״ן", en: "Ramban", dir: "data/ramban/", enDir: "data/ramban-en/", introDir: "data/ramban-intro/", enSrc: "Chavel" },
    { id: "bachya", he: "רבנו בחיי", heIntro: "הקדמת רבנו בחיי", en: "Rabbeinu Bachya", dir: "data/bachya/", enDir: "data/bachya-en/", introDir: "data/bachya-intro/", enSrc: "Munk", note: "Torah" },
    { id: "sforno", he: "ספורנו", heIntro: "הקדמת הספורנו", en: "Sforno", dir: "data/sforno/", enDir: "data/sforno-en/", introDir: "data/sforno-intro/", enSrc: "Munk", note: "Torah and Shir Hashirim" },
    { id: "kliyakar", he: "כלי יקר", heIntro: "הקדמת כלי יקר", en: "Kli Yakar", dir: "data/kliyakar/", enDir: "data/kliyakar-en/", introDir: "data/kliyakar-intro/", note: "Torah" },
    { id: "orhachaim", he: "אור החיים", heIntro: "הקדמת אור החיים", en: "Or HaChaim", dir: "data/orhachaim/", enDir: "data/orhachaim-en/", introDir: "data/orhachaim-intro/", enSrc: "Munk", note: "Torah" },
    { id: "beishalevi", he: "בית הלוי", heIntro: "הקדמת בית הלוי", en: "Beit HaLevi", dir: "data/beishalevi/", enDir: "data/beishalevi-en/", introDir: "data/beishalevi-intro/", note: "Bereshit and Shemot" },
  ];
  const introName = (c) => c.heIntro || `הקדמת ה${c.he}`;
  /* Pages layout: each commentary can be switched on or off */
  const pgOn = (c) => settings["pg_" + c.id] !== false;
  /* …and put in the reader's order (Settings › Pages mode); a commentary added later goes at the end */
  const pgOrdered = () => {
    const ord = Array.isArray(settings.pg_order) ? settings.pg_order : [];
    const rank = (c) => { const i = ord.indexOf(c.id); return i < 0 ? 100 + COMMENTARIES.indexOf(c) : i; };
    return [...COMMENTARIES].sort((a, b) => rank(a) - rank(b));
  };
  const pgComms = (slug) => pgOrdered().filter((c) => avail(c, slug) && pgOn(c));
  const commMeta = (id) => COMMENTARIES.find((c) => c.id === id);
  /* which commentaries exist for a sefer, and which ones the current layout shows */
  const avail = (c, slug) => (INDEX && INDEX.comm && INDEX.comm[c.id] ? INDEX.comm[c.id].includes(slug) : c.id === "rashi");
  const activeComms = (slug) => settings.view === "pages"
    ? pgComms(slug)
    : COMMENTARIES.filter((c) => c.id === ((readerState && readerState.tab) || "rashi") && avail(c, slug));

  /* ───────── Storage (safe) ───────── */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tanach:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("tanach:" + k, JSON.stringify(v)); } catch {} },
  };

  const DEFAULTS = {
    mode: "side", nikkud: true, taamim: true, theme: "paper",
    rashiScript: true, rashiEn: true, rashiOpen: false, rashiLines: false, notes: true, copyFmt: "both",
    maftir: true, weekday: false, haftarah: true, haftCustom: "a", petuchot: true, sedarim: true, view: "scroll",
    pg_rashi: true, pg_ibnezra: true, pg_ramban: true, pg_bachya: true, pg_sforno: true, pg_kliyakar: true, pg_orhachaim: true, pg_beishalevi: true,
    pg_order: ["rashi", "ibnezra", "ramban", "bachya", "sforno", "kliyakar", "orhachaim", "beishalevi"],
  };
  const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
  if (settings.inlineRashi) settings.rashiOpen = true;
  delete settings.inlineRashi; delete settings.panel; delete settings.scale;   // text size is now fixed to the standard
  let bookmarks = store.get("bookmarks", []);
  let favourites = store.get("favourites", []);
  let copyMode = false;

  /* ───────── Helpers ───────── */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function gematria(n) {
    if (n === 15) return "ט״ו"; if (n === 16) return "ט״ז";
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    const hund = ["", "ק", "ר", "ש", "ת"];
    let s = "", x = n;
    while (x >= 400) { s += "ת"; x -= 400; }
    if (x >= 100) { s += hund[Math.floor(x / 100)]; x %= 100; }
    if (x === 15) s += "טו"; else if (x === 16) s += "טז";
    else { s += tens[Math.floor(x / 10)] + ones[x % 10]; }
    return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
  }
  const plainGem = (n) => gematria(n).replace(/[׳״]/g, "");
  function parseGematria(str) {
    const v = { א:1,ב:2,ג:3,ד:4,ה:5,ו:6,ז:7,ח:8,ט:9,י:10,כ:20,ך:20,ל:30,מ:40,ם:40,נ:50,ן:50,ס:60,ע:70,פ:80,ף:80,צ:90,ץ:90,ק:100,ר:200,ש:300,ת:400 };
    let t = 0; for (const c of str.replace(/[׳״'"]/g, "")) { if (!v[c]) return NaN; t += v[c]; } return t;
  }

  const RE_TAAMIM = /[֑-ֽ֯]/g;
  const RE_NIKKUD = /[ְ-ׇּֿׁׂׅׄ]/g;
  function heText(html) {
    if (!html) return "";
    if (!settings.taamim || !settings.nikkud) html = html.replace(RE_TAAMIM, "");
    if (!settings.nikkud) html = html.replace(RE_NIKKUD, "");
    return html;
  }
  const heComm = (html) => (settings.nikkud ? html : html.replace(RE_TAAMIM, "").replace(RE_NIKKUD, ""));

  /* Turn stored HTML into clean copyable text (drops footnotes, markers; keeps kri/ktiv brackets) */
  function cleanFrag(frag) {
    frag.querySelectorAll("sup, i.footnote, .footnote, .mam-kq-trivial, .mam-spi-pe, .mam-spi-samekh, button, .rashi-dot, .no-copy").forEach((n) => n.remove());
    // ketiv (…) and qeri […] already carry their own brackets in the text
    frag.querySelectorAll("br").forEach((n) => n.replaceWith(" "));
    return frag;
  }
  const norm = (s) => s.replace(/[    ]/g, " ").replace(/\s+/g, " ").trim();
  function htmlToText(html) { const t = document.createElement("template"); t.innerHTML = html || ""; return norm(cleanFrag(t.content).textContent); }

  let toastTimer;
  function toast(msg, act) {
    const t = $("#toast");
    t.textContent = msg; t.classList.toggle("has-act", !!act);
    if (act) { const b = document.createElement("button"); b.type = "button"; b.className = "toast-act"; b.textContent = act.label; b.addEventListener("click", act.run); t.append(b); }
    t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), act ? 12000 : 2000);
  }

  /* ───────── Data ───────── */
  let INDEX = null, ORDER = [];
  const canon = (slug) => (book(slug).section === "chitzonim" ? "chitzonim" : "tanach");
  const nbBook = (slug, d) => { const s = ORDER[ORDER.indexOf(slug) + d]; return s && canon(s) === canon(slug) ? s : null; };
  const cache = new Map();      // url → promise
  const resolved = new Map();   // url → data (sync access for copy)
  const MISSING = new Set();    // urls that don't exist (404)
  /* memory: the data of the sefarim used last is kept, older ones are let go (a lighter page is less likely
     to be closed by the iPad while it is in the background) */
  const recentSlugs = [];
  const slugOf = (url) => { const m = /^data\/[^/]+\/([a-z0-9-]+)\.json$/.exec(url); return m && !/^data\/(index|manifest|lex|shabbat-il)\.json$/.test(url) ? m[1] : null; };
  function touchSlug(slug) {
    const i = recentSlugs.indexOf(slug); if (i >= 0) recentSlugs.splice(i, 1);
    recentSlugs.unshift(slug);
    if (recentSlugs.length <= 5) return;
    const keep = new Set(recentSlugs.slice(0, 5));
    if (readerState) keep.add(readerState.slug);
    if (PG) keep.add(PG.slug);
    for (const u of [...cache.keys()]) { const s2 = slugOf(u); if (s2 && !keep.has(s2)) { cache.delete(u); resolved.delete(u); } }
    for (let k = recentSlugs.length - 1; k >= 0; k--) if (!keep.has(recentSlugs[k])) recentSlugs.splice(k, 1);
  }
  function fetchJSON(url) {
    const sl = slugOf(url); if (sl) touchSlug(sl);
    if (!cache.has(url)) cache.set(url, fetch(url)
      .then((r) => { if (!r.ok) { if (r.status === 404) MISSING.add(url); throw new Error(r.status + " " + url); } return r.json(); })
      .then((d) => { resolved.set(url, d); return d; })
      .catch((e) => { cache.delete(url); throw e; }));
    return cache.get(url);
  }
  const textUrl = (slug) => `data/text/${slug}.json`;
  const commUrl = (cid, slug) => commMeta(cid).dir + slug + ".json";
  const commEnUrl = (cid, slug) => commMeta(cid).enDir + slug + ".json";
  const loadText = (slug) => fetchJSON(textUrl(slug));
  const loadComm = (cid, slug) => fetchJSON(commUrl(cid, slug));
  /* each phrase of a commentary matched to its English ahead of time (scripts/align — word links learned from all the
     translations, checked against comments aligned by hand); loaded with the English */
  const alignUrl = (cid, slug) => `data/align/${cid}/${slug}.json`;
  const hasAlign = (cid, slug) => !!(INDEX.align && (INDEX.align[cid] || []).includes(slug));
  const loadCommEn = (cid, slug) => Promise.all([fetchJSON(commEnUrl(cid, slug)), hasAlign(cid, slug) ? fetchJSON(alignUrl(cid, slug)).catch(() => null) : null]).then(([en]) => en);
  const alignOf = (cid, s, c, v, i) => { const d = cid && resolved.get(alignUrl(cid, s)); return (d && d[`${c}:${v}:${i}`]) || null; };
  const at = (data, c, v) => (data && data[c - 1] && data[c - 1][v - 1]) || [];

  const book = (slug) => INDEX.books[slug];
  const refEn = (slug, c, v) => `${book(slug).en} ${c}${v ? ":" + v : ""}`;
  const refHe = (slug, c, v) => `${book(slug).he} ${gematria(c)}${v ? ", " + gematria(v) : ""}`;
  const refHeShort = (slug, c, v) => `${book(slug).he} ${plainGem(c)}${v ? ":" + plainGem(v) : ""}`;

  /* parsha starts keyed "slug:c:v"; aliyot come from p.al (Shabbat 7, maftir, weekday 3) */
  const MARKS = new Map();
  const ALIYAH_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי"];
  const ALIYAH_EN = ["Rishon", "Sheni", "Shlishi", "Revi'i", "Chamishi", "Shishi", "Shevi'i"];
  const WEEKDAY_HE = ["כהן", "לוי", "ישראל"];
  const WEEKDAY_EN = ["Kohen", "Levi", "Yisrael"];
  function buildMarks() {
    INDEX.parshiot.forEach((p, i) => {
      p.index = i;
      const [c, v] = p.al ? p.al.s[0] : [p.range[1], p.range[2]];
      MARKS.set(`${p.range[0]}:${c}:${v}`, { parsha: p, p });
    });
  }
  const cmpPos = (a, b) => (a.c - b.c) || (a.v - b.v);
  function aliyahStops(p) {
    const slug = p.range[0];
    if (!p.al) return [];
    if (settings.weekday) return p.al.w.map(([c, v], i) => ({ p, slug, c, v, kind: "w", n: i, he: WEEKDAY_HE[i], en: WEEKDAY_EN[i] }));
    const out = p.al.s.map(([c, v], i) => ({ p, slug, c, v, kind: "s", n: i, he: ALIYAH_HE[i], en: ALIYAH_EN[i] }));
    if (settings.maftir && p.al.m) out.push({ p, slug, c: p.al.m[0], v: p.al.m[1], kind: "m", n: 7, he: "מפטיר", en: "Maftir" });
    return out;
  }
  const inParsha = (p, pos) => { const [s, c1, v1, c2, v2] = p.range; return s === pos.s && cmpPos(pos, { c: c1, v: v1 }) >= 0 && cmpPos(pos, { c: c2, v: v2 }) <= 0; };
  function relevantParshiot() {
    if (!readerState) return [];
    const r = readerState.r;
    if (r.view === "parsha") return [r.p];
    return INDEX.parshiot.filter((p) => p.range[0] === r.slug);
  }
  function menuParshiot() {
    if (!readerState) return [];
    if (PG) { const it = PG.items[PG.idx]; if (it && it.type === "haft") return INDEX.parshiot.filter((p) => p.id === it.pid); }
    if (readerState.r.view === "parsha") return [readerState.r.p];
    const pos = readerState.lastPos;
    const all = relevantParshiot();
    const p = pos && all.find((x) => inParsha(x, pos) || (pos.haft && x.range[3] <= pos.c));
    if (!p) return all.slice(0, 1);
    return [p];
  }

  /* ───────── Settings application ───────── */
  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === "paper") delete root.dataset.theme; else root.dataset.theme = settings.theme;
    ["--he-size", "--en-size", "--rashi-size"].forEach((k) => root.style.removeProperty(k));   // sizes come from the stylesheet
    document.body.classList.toggle("rashi-plain", !settings.rashiScript);
    document.body.classList.toggle("hide-notes", !settings.notes);
    document.body.classList.toggle("rashi-lines", !!settings.rashiLines);
    document.body.classList.toggle("ps-breaks", !!settings.petuchot);
    document.body.classList.toggle("rashi-all", !!settings.rashiOpen);
    const lb = document.getElementById("layoutBtn");
    if (lb) { const p = settings.view === "pages"; lb.classList.toggle("is-pages", p); lb.title = p ? "Switch to Scroll" : "Switch to Pages (one pasuk per page)"; lb.setAttribute("aria-label", lb.title); }
    ["side", "stack", "he", "en"].forEach((m) => document.body.classList.toggle("mode-" + m, settings.mode === m));
  }
  function saveSettings() { store.set("settings", settings); applySettings(); }
  /* the page's viewing region starts below the top bar and the copy bar (scroll-padding on the page), kept to their
     height as it changes */
  function syncScrollPad() {
    const tb = $(".topbar"), cb = $("#copybar"); if (!tb) return;
    const h = Math.round(tb.getBoundingClientRect().bottom + (cb && !cb.hidden ? cb.offsetHeight : 0));
    const v = h + "px"; if (document.documentElement.style.scrollPaddingTop !== v) document.documentElement.style.scrollPaddingTop = v;
  }
  if (window.ResizeObserver) { const o = new ResizeObserver(syncScrollPad); const watchBars = () => { const tb = $(".topbar"), cb = $("#copybar"); if (tb) o.observe(tb); if (cb) o.observe(cb); syncScrollPad(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchBars); else watchBars(); }

  /* ───────── Routing ───────── */
  function parseRoute(hash) {
    const s = decodeURIComponent((hash || "").replace(/^#/, "")).toLowerCase();
    if (!s || s === "home") return { view: "home" };
    if (s === "offline") return { view: "offline" };
    let m = s.match(/^parsha-([a-z-]+?)(?:-(\d+)-(\d+)|-(haftarah))?$/);
    if (m) {
      const p = INDEX.parshiot.find((x) => x.id === m[1]);
      return p ? { view: "parsha", p, c: m[2] ? +m[2] : null, v: m[3] ? +m[3] : null, haft: !!m[4] } : { view: "notfound" };
    }
    m = s.match(/^(.+?)-(\d+)(?:-(\d+))?$/);
    if (m && INDEX.books[m[1]]) {
      const b = book(m[1]); const c = +m[2]; const v = m[3] ? +m[3] : null;
      if (c >= 1 && c <= b.verses.length) return { view: "chapter", slug: m[1], c, v: v && v <= b.verses[c - 1] ? v : null };
    }
    if (INDEX.books[s]) return { view: "chapter", slug: s, c: 1, v: null };
    return { view: "notfound" };
  }
  const chapterHash = (slug, c, v) => `#${slug}-${c}${v ? "-" + v : ""}`;

  let current = null;
  let routeTok = 0, routedOnce = false;
  async function route() {
    if (!INDEX) return;                     // index still loading: boot() routes when it's ready
    const tok = ++routeTok;
    if (veilUp && !layoutSwitch) veilTo(false, 120);   // a change of view cut short by this one
    const r = parseRoute(location.hash);
    closeAllDialogs();
    if (settings.view === "pages" && r.view === "parsha") {
      const p = r.p;
      if (r.haft && settings.haftarah) {
        if (PG && PG.slug === p.range[0] && $(".pager")) { closeAllDialogs(); const i = PG.items.findIndex((it) => it.type === "haft" && it.pid === p.id); if (i >= 0) { pagerShow(i, 0); return; } }
        current = { view: "chapter", slug: p.range[0], c: p.range[3], v: null, pgHaft: p.id };
        closeAllDialogs(); renderReader(current); return;
      }
      if (PG && PG.slug === p.range[0] && $(".pager")) {
        const i = PG.items.findIndex((it) => it.type === "intro" && it.parsha === p.id);
        if (i >= 0) { pagerShow(i, 0); return; }
        pagerGoTo(p.range[1], p.range[2]); return;
      }
      current = { view: "chapter", slug: p.range[0], c: p.range[1], v: p.range[2], pgParsha: p.id };
      suppressOpen = true; renderReader(current); return;
    }
    if (r.view === "chapter" && PG && readerState && readerState.slug === r.slug && $(".pager")) {
      current = Object.assign(current || {}, { c: r.c, v: r.v });
      pagerGoTo(r.c, r.v); return;
    }
    if (r.view === "chapter" && readerState && readerState.r.view === "chapter" && readerState.slug === r.slug && $("#seferBody")) {
      current = Object.assign(current || {}, { c: r.c, v: r.v });
      jumpWithinSefer(r.c, r.v);
      return;
    }
    const veil = routedOnce && !quietShow && !layoutSwitch;
    routedOnce = true;
    if (veil) { await veilTo(true, 90); if (tok !== routeTok) return; }
    current = r;
    readerState = null;
    $("#aliyahBtn").hidden = true; $("#topParsha").hidden = true; document.body.classList.remove("has-parsha");
    let work;
    if (r.view === "home") renderHome();
    else if (r.view === "offline") renderOffline();
    else if (r.view === "chapter" || r.view === "parsha") work = renderReader(r);
    else renderNotFound();
    if (veil) {
      if (work) await Promise.all([Promise.race([work, sleep(900)]), fontsReady(settings.view === "pages" ? "pages" : "scroll", 900)]);
      await frames(2); if (tok === routeTok) await veilTo(false, 170);
    }
    else if (work) await work;
  }

  /* ───────── Home ───────── */
  function renderHome() {
    leavePages();
    document.title = "Tanach Reader — Home";
    setPicker(null);
    const last = store.get("last", null);
    const app = $("#app");
    const parshaByBook = {};
    INDEX.parshiot.forEach((p) => (parshaByBook[p.range[0]] ||= []).push(p));
    const head = (en, he) => `<div class="section-head"><h2>${esc(en)}</h2><span class="he">${esc(he)}</span></div>`;

    app.innerHTML = `
      <div class="home">
        <section class="hero">
          <h1>תנ״ך</h1>
          <p class="sub">Torah<span class="dot">·</span>Nevi'im<span class="dot">·</span>Ketuvim</p>
          <p class="intro">The whole Tanach — Hebrew with vowels and cantillation, next to the English and Rashi. Start anywhere below.</p>
          <a class="hero-link" href="#offline"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> Download for offline reading · <span class="he">הורדה</span></a>
        </section>

        <section class="section" id="weekSec">${head("This week · Israel", "פרשת השבוע")}<div id="weekSlot" class="week-slot"></div></section>

        ${last && last.s ? `<section class="section">${head("Continue reading", "המשך קריאה")}<div id="continueSlot" class="pcards one"></div></section>` : ""}

        <section class="section">
          ${head("Favourites", "מועדפים")}
          <div id="favList"></div>
        </section>

        <section class="section">
          ${head("Bookmarks", "סימניות")}
          <div id="bmList"></div>
        </section>

        <section class="section">
          ${head("Torah", "תורה")}
          <div class="pgrid">
            ${Object.entries(parshaByBook).map(([slug, ps]) => `
              <div class="pcol">
                <button type="button" class="col-head as-btn" data-book="${slug}" title="Open ${esc(book(slug).en)}"><span class="en">${esc(book(slug).en)}</span><span class="he">${esc(book(slug).he)}</span></button>
                ${ps.map((p) => `<a class="lrow" href="#parsha-${p.id}"><span class="en">${esc(p.en)}</span><span class="he">${esc(p.he)}</span></a>`).join("")}
              </div>`).join("")}
          </div>
        </section>

        <div class="sgrid">
          ${INDEX.sections.filter((sec) => sec.id !== "torah").map((sec) => `
            <section class="section scol">
              ${head(sec.en, sec.he)}
              ${sec.groups.map((g) => `
                ${g.en ? `<div class="group-label"><span class="en">${esc(g.en)}</span><span class="he">${esc(g.he)}</span></div>` : `<div class="group-gap"></div>`}
                <div class="brows">
                  ${g.books.map((s) => `<button class="lrow" type="button" data-book="${s}"><span class="en">${esc(book(s).en)}</span><span class="he">${esc(book(s).he)}</span></button>`).join("")}
                </div>`).join("")}
            </section>`).join("")}
        </div>
      </div>`;
    renderWeek();
    renderContinue(last);
    renderSaved();
    $$("[data-book]", app).forEach((b) => b.addEventListener("click", () => openPicker(b.dataset.book)));
    window.scrollTo(0, 0);
  }

  /* this week's parsha, by the Israeli calendar (data/shabbat-il.json, built with Hebcal) */
  async function renderWeek() {
    const slot = $("#weekSlot"); if (!slot) return;
    let cal; try { cal = await fetchJSON("data/shabbat-il.json"); } catch { const s = $("#weekSec"); if (s) s.remove(); return; }
    if (!slot.isConnected) return;
    const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const i = cal.findIndex((x) => x[0] >= today); if (i < 0) { $("#weekSec").remove(); return; }
    const [date, hdate, ids, holEn, holHe] = cal[i];
    const civil = new Date(date + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const hd = hdate.replace(RE_NIKKUD, "");
    const when = `<div class="wk-when"><span>${esc(civil)}${date === today ? " · today" : ""}</span><span class="he">שבת ${esc(hd)}</span></div>`;
    const pshow = (ps) => {
      const first = ps[0], last = ps[ps.length - 1], b = book(first.range[0]);
      const rg = `${b.en} ${first.range[1]}:${first.range[2]}–${last.range[3]}:${last.range[4]}`;
      return `<a class="wk-card" href="#parsha-${first.id}">
          <div class="wk-name"><span class="he">פרשת ${ps.map((p) => esc(p.he)).join("־")}</span><span class="en">Parashat ${ps.map((p) => esc(p.en)).join("–")}</span></div>
          ${when}<div class="wk-range">${esc(rg)}</div></a>
        <div class="wk-links">${ps.length > 1 ? ps.map((p) => `<a class="chip" href="#parsha-${p.id}"><span class="he">${esc(p.he)}</span></a>`).join("") : ""}
          ${settings.haftarah ? `<a class="chip" href="#parsha-${last.id}-haftarah">Haftarah · <span class="he">הפטרה</span></a>` : ""}</div>`;
    };
    if (ids) slot.innerHTML = pshow(ids.map((id) => INDEX.parshiot.find((p) => p.id === id)).filter(Boolean));
    else {
      const n = cal.slice(i + 1).find((x) => x[2]);
      const np = n ? n[2].map((id) => INDEX.parshiot.find((p) => p.id === id)).filter(Boolean) : [];
      slot.innerHTML = `<div class="wk-card wk-hol"><div class="wk-name"><span class="he">${esc(holHe ? holHe.replace(RE_NIKKUD, "") : "שבת")}</span><span class="en">${esc(holEn || "Shabbat")}</span></div>${when}
        <div class="wk-range">A festival reading this Shabbat — no weekly parsha.</div></div>
        ${np.length ? `<div class="wk-links"><a class="chip" href="#parsha-${np[0].id}">Next: <span class="he">פרשת ${np.map((p) => esc(p.he)).join("־")}</span> · ${esc(new Date(n[0] + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" }))}</a></div>` : ""}`;
    }
  }

  const iconX = `<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  function pasukCard({ slug, c, v, text, href, label, removable }) {
    const he = heText(text.he[c - 1][v - 1] || "");
    const en = text.en[c - 1][v - 1] || "";
    return `<div class="pcard" data-href="${esc(href)}" tabindex="0" role="link">
      ${label ? `<div class="pc-label"><span>${esc(label[0])}</span><span class="he">${esc(label[1])}</span></div>` : ""}
      <div class="pc-ref"><span class="en">${esc(refEn(slug, c, v))}</span><span class="he">${esc(refHe(slug, c, v))}</span></div>
      <div class="pc-he">${he}</div>
      <div class="pc-en">${en}</div>
      ${removable === "fav" ? `<button class="icon-btn pc-rm" type="button" data-rmf="${slug}:${c}:${v}" aria-label="Remove from favourites" title="Remove from favourites">${iconX}</button>`
        : removable ? `<button class="icon-btn pc-rm" type="button" data-rm="${slug}:${c}:${v}" aria-label="Remove bookmark" title="Remove bookmark">${iconX}</button>` : ""}
    </div>`;
  }
  function wireCards(root) {
    $$(".pcard", root).forEach((el) => {
      const go = () => {
        if (el.dataset.cm) { const [cid, s, c, v, i] = el.dataset.cm.split(":"); pendingComment = { cid, s, c: +c, v: +v, i: +i }; }
        location.hash = el.dataset.href;
      };
      el.addEventListener("click", (e) => { if (e.target.closest("button, sup")) return; go(); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  async function renderContinue(last) {
    const slot = $("#continueSlot"); if (!slot || !last || !last.s || !INDEX.books[last.s]) return;
    preloadPlaceFor(last.s, last.c, last.v, last.pid);   // so "Continue reading" opens instantly, Rashi and haftarah included
    let text; try { text = await loadText(last.s); } catch { return; }
    if (!$("#continueSlot")) return;
    const b = book(last.s);
    if (!text.he[last.c - 1] || !text.he[last.c - 1][last.v - 1]) return;
    slot.innerHTML = pasukCard({ slug: last.s, c: last.c, v: last.v, text, href: last.hash,
      label: last.pid ? [`Parashat ${last.pen}`, `פרשת ${last.phe}`] : null });
    wireCards(slot);
  }

  /* Favourites and bookmarks on the home page, each divided into Torah, Nevi'im, Ketuvim and Sefarim Chitzonim,
     in the order of the sefarim; a long group shows its first few with "Show all" */
  const SAVED_CAP = 6;
  const savedOpen = new Set();             // groups shown in full, e.g. "fav:torah"
  const commRank = (cid) => { const i = COMMENTARIES.findIndex((m) => m.id === cid); return i < 0 ? 99 : i; };
  const savedSort = (a, b) => ORDER.indexOf(a.b) - ORDER.indexOf(b.b) || a.c - b.c || a.v - b.v
    || (a.cid ? 1 : 0) - (b.cid ? 1 : 0) || commRank(a.cid) - commRank(b.cid) || (a.i || 0) - (b.i || 0);
  function savedCard(kind, bm, texts, comms) {
    if (!texts[bm.b]) return "";
    if (!bm.cid) return pasukCard({ slug: bm.b, c: bm.c, v: bm.v, text: texts[bm.b], href: chapterHash(bm.b, bm.c, bm.v), removable: kind });
    const d = comms[`${bm.cid}:${bm.b}`]; if (!d) return "";
    const he = at(d.he, bm.c, bm.v)[bm.i]; if (!he) return "";
    const en = d.en ? at(d.en, bm.c, bm.v)[bm.i] || "" : "";
    const m = commMeta(bm.cid);
    return `<div class="pcard ccard" data-href="${esc(chapterHash(bm.b, bm.c, bm.v))}" data-cm="${bm.cid}:${bm.b}:${bm.c}:${bm.v}:${bm.i}" tabindex="0" role="link">
        <div class="pc-label"><span>${esc(m.en)}</span><span class="he">${m.he}</span></div>
        <div class="pc-ref"><span class="en">${esc(refEn(bm.b, bm.c, bm.v))}</span><span class="he">${esc(refHe(bm.b, bm.c, bm.v))}</span></div>
        <div class="pc-he pc-comm">${heComm(he)}</div>
        ${en ? `<div class="pc-en pc-comm-en">${en}</div>` : ""}
        <button class="icon-btn pc-rm" type="button" data-rmc="${bm.cid}:${bm.b}:${bm.c}:${bm.v}:${bm.i}" aria-label="Remove bookmark" title="Remove bookmark">${iconX}</button>
      </div>`;
  }
  function savedGroups(kind, list, texts, comms) {
    const sorted = list.slice().sort(savedSort);
    return INDEX.sections.map((sec) => {
      const cards = sorted.filter((x) => book(x.b).section === sec.id).map((x) => savedCard(kind, x, texts, comms)).filter(Boolean);
      if (!cards.length) return "";
      const key = `${kind}:${sec.id}`, all = savedOpen.has(key);
      return `<div class="saved-group">
          <div class="group-label saved-label"><span class="en">${esc(sec.en)}<small>${cards.length}</small></span><span class="he">${esc(sec.he)}</span></div>
          <div class="pcards">${(all ? cards : cards.slice(0, SAVED_CAP)).join("")}</div>
          ${cards.length > SAVED_CAP ? `<button type="button" class="saved-more" data-more="${key}">${all ? "Show fewer" : `Show all ${cards.length}`}</button>` : ""}
        </div>`;
    }).join("");
  }
  const EMPTY_FAV = `<p class="empty">No favourites yet — tap the star beside any pasuk.</p>`;
  const EMPTY_BM = `<p class="empty">No saved pesukim yet — open the reader and tap the bookmark icon beside any pasuk.</p>`;
  async function renderSaved() {
    const favEl = $("#favList"), bmEl = $("#bmList"); if (!favEl || !bmEl) return;
    const favs = favourites.filter((f) => INDEX.books[f.b]), bms = bookmarks.filter((b) => INDEX.books[b.b]);
    if (!favs.length) favEl.innerHTML = EMPTY_FAV;
    if (!bms.length) bmEl.innerHTML = EMPTY_BM;
    if (!favs.length && !bms.length) return;
    const texts = {}, comms = {};
    await Promise.all([...new Set([...favs, ...bms].map((b) => b.b))].map((sl) => loadText(sl).then((t) => (texts[sl] = t)).catch(() => {})));
    await Promise.all(bms.filter((bm) => bm.cid && commMeta(bm.cid)).map(async (bm) => {
      const k = `${bm.cid}:${bm.b}`; if (comms[k]) return; comms[k] = null;
      try { comms[k] = { he: await loadComm(bm.cid, bm.b), en: commMeta(bm.cid).enDir ? await loadCommEn(bm.cid, bm.b).catch(() => null) : null }; } catch {}
    }));
    if (!favEl.isConnected) return;
    favEl.innerHTML = favs.length ? savedGroups("fav", favs, texts, comms) || EMPTY_FAV : EMPTY_FAV;
    bmEl.innerHTML = bms.length ? savedGroups("bm", bms, texts, comms) || EMPTY_BM : EMPTY_BM;
    for (const el of [favEl, bmEl]) {
      wireCards(el);
      el.onclick = (e) => {
        const b = e.target.closest("[data-rm], [data-rmc], [data-rmf], [data-more]"); if (!b) return;
        e.stopPropagation();
        if (b.dataset.more) { const k = b.dataset.more; if (savedOpen.has(k)) savedOpen.delete(k); else savedOpen.add(k); }
        else if (b.dataset.rmf) { const [sl, c, v] = b.dataset.rmf.split(":"); removeFav(sl, +c, +v); }
        else if (b.dataset.rm) { const [sl, c, v] = b.dataset.rm.split(":"); removeBookmark(sl, +c, +v); }
        else { const [cid, sl, c, v, i] = b.dataset.rmc.split(":"); removeCommBm(cid, sl, +c, +v, +i); }
        renderSaved();
      };
    }
  }

  /* ───────── Bookmarks ───────── */
  const isBookmarked = (s, c, v) => bookmarks.some((b) => !b.cid && b.b === s && b.c === c && b.v === v);
  function removeBookmark(s, c, v) { bookmarks = bookmarks.filter((b) => b.cid || !(b.b === s && b.c === c && b.v === v)); store.set("bookmarks", bookmarks); }
  /* a single comment (Rashi, or any meforash in Pages) can be saved too */
  const isCommBm = (cid, s, c, v, i) => bookmarks.some((b) => b.cid === cid && b.b === s && b.c === c && b.v === v && b.i === i);
  function removeCommBm(cid, s, c, v, i) { bookmarks = bookmarks.filter((b) => !(b.cid === cid && b.b === s && b.c === c && b.v === v && b.i === i)); store.set("bookmarks", bookmarks); }
  function toggleCommBm(cid, s, c, v, i, btn) {
    const name = commMeta(cid).en;
    if (isCommBm(cid, s, c, v, i)) { removeCommBm(cid, s, c, v, i); btn && btn.classList.remove("on"); toast("Bookmark removed"); return; }
    bookmarks.push({ b: s, c, v, cid, i, t: Date.now() });
    store.set("bookmarks", bookmarks);
    btn && btn.classList.add("on");
    toast(`Saved ${name} on ${refEn(s, c, v)}`);
  }
  // opening a saved comment: shown once the pasuk is drawn
  let pendingComment = null;
  function showPendingComment() {
    const pc = pendingComment; if (!pc) return; pendingComment = null;
    if (PG) {
      const el = $(`#pgFlow .pg-c[data-cid="${pc.cid}"][data-i="${pc.i}"]`); if (!el) return;
      const ph = $(".ph", el);
      if (ph) showPhrase(+ph.dataset.p); else { const pg = pageOf(el); if (pg !== PG.page) { PG.page = pg; pagerMove(); } }
      return;
    }
    const row = $(`#v-${pc.s}-${pc.c}-${pc.v}`); if (!row) return;
    const cr = $(`.rrow[data-cid="${pc.cid}"][data-i="${pc.i}"]`, row);
    if (cr) { cr.classList.remove("flash"); void cr.offsetWidth; cr.classList.add("flash"); }
  }
  function toggleBookmark(s, c, v) {
    if (isBookmarked(s, c, v)) { removeBookmark(s, c, v); syncMarks(s, c, v); toast("Bookmark removed"); return; }
    bookmarks.push({ b: s, c, v, t: Date.now() });
    store.set("bookmarks", bookmarks);
    syncMarks(s, c, v);
    toast(`Saved ${refEn(s, c, v)}`);
  }

  /* ───────── Favourites (a star on each pasuk) ───────── */
  const isFav = (s, c, v) => favourites.some((f) => f.b === s && f.c === c && f.v === v);
  function removeFav(s, c, v) { favourites = favourites.filter((f) => !(f.b === s && f.c === c && f.v === v)); store.set("favourites", favourites); }
  function toggleFav(s, c, v) {
    if (isFav(s, c, v)) { removeFav(s, c, v); syncMarks(s, c, v); toast("Removed from favourites"); return; }
    favourites.push({ b: s, c, v, t: Date.now() });
    store.set("favourites", favourites);
    syncMarks(s, c, v);
    toast(`★ ${refEn(s, c, v)} added to favourites`);
  }
  /* every button for this pasuk shows its state (Scroll rows and Pages are both kept in memory) */
  function syncMarks(s, c, v) {
    const sel = `[data-s="${s}"][data-c="${c}"][data-v="${v}"]`, bm = isBookmarked(s, c, v), fv = isFav(s, c, v);
    $$(`.verse${sel} .bm-btn, .pg-bm${sel}`).forEach((b) => b.classList.toggle("on", bm));
    $$(`.verse${sel} .fav-btn, .pg-fav${sel}`).forEach((b) => { b.classList.toggle("on", fv); b.setAttribute("aria-pressed", String(fv)); });
  }

  /* ───────── Reader ───────── */
  const iconBookmark = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
  const iconStar = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const iconCopy = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 4.5V14A1.5 1.5 0 0 0 6 15.5h1" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;

  function segmentsFor(r) {
    if (r.view === "chapter") return [{ slug: r.slug, c: r.c, from: 1, to: book(r.slug).verses[r.c - 1] }];
    const [slug, c1, v1, c2, v2] = r.p.range; const segs = [];
    for (let c = c1; c <= c2; c++) segs.push({ slug, c, from: c === c1 ? v1 : 1, to: c === c2 ? v2 : book(slug).verses[c - 1] });
    return segs;
  }

  function neighbors(r) {
    if (r.view === "parsha") {
      const i = r.p.index, P = INDEX.parshiot;
      const mk = (p) => p && { hash: `#parsha-${p.id}`, en: p.en, he: "פרשת " + p.he };
      return { prev: mk(P[i - 1]), next: mk(P[i + 1]) };
    }
    const bi = ORDER.indexOf(r.slug); const b = book(r.slug);
    let prev = null, next = null;
    if (r.c > 1) prev = [r.slug, r.c - 1]; else if (nbBook(r.slug, -1)) { const s = nbBook(r.slug, -1); prev = [s, book(s).verses.length]; }
    if (r.c < b.verses.length) next = [r.slug, r.c + 1]; else if (nbBook(r.slug, 1)) next = [nbBook(r.slug, 1), 1];
    const mk = (x) => x && { hash: chapterHash(x[0], x[1]), en: refEn(x[0], x[1]), he: refHe(x[0], x[1]) };
    return { prev: mk(prev), next: mk(next) };
  }

  let readerState = null; // { r, slug, text, sel:{s,c,v}, tab }

  /* ═════════ Pages layout: one pasuk per page (more pages if it needs them), turned by swiping ═════════
     The pasuk and its meforshim are shown in Hebrew only. Tapping a phrase — or stepping with the arrows in the
     strip underneath — shows that phrase's English, phrase by phrase. No vertical scrolling: the content of each
     pasuk flows into screen-sized columns, and each column is a page. */
  let PG = null;
  const PG_GAP = 48;
  function leavePages() {
    if (!PG) return;
    PG = null;
    document.body.classList.remove("pages-mode");
  }
  /* pasuk phrases: split at the major disjunctive ta'amim (etnachta, segol, zakef) */
  const SPLIT_TAAM = /[֑֒֔֕]/;
  function pasukPhrases(rawHe, rawEn) {
    const t = document.createElement("template"); t.innerHTML = rawHe || "";
    const words = norm(cleanFrag(t.content).textContent).split(" ");
    const H = []; let cur = [];
    for (const w of words) { cur.push(w); if (SPLIT_TAAM.test(w)) { H.push(cur.join(" ")); cur = []; } }
    if (cur.length) H.push(cur.join(" "));
    const merged = []; for (const h of H) { if (merged.length && h.split(" ").length <= 1) merged[merged.length - 1] += " " + h; else merged.push(h); }
    return alignPhrases(merged, splitPhrases(htmlToText(rawEn || ""), "en"));
  }
  function phrasedPasuk(rawHe, rawEn, reg, src) {
    return pasukPhrases(rawHe, rawEn).map((rw) => {
      const i = reg.push({ en: rw.en.join(" "), src }) - 1;
      return `<span class="ph" data-p="${i}">${esc(heText(rw.he.join(" ")))}</span>`;
    }).join(" ");
  }
  /* a comment as the phrases Pages shows: its dibbur hamatchil (if any), then each highlight with its English */
  /* a comment cut into what is matched: the Hebrew dibbur hamatchil and the rest, the English ones likewise */
  function commParts(heHtml, enHtml) {
    const H = extractDH(heComm(heHtml)), E = extractDH(enHtml || "", true);
    let enRest = E.rest, enDH = E.dh;
    if (!enDH) { const m = enRest.match(/^([^a-z\uE000\uE001]{3,}?[.:])\s+(?=\S)/); if (m && /[A-Z]{2}/.test(m[1])) { enDH = m[1]; enRest = enRest.slice(m[0].length); } }  // capitals, if any are left
    if (!H.dh && enDH) { enRest = `${B0}${enDH}${B1} ${enRest}`; enDH = ""; }
    return { heDH: H.dh, heRest: H.rest, enDH, enRest };
  }
  /* the English of a comment word by word, with its bold (the English dibbur hamatchil is bold throughout) */
  function enWords(eu, edh) {
    let on = false;
    return eu.map((e, j) => e.split(" ").filter(Boolean).map((tok) => {
      let b = false;
      for (const ch of tok) { if (ch === B0) on = true; else if (ch === B1) on = false; else if (on) b = true; }
      return { t: unB(tok), b: b || (edh && j === 0) };
    }));
  }
  const boldWords = (ws) => { let h = "", on = false; ws.forEach((w, i) => { if (w.b && !on) { h += "<b>"; on = true; } if (!w.b && on) { h += "</b>"; on = false; } h += (i ? " " : "") + esc(w.t); }); return (on ? h + "</b>" : h).replace(/ <\/b>/g, "</b> "); };
  /* the matches made ahead of time for this comment, as highlights: each a run of Hebrew phrases and the English
     pieces that translate them (in the Hebrew's order — the English may come from anywhere in the translation;
     pieces that don't stand together in it are joined with " … ") */
  function unitsFromAlign(al, heDH, heRest, enDH, enRest) {
    const hu = (heDH ? [heDH] : []).concat(splitPhrases(heRest, "he"));
    const eu = (enDH ? [enDH] : []).concat(splitPhrases(enRest, "en"));
    if (al[0] !== hu.length || al[1] !== eu.length) return null;      // not cut the same way: match it here instead
    const W = enWords(eu, !!enDH);
    const out = []; let k = 0;
    for (const [size, pieces] of al[2]) {
      const he = hu.slice(k, k + size), dhIn = !!heDH && k === 0;
      let en = "", html = "", prev = null;
      for (const p of pieces) {
        const [j, a, b0] = typeof p === "number" ? [p, 0, -1] : p, ws = W[j] || [], b = b0 < 0 ? ws.length : b0;
        const w = ws.slice(a, b); if (!w.length) continue;
        const joined = prev && ((prev[0] === j && prev[1] === a) || (prev[0] + 1 === j && prev[1] === (W[prev[0]] || []).length && a === 0));
        const sep = prev ? (joined ? " " : " … ") : "";
        en += sep + w.map((x) => x.t).join(" "); html += sep + boldWords(w); prev = [j, b];
      }
      out.push(dhIn && size === 1 ? { dh: true, he: heDH, en, html }
        : { he: (dhIn ? he.slice(1) : he).join(" "), heDH: dhIn ? heDH : "", en, html });
      k += size;
    }
    return out;
  }
  function commUnits(heHtml, enHtml, al) {
    const { heDH, heRest, enDH, enRest } = commParts(heHtml, enHtml), H = { dh: heDH };
    if (al && enHtml) { const u = unitsFromAlign(al, heDH, heRest, enDH, enRest); if (u) return u; }
    const rows = alignComment(heRest, enRest);
    const ens = boldSeq(rows.map((rw) => rw.en.join(" ")));
    const out = [];
    if (H.dh) out.push({ dh: true, he: H.dh, en: enDH, html: enDH ? `<b>${esc(enDH)}</b>` : "" });
    rows.forEach((rw, k) => out.push({ he: rw.he.join(" "), en: unB(rw.en.join(" ")), html: ens[k] }));
    return out;
  }
  function phrasedComment(heHtml, enHtml, reg, src, al) {
    return commUnits(heHtml, enHtml, al).map((u) => {
      const i = reg.push({ en: u.en, html: u.html, src }) - 1;
      return u.dh ? `<b class="ph dh" data-p="${i}">${esc(u.he)}</b> `
        : `<span class="ph" data-p="${i}">${u.heDH ? `<b class="dh">${esc(u.heDH)}</b> ` : ""}${esc(u.he)}</span> `;
    }).join("");
  }

  async function renderPages(r, text) {
    const app = $("#app"), slug = r.slug, b = book(slug);
    const comms = pgComms(slug);
    if (!comms.every((c) => resolved.has(commUrl(c.id, slug)))) app.innerHTML = `<div class="loading">טוען…</div>`;
    // everything for this sefer is loaded before the first page shows
    const intros = {};
    await Promise.all([loadLex(), fontsReady("pages"), ...comms.map(async (c) => {
      await Promise.allSettled([loadComm(c.id, slug), loadCommEn(c.id, slug)]);
      if (c.introDir && INDEX.intros && (INDEX.intros[c.id] || []).includes(slug)) { try { intros[c.id] = await fetchJSON(c.introDir + slug + ".json"); } catch {} }
    })]);
    if (readerState === null || readerState.r !== r) return;
    document.title = `${b.en} — Tanach Reader`;
    PG = { slug, text, comms, intros, items: [], idx: 0, page: 0, pages: 1, phr: [], active: null, firstPasuk: 0 };
    buildPagerItems();
    const items = PG.items;
    let idx;
    if (r.pgHaft) {
      const at = r.pgHaftAt;
      idx = at ? items.findIndex((it) => it.type === "haft" && it.pid === r.pgHaft && it.s === at.s && it.c === at.c && it.v === at.v) : -1;
      if (idx < 0) idx = items.findIndex((it) => it.type === "haft" && it.pid === r.pgHaft);
    } else if (r.pgParsha) {
      idx = items.findIndex((it) => it.type === "intro" && it.parsha === r.pgParsha);
      if (idx < 0) idx = items.findIndex((it) => it.type === "pasuk" && it.c === r.c && it.v === r.v);
    } else if (r.pgIntro) {
      idx = items.findIndex((it) => it.type === "intro" && it.key === r.pgIntro.key);
      if (idx < 0 && r.pgIntro.parsha) idx = items.findIndex((it) => (it.type === "intro" && it.parsha === r.pgIntro.parsha) || (it.type === "pasuk" && it.c === r.c && it.v === r.v));
      if (idx < 0) idx = 0;
    }
    else if (r.v) idx = items.findIndex((it) => it.type === "pasuk" && it.c === r.c && it.v === r.v);
    else if (r.c === 1) idx = 0;
    else idx = items.findIndex((it) => it.type === "pasuk" && it.c === r.c);
    PG.idx = Math.max(0, idx);
    setPicker(r);
    app.textContent = "";
    document.body.classList.add("pages-mode");
    app.innerHTML = `
      <div class="pager" id="pager">
        <div class="pg-viewport"><div class="pg-stage" id="pgStage">
          <div class="pg-top" id="pgTop"></div>
          <div class="pg-clip"><div class="pg-flow" id="pgFlow"></div></div>
        </div></div>
        <div class="pg-trans" id="pgTrans" aria-live="polite">
          <button type="button" class="pg-step" data-step="1" aria-label="Next phrase" title="Next phrase">‹</button>
          <div class="pg-tx"><div class="pg-tx-src"></div><div class="pg-tx-en"></div></div>
          <button type="button" class="pg-step" data-step="-1" aria-label="Previous phrase" title="Previous phrase">›</button>
        </div>
        <nav class="pg-nav">
          <div class="pg-nav-mid">
            <button type="button" class="pg-btn" data-go="1" aria-label="Next page" dir="ltr"><span aria-hidden="true">‹</span> הבא</button>
            <div class="pg-where"><span class="he" id="pgWhere"></span><span class="pg-count" id="pgCount"></span></div>
            <button type="button" class="pg-btn" data-go="-1" aria-label="Previous page" dir="ltr">הקודם <span aria-hidden="true">›</span></button>
          </div>
        </nav>
      </div>`;
    wirePager();
    pagerShow(PG.idx, 0);
    showPendingComment();
    preloadForCopy();
  }

  /* the sequence of pages for a sefer: introductions, every pasuk, and each parsha's haftarah after its last pasuk */
  function buildPagerItems() {
    const b = book(PG.slug), items = [];
    // all the introductions before a pasuk flow on together as one run of pages, each under its commentator's name
    const seferParts = [], pIntro = new Map();   // "c:v" of a parsha's first pasuk → its introductions
    for (const c of PG.comms) {
      const secs = PG.intros[c.id] || [];
      const sefer = secs.filter((x) => !x.parsha);
      if (sefer.length) seferParts.push({ cid: c.id, secs: sefer });
      for (const x of secs.filter((y) => y.parsha)) {
        const k = `${x.c}:${x.v}`;
        if (!pIntro.has(k)) pIntro.set(k, { type: "intro", key: x.key, parsha: x.parsha, parts: [] });
        pIntro.get(k).parts.push({ cid: c.id, secs: [x] });
      }
    }
    if (seferParts.length) items.push({ type: "intro", key: "sefer", parts: seferParts });
    PG.firstPasuk = items.length;
    const ends = new Map();
    if (settings.haftarah && b.section === "torah") for (const p of INDEX.parshiot) if (p.range[0] === PG.slug) ends.set(`${p.range[3]}:${p.range[4]}`, p);
    b.verses.forEach((n, ci) => {
      for (let v = 1; v <= n; v++) {
        const pi = pIntro.get(`${ci + 1}:${v}`); if (pi) items.push(pi);
        items.push({ type: "pasuk", c: ci + 1, v });
        const p = ends.get(`${ci + 1}:${v}`);
        if (p) haftRanges(p).forEach(([s, c1, v1, c2, v2], k) => {
          for (let c = c1; c <= c2; c++) {
            const from = c === c1 ? v1 : 1, to = c === c2 ? v2 : book(s).verses[c - 1];
            for (let vv = from; vv <= to; vv++) items.push({ type: "haft", pid: p.id, k, s, c, v: vv, first: k === 0 && c === c1 && vv === from });
          }
        });
      }
    });
    PG.items = items;
  }
  function haftHeadHTML(p, it) {
    const opts = haftOptions(p), choice = haftChoice(p), opt = opts.find((o) => o.id === choice) || opts[0];
    const ranges = haftRanges(p);
    const links = ranges.map((rg) => `<a href="${chapterHash(rg[0], rg[1], rg[2])}" title="Open in ${esc(book(rg[0]).en)}"><span class="he">${esc(rangeHe(rg))}</span> ↗</a>`).join(`<span class="plus">+</span>`);
    const chips = opts.length > 1 ? `<div class="haft-opts" role="group">${opts.map((o) =>
      `<button type="button" class="haft-opt ${o.id === choice ? "on" : ""}" data-opt="${o.id}" data-pid="${p.id}"><span class="he">${esc(o.he)}</span><small>${esc(o.en)}</small></button>`).join("")}</div>` : "";
    return `<div class="pg-haft-head">
        <div class="haft-title"><span class="he">הפטרת ${esc(p.he)}${opt.id !== "reg" ? ` · ${esc(opt.he)}` : ""}</span><span class="en">Haftarah · ${esc(p.en)}${opt.id !== "reg" ? ` · ${esc(opt.en)}` : ""}</span></div>
        ${it.first ? chips : ""}
        <div class="haft-src">${links}</div>
      </div>`;
  }

  /* Each page, like a page of Mikraot Gedolot: the pasuk set at the top, the meforshim flowing beneath it in columns.
     Returns { top, body } — the top repeats on every page of the pasuk, the body is paginated. */
  function pagerItemHTML(it) {
    const reg = PG.phr = [];
    const b = book(PG.slug);
    if (it.type === "intro") {
      const pp = it.parsha && INDEX.parshiot.find((x) => x.id === it.parsha);
      const one = it.parts.length === 1 ? commMeta(it.parts[0].cid) : null;
      const he = one ? `${introName(one)} ל${pp ? `פרשת ${pp.he}` : b.he}` : `הקדמות ל${pp ? `פרשת ${pp.he}` : `ספר ${b.he}`}`;
      const en = one ? `${one.en} · Introduction to ${pp ? `Parashat ${pp.en}` : b.en}` : `Introductions to ${pp ? `Parashat ${pp.en}` : b.en}`;
      return {
        top: `<h2 class="pg-title"><span class="en">${esc(en)}</span><span class="he">${esc(he)}</span></h2>`,
        body: it.parts.map(({ cid, secs }) => {
          const c = commMeta(cid);
          return `<h3 class="pg-cname"><span class="he">${esc(c.he)}</span><span class="en">${esc(c.en)}</span></h3>` + secs.map((sc) =>
            `${secs.length > 1 ? `<h4 class="pg-subname"><span class="he">${esc(sc.he)}</span><span class="en">${esc(sc.en)}</span></h4>` : ""}
            ${sc.he_p.map((p, i) => `<p class="pg-para" data-anchor="i:${cid}:${esc(sc.key)}:${i}">${phrasedComment(p, sc.en_p[i] || "", reg, `${c.en} · ${esc(sc.en)}`)}</p>`).join("")}`).join("");
        }).join(""),
      };
    }
    if (it.type === "haft") {
      const p = INDEX.parshiot.find((x) => x.id === it.pid), hb = book(it.s);
      const text = resolved.get(textUrl(it.s));
      if (!text || !copyReady(it.s)) {
        loadPlace(it.s).then(() => { if (PG && PG.items[PG.idx] === it) pagerShow(PG.idx, PG.page); });
        return { top: haftHeadHTML(p, it), body: `<div class="loading" style="padding:30px 0;font-size:1rem">טוען…</div>` };
      }
      const top = haftHeadHTML(p, it) + `<div class="pg-head"><span class="he"><a href="${chapterHash(it.s, it.c, it.v)}" title="Open in ${esc(hb.en)}">${esc(hb.he)} ${plainGem(it.c)}:${plainGem(it.v)}</a></span>${pgTools(it.s, it.c, it.v)}<span class="en">${esc(hb.en)} ${it.c}:${it.v}</span></div>
        <div class="pg-pasuk cu${picks.has(pickKey(it.s, it.c, it.v)) ? " picked" : ""}" data-kind="verse" data-s="${it.s}" data-c="${it.c}" data-v="${it.v}"><div class="cu-he">${phrasedPasuk(text.he[it.c - 1][it.v - 1], text.en[it.c - 1][it.v - 1], reg, "JPS")}</div></div>`;
      return { top, body: commentaryBody(it.s, it.c, it.v, reg) };
    }
    const { c, v } = it, s = PG.slug;
    const key = `${s}:${c}:${v}`;
    const tags = [];
    const mk = b.section === "torah" ? MARKS.get(key) : null;
    if (mk && mk.parsha) tags.push(`פרשת ${esc(mk.parsha.he)}`);
    if (b.section === "torah") for (const p of INDEX.parshiot.filter((x) => x.range[0] === s)) for (const stp of aliyahStops(p)) if (stp.c === c && stp.v === v) tags.push(esc(stp.he));
    if (settings.sedarim && SEDER.has(key)) tags.push(`סדר ${esc(SEDER.get(key))}`);
    const top = `<div class="pg-head"><span class="he">${esc(b.he)} ${plainGem(c)}:${plainGem(v)}${tags.length ? ` <small>· ${tags.join(" · ")}</small>` : ""}</span>${pgTools(s, c, v)}<span class="en">${esc(b.en)} ${c}:${v}</span></div>
      <div class="pg-pasuk cu${picks.has(pickKey(s, c, v)) ? " picked" : ""}" data-kind="verse" data-s="${s}" data-c="${c}" data-v="${v}"><div class="cu-he">${phrasedPasuk(PG.text.he[c - 1][v - 1], PG.text.en[c - 1][v - 1], reg, "JPS")}</div></div>`;
    return { top, body: commentaryBody(s, c, v, reg) };
  }
  function pgTools(s, c, v) {
    return `<span class="pg-tools"><button type="button" class="pg-bm ${isBookmarked(s, c, v) ? "on" : ""}" data-s="${s}" data-c="${c}" data-v="${v}" aria-label="Bookmark" title="Bookmark">${iconBookmark}</button><button type="button" class="pg-fav ${isFav(s, c, v) ? "on" : ""}" data-s="${s}" data-c="${c}" data-v="${v}" aria-pressed="${isFav(s, c, v)}" aria-label="Favourite" title="Favourite">${iconStar}</button><button type="button" class="pg-copy" aria-label="Copy this pasuk" title="Copy this pasuk">${iconCopy}</button><button type="button" class="pg-pick ${picks.has(pickKey(s, c, v)) ? "on" : ""}" data-s="${s}" data-c="${c}" data-v="${v}" aria-pressed="${picks.has(pickKey(s, c, v))}" title="Select this pasuk to copy with others"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path class="tick" d="M6.5 10.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${picks.has(pickKey(s, c, v)) ? "Selected" : "Select"}</span></button></span>`;
  }
  function commentaryBody(s, c, v, reg) {
    let body = "";
    for (const cm of pgComms(s)) {
      const list = at(resolved.get(commUrl(cm.id, s)), c, v); if (!list.length) continue;
      const enl = at(resolved.get(commEnUrl(cm.id, s)), c, v);
      body += `<h3 class="pg-cname"><span class="he">${cm.he}</span><span class="en">${esc(cm.en)}</span></h3>
        ${list.map((x, i) => `<div class="pg-c cu" data-anchor="c:${cm.id}:${i}" data-kind="comm" data-cid="${cm.id}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}"><div class="cu-he">${phrasedComment(x, enl[i] || "", reg, cm.enSrc ? `${cm.en} · ${cm.enSrc}` : cm.en, alignOf(cm.id, s, c, v, i))}</div></div>`).join("")}`;
    }
    return body || `<p class="pg-none">אין פירוש על פסוק זה</p>`;
  }

  function pagerLayout(keepPhrase) {
    if (!PG) return;
    const flow = $("#pgFlow"), clip = flow && flow.parentElement; if (!flow) return;
    const W = clip.clientWidth;
    const cols = W >= 1080 ? 3 : W >= 620 ? 2 : 1;
    const colW = (W - (cols - 1) * PG_GAP) / cols;
    flow.style.columnWidth = colW + "px"; flow.style.columnGap = PG_GAP + "px"; flow.style.height = clip.clientHeight + "px";
    PG.W = W; PG.cols = cols;
    PG.pages = lastPage(flow) + 1;
    if (keepPhrase && PG.active != null) { const el = flow.querySelector(`.ph[data-p="${PG.active}"]`); if (el) PG.page = pageOf(el); }
    PG.page = Math.min(PG.page, PG.pages - 1);
    pagerMove(false);
  }
  function lastPage(flow) {
    let el = flow.lastElementChild;
    while (el && el.classList.contains("pg-end")) el = el.previousElementSibling;
    if (!el) return 0;
    const rs = el.getClientRects(); if (!rs.length) return 0;
    const fr = flow.getBoundingClientRect(), r = rs[rs.length - 1];
    let lo = r, x = (r.left + r.right) / 2 - fr.left;
    for (const q of rs) { const qx = (q.left + q.right) / 2 - fr.left; if (qx < x) { x = qx; lo = q; } }   // leftmost fragment = last page
    return Math.max(0, Math.floor((PG.W - x) / (PG.W + PG_GAP)));
  }
  /* right-to-left pages: page 0 is the flow's own box; page k lies k page-widths to its left */
  function pageOf(el) {
    const flow = $("#pgFlow"), fr = flow.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2 - fr.left;
    return Math.max(0, Math.floor((PG.W - x) / (PG.W + PG_GAP)));
  }
  function pagerMove(animate = true) {
    const flow = $("#pgFlow"); if (!flow) return;
    flow.style.transition = animate ? "" : "none";
    flow.style.transform = `translateX(${PG.page * (PG.W + PG_GAP)}px)`;
    if (!animate) { void flow.offsetWidth; flow.style.transition = ""; }
    const it = PG.items[PG.idx], b = book(PG.slug);
    $("#pgWhere").textContent = it.type === "intro" ? (it.parts.length === 1 ? introName(commMeta(it.parts[0].cid)) : "הקדמות") + (it.parsha ? ` · פרשת ${(INDEX.parshiot.find((x) => x.id === it.parsha) || {}).he || ""}` : "")
      : it.type === "haft" ? `הפטרה · ${book(it.s).he} ${plainGem(it.c)}:${plainGem(it.v)}`
      : `${b.he} ${plainGem(it.c)}:${plainGem(it.v)}`;
    $("#pgCount").textContent = PG.pages > 1 ? `${PG.page + 1} / ${PG.pages}` : "";
    const bi = ORDER.indexOf(PG.slug);
    $$(".pg-btn[data-go='-1']").forEach((x) => (x.disabled = PG.idx === 0 && PG.page === 0 && !nbBook(PG.slug, -1)));
    $$(".pg-btn[data-go='1']").forEach((x) => (x.disabled = PG.idx === PG.items.length - 1 && PG.page === PG.pages - 1 && !nbBook(PG.slug, 1)));
  }
  function pagerShow(idx, page, dir = 1) {
    PG.idx = idx; PG.active = null;
    const flow = $("#pgFlow"), stage = $("#pgStage");
    const { top, body } = pagerItemHTML(PG.items[idx]);
    $("#pgTop").innerHTML = top;
    flow.innerHTML = body + `<span class="pg-end"></span>`;
    stage.classList.remove("from-left", "from-right"); void stage.offsetWidth;
    if (!quietShow) stage.classList.add(dir >= 0 ? "from-left" : "from-right");
    PG.page = 0; pagerLayout(false);
    PG.page = page === "last" ? PG.pages - 1 : Math.min(page || 0, PG.pages - 1);
    pagerMove(false);
    showPhrase(null);
    // the next pasuk's phrase matching, done while you read this one (turning the page is then quicker)
    const nx = PG.items[idx + 1], slugNow = PG.slug;
    if (nx && nx.type === "pasuk") idle(() => { if (PG && PG.slug === slugNow) warmPasuk(slugNow, nx.c, nx.v); }, 2000);
    // where we are: address, picker, aliyah button, Continue reading
    const it = PG.items[idx];
    let pos;
    if (it.type === "haft") {
      const p = INDEX.parshiot.find((x) => x.id === it.pid);
      pos = { s: PG.slug, c: p.range[3], v: p.range[4], haft: true, pid: it.pid, at: { s: it.s, c: it.c, v: it.v } };
      history.replaceState(null, "", `#parsha-${it.pid}-haftarah`);
    } else if (it.type === "intro" && it.parsha) {
      const p = INDEX.parshiot.find((x) => x.id === it.parsha);
      pos = { s: PG.slug, c: p.range[1], v: p.range[2] };
      history.replaceState(null, "", `#parsha-${p.id}`);
    } else {
      pos = it.type === "pasuk" ? { s: PG.slug, c: it.c, v: it.v } : { s: PG.slug, c: 1, v: 1 };
      history.replaceState(null, "", it.type === "pasuk" ? chapterHash(PG.slug, it.c, it.v) : chapterHash(PG.slug, 1));
    }
    readerState.lastPos = pos; current.c = pos.c; current.v = it.type === "pasuk" ? it.v : null;
    setPicker({ view: "chapter", slug: PG.slug, c: pos.c });
    if (it.type === "pasuk") saveLast(pos);
    updateAliyahBtn(pos);
    // get this parsha's haftarah (text, Rashi, translation) ready before it's reached
    if (settings.haftarah && book(PG.slug).section === "torah" && it.type === "pasuk") {
      const p = INDEX.parshiot.find((x) => inParsha(x, pos)); if (p) preloadParshaHaftarot(p);
    }
  }
  function pagerStep(dir) {
    if (!PG) return;
    const bi = ORDER.indexOf(PG.slug);
    if (dir > 0) {
      if (PG.page < PG.pages - 1) { PG.page++; pagerMove(); }
      else if (PG.idx < PG.items.length - 1) pagerShow(PG.idx + 1, 0);
      else if (nbBook(PG.slug, 1)) location.hash = chapterHash(nbBook(PG.slug, 1), 1);               // on into the next sefer
    } else {
      if (PG.page > 0) { PG.page--; pagerMove(); }
      else if (PG.idx > 0) pagerShow(PG.idx - 1, "last", -1);
      else if (nbBook(PG.slug, -1)) { const ps = nbBook(PG.slug, -1), pb = book(ps), lc = pb.verses.length; location.hash = chapterHash(ps, lc, pb.verses[lc - 1]); }
    }
  }
  function pagerGoTo(c, v) {
    if (!PG) return;
    let i = v ? PG.items.findIndex((it) => it.type === "pasuk" && it.c === c && it.v === v)
              : (c === 1 ? 0 : PG.items.findIndex((it) => it.type === "pasuk" && it.c === c));
    if (i < 0) i = PG.firstPasuk;
    closeAllDialogs();
    pagerShow(i, 0);
  }
  function showPhrase(i) {
    if (!PG) return;
    $$("#pgStage .ph.on").forEach((x) => x.classList.remove("on"));
    PG.active = i;
    const src = $(".pg-tx-src"), en = $(".pg-tx-en");
    if (i == null) { src.textContent = ""; en.innerHTML = `<span class="pg-hint">Tap any phrase to see its translation here</span>`; return; }
    const el = $(`#pgStage .ph[data-p="${i}"]`); if (el) el.classList.add("on");
    const ph = PG.phr[i];
    const cu = el && el.closest(".pg-c");
    if (cu) {
      const d = cu.dataset, on = isCommBm(d.cid, d.s, +d.c, +d.v, +d.i);
      src.innerHTML = `${esc(ph.src)} <button type="button" class="tx-bm ${on ? "on" : ""}" data-cbm="${d.cid}:${d.s}:${d.c}:${d.v}:${d.i}" aria-label="Bookmark this comment" title="Bookmark this comment">${iconBookmark}<span>${on ? "Saved" : "Save"}</span></button>`;
    } else src.textContent = ph.src;
    if (ph.html) en.innerHTML = ph.html; else en.textContent = ph.en || "—";
    if (el && el.closest("#pgFlow")) { const pg = pageOf(el); if (pg !== PG.page) { PG.page = pg; pagerMove(); } }
  }
  function phraseStep(dir) {
    if (!PG) return;
    const n = PG.phr.length;
    let i = PG.active == null ? (dir > 0 ? firstPhraseOnPage() : firstPhraseOnPage()) : PG.active + dir;
    if (i >= n) { if (PG.idx < PG.items.length - 1) { pagerShow(PG.idx + 1, 0); showPhrase(0); } return; }
    if (i < 0) { if (PG.idx > 0) { pagerShow(PG.idx - 1, "last", -1); showPhrase(PG.phr.length - 1); } return; }
    showPhrase(i);
  }
  function firstPhraseOnPage() {
    if (PG.page === 0) return 0;
    const els = $$("#pgFlow .ph"); const e = els.find((x) => pageOf(x) === PG.page); return e ? +e.dataset.p : 0;
  }
  function wirePager() {
    const pager = $("#pager"), vp = $(".pg-viewport", pager);
    $$(".pg-btn", pager).forEach((b) => b.addEventListener("click", () => pagerStep(+b.dataset.go)));
    $$(".pg-step", pager).forEach((b) => b.addEventListener("click", () => phraseStep(+b.dataset.step)));
    $("#pgTrans").addEventListener("click", (e) => {
      const b = e.target.closest(".tx-bm"); if (!b) return;
      const [cid, s, c, v, i] = b.dataset.cbm.split(":");
      toggleCommBm(cid, s, +c, +v, +i, b);
      const sp = $("span", b); if (sp) sp.textContent = b.classList.contains("on") ? "Saved" : "Save";
    });
    $("#pgStage").addEventListener("click", (e) => {
      if (PG.swiped) return;
      const bm = e.target.closest(".pg-bm");
      if (bm) { toggleBookmark(bm.dataset.s, +bm.dataset.c, +bm.dataset.v); return; }
      const fv = e.target.closest(".pg-fav");
      if (fv) { toggleFav(fv.dataset.s, +fv.dataset.c, +fv.dataset.v); return; }
      const cp = e.target.closest(".pg-copy");
      if (cp) { const u = $("#pgTop .pg-pasuk.cu"); if (u) copyUnit(u); return; }
      const pk = e.target.closest(".pg-pick");
      if (pk) { togglePick(pk.dataset.s, +pk.dataset.c, +pk.dataset.v); return; }
      const ho = e.target.closest(".haft-opt");
      if (ho) {
        const pid = ho.dataset.pid;
        readerState.haftChoice = readerState.haftChoice || {}; readerState.haftChoice[pid] = ho.dataset.opt;
        buildPagerItems();
        const i = PG.items.findIndex((it) => it.type === "haft" && it.pid === pid);
        const p = INDEX.parshiot.find((x) => x.id === pid); preloadParshaHaftarot(p);
        pagerShow(Math.max(0, i), 0);
        return;
      }
      if (window.getSelection && String(window.getSelection()).length > 1) return;
      const ph = e.target.closest(".ph"); if (ph) showPhrase(+ph.dataset.p);
    });
    // swipe: like turning the pages of a Hebrew book — drag to the right for the next page
    let x0 = null, y0 = 0, dx = 0, horiz = null;
    vp.addEventListener("touchstart", (e) => { if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horiz = null; PG.swiped = false; }, { passive: true });
    vp.addEventListener("touchmove", (e) => {
      if (x0 == null) return;
      const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
      if (horiz == null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) horiz = Math.abs(ddx) > Math.abs(ddy);
      if (!horiz) return;
      if (String(window.getSelection()).length > 1) return;
      e.preventDefault(); dx = ddx;
      const flow = $("#pgFlow"); flow.style.transition = "none";
      flow.style.transform = `translateX(${PG.page * (PG.W + PG_GAP) + dx * 0.9}px)`;
    }, { passive: false });
    vp.addEventListener("touchend", () => {
      if (x0 == null) return;
      x0 = null;
      if (horiz && Math.abs(dx) > 45) { PG.swiped = true; setTimeout(() => PG && (PG.swiped = false), 60); pagerStep(dx > 0 ? 1 : -1); }
      else pagerMove();
    });
    // desktop: wheel / trackpad turn pages too
    let wheelAt = 0;
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY;
      if (Math.abs(d) < 12 || Date.now() - wheelAt < 380) return;
      wheelAt = Date.now(); pagerStep(d > 0 ? 1 : -1);
    }, { passive: false });
  }
  window.addEventListener("resize", () => { if (PG) pagerLayout(true); });
  document.addEventListener("keydown", (e) => {
    if (!PG || /input|textarea|select/i.test(document.activeElement.tagName) || !$$(".overlay").every((o) => o.hidden)) return;
    if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); pagerStep(1); }
    else if (e.key === "ArrowRight" || e.key === "PageUp") { e.preventDefault(); pagerStep(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); phraseStep(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); phraseStep(-1); }
  });

  /* Masoretic sedarim keyed "slug:c:v" → label (e.g. "ג", "א*") */
  const SEDER = new Map();
  function buildSedarim() { for (const [s, b] of Object.entries(INDEX.books)) for (const [c, v, l] of b.sedarim || []) SEDER.set(`${s}:${c}:${v}`, l); }
  /* parasha petucha / setuma at the end of a pasuk (the gaps in a Sefer Torah) */
  const psOf = (html) => { const m = /<span class="mam-spi-(pe|samekh)">[^<]*<\/span>\s*$/.exec(html || ""); return m ? m[1] : null; };

  function rowsHTML(slug, c, from, to, text, r) {
    const b = book(slug), isParsha = r.view === "parsha";
    let rows = "";
    for (let v = from; v <= to; v++) {
      const key = `${slug}:${c}:${v}`;
      const mk = b.section === "torah" ? MARKS.get(key) : null;
      if (mk && mk.parsha && !isParsha) rows += `<div class="marker parsha"><span class="en">Parashat ${esc(mk.parsha.en)} · <a href="#parsha-${mk.parsha.id}">Read the parsha →</a></span><span class="he">פרשת ${esc(mk.parsha.he)}</span></div>`;
      if (settings.sedarim && SEDER.has(key)) {
        const l = SEDER.get(key), star = l.endsWith("*") ? "*" : "";
        rows += `<div class="seder-tag"><span class="en">Seder ${parseGematria(l.replace("*", ""))}${star}</span><span class="he">סדר ${esc(l)}</span></div>`;
      }
      rows += verseRow(slug, c, v, text);
      if (settings.petuchot) {
        const ps = psOf(text.he[c - 1][v - 1]);
        if (ps) rows += `<div class="ps-break ${ps}" title="${ps === "pe" ? "Parasha petucha (open)" : "Parasha setuma (closed)"}"><span class="he">${ps === "pe" ? "פ" : "ס"}</span></div>`;
      }
      if (settings.haftarah && b.section === "torah") {
        // a parsha ends here → its haftarah follows (full in parsha view, a card in the sefer)
        const ending = INDEX.parshiot.find((p) => p.range[0] === slug && p.range[3] === c && p.range[4] === v);
        const full = isParsha || (readerState && readerState.haftFull && readerState.haftFull.has(ending && ending.id));
        if (ending && (!isParsha || ending === r.p)) rows += `<section class="haftarah ${full ? "full" : "card"}" id="haft-${ending.id}" data-p="${ending.id}"></section>`;
      }
    }
    return rows;
  }

  async function renderReader(r) {
    const app = $("#app");
    const slug = r.view === "parsha" ? r.p.range[0] : r.slug, b = book(slug);
    // the page you're on stays as it is until the new one is drawn, in one go — nothing in between is seen
    if (!resolved.has(textUrl(slug))) { leavePages(); setPicker(r); app.innerHTML = `<div class="loading">טוען…</div>`; }
    let text;
    try { text = await loadText(slug); }
    catch (e) {
      leavePages(); setPicker(r);
      app.innerHTML = navigator.onLine === false
        ? `<div class="error-box"><p>${esc(b.he)} · ${esc(b.en)} isn't downloaded, and there's no internet connection.</p><p><a href="#offline">Download sefarim for offline reading</a></p></div>`
        : `<div class="error-box"><p>Couldn't load ${esc(b.en)}.</p><p><a href="">Try again</a></p></div>`;
      return;
    }
    if (current !== r) return;
    readerState = { r, slug, text, sel: null, open: pendingOpen || new Set(), tab: store.get("tab", "rashi"), haftChoice: pendingHaftChoice || {},
      haftFull: pendingHaftFull || new Set(), rowsDirty: true };
    pendingHaftChoice = null; pendingOpen = null; pendingHaftFull = null;
    if (!commMeta(readerState.tab)) readerState.tab = COMMENTARIES[0].id;
    if (r.v && !suppressOpen) readerState.open.add(`${slug}:${r.c}:${r.v}`);
    suppressOpen = false;
    if (r.view === "chapter" && settings.view === "pages") return renderPages(r, text);
    if (r.view === "chapter") return renderSefer(r, text);
    return renderParsha(r, text);
  }
  const haftBooks = (p) => [...new Set(haftRanges(p).map((rg) => rg[0]))];
  /* what a Scroll page needs before it is drawn — its fonts, and the commentary of the open tab (with the word list
     for line by line) — so it is drawn once, complete, and nothing that arrives later changes its size */
  function scrollReady(slugs) {
    const jobs = [loadCommFor([...new Set(slugs)])];
    if (!fontsLoaded("scroll")) jobs.push(fontsReady("scroll"));
    return Promise.all(jobs);
  }

  /* ── parsha view: one parsha across its perakim, its haftarah after it ── */
  async function renderParsha(r, text) {
    const app = $("#app"), st = readerState, slug = r.p.range[0], b = book(slug);
    const hb = settings.haftarah && r.p.haft ? haftBooks(r.p) : [];
    await Promise.all([scrollReady([slug, ...hb]), ...hb.map(loadPlace)]);
    if (readerState !== st || current !== r) return;
    const segs = segmentsFor(r);
    const sec = INDEX.sections.find((s) => s.id === b.section);
    const pr = r.p.range;
    const nb = neighbors(r);
    let rows = "";
    for (const sg of segs) {
      rows += `<div class="chapter-head"><span>פרק ${gematria(sg.c)}</span><small>${esc(b.en)} ${sg.c}</small></div>`;
      rows += rowsHTML(slug, sg.c, sg.from, sg.to, text, r);
    }
    leavePages(); setPicker(r);
    document.title = `Parashat ${r.p.en} — Tanach Reader`;
    app.innerHTML = `
      <div class="reader-wrap">
        <article class="reader">
          <header class="reader-head">
            <div class="crumb"><a href="#">Tanach</a> · ${esc(sec.en)} · <a href="${chapterHash(slug, pr[1])}">${esc(b.en)}</a></div>
            <h1>פרשת ${esc(r.p.he)}</h1>
            <div class="en-title">Parashat ${esc(r.p.en)}</div>
            <div class="meta">${esc(b.en)} ${pr[1]}:${pr[2]} – ${pr[3]}:${pr[4]}</div>
            <div class="reader-tools" id="readerTools"></div>
          </header>
          <div class="verses">${rows}</div>
          <nav class="chapter-nav">
            ${nb.prev ? `<a class="prev" href="${nb.prev.hash}"><span class="k">← Previous</span><span class="v">${esc(nb.prev.en)} · <span class="he">${esc(nb.prev.he)}</span></span></a>` : `<span class="spacer"></span>`}
            ${nb.next ? `<a class="next" href="${nb.next.hash}"><span class="k">Next →</span><span class="v">${esc(nb.next.en)} · <span class="he">${esc(nb.next.he)}</span></span></a>` : `<span class="spacer"></span>`}
          </nav>
        </article>
      </div>`;
    renderReaderTools();
    const verses = $(".verses", app);
    afterInsert([verses]);                 // aliyah headings, the haftarah and Rashi go in with the text, before it is seen
    preloadHaftarot();
    verses.addEventListener("click", onVerseClick);
    win.watch(verses);
    // and the page is put in its place in the same moment
    const target = r.v ? $(`#v-${slug}-${r.c}-${r.v}`) : null;
    if (pendingAnchor) restoreAnchor();
    else if (r.haft) { const h = $(`#haft-${r.p.id}`); if (h) h.scrollIntoView({ block: "start" }); }
    else if (target) { selectVerse(slug, r.c, r.v, { scroll: true }); target.classList.add("flash"); }
    else window.scrollTo(0, 0);
    win.note();
    showPendingComment();
    trackPosition(true);
    preloadForCopy();
  }

  /* ── sefer view: a sefer as one continuous scroll, with a break between perakim. Only the perakim around where
     you're reading are on the page, drawn in full (see win, below) ── */
  function perekHTML(slug, c, text, r) {
    const b = book(slug);
    return `<section class="perek" id="perek-${slug}-${c}" data-c="${c}">
      <div class="chapter-head"><span>פרק ${gematria(c)}</span><small>${esc(b.en)} ${c}</small></div>
      ${rowsHTML(slug, c, 1, b.verses[c - 1], text, r)}
    </section>`;
  }
  async function renderSefer(r, text) {
    const app = $("#app"), st = readerState, slug = r.slug, b = book(slug), n = b.verses.length;
    const hp = pendingHaftOpen && INDEX.parshiot.find((x) => x.id === pendingHaftOpen); pendingHaftOpen = null;
    if (hp && settings.haftarah) st.haftFull.add(hp.id);
    const a0 = pendingAnchor;
    // the haftarah being opened (or that you're reading in) is loaded with everything else, before anything is drawn
    const hb = [...new Set([...(hp && settings.haftarah ? haftBooks(hp) : []), ...(a0 && a0.s !== slug ? [a0.s] : [])])];
    await Promise.all([scrollReady([slug, ...hb]), ...hb.map(loadPlace)]);
    if (readerState !== st || current !== r) return;
    const sec = INDEX.sections.find((s) => s.id === b.section);
    const prevB = nbBook(slug, -1), nextB = nbBook(slug, 1);
    const total = b.verses.reduce((x, y) => x + y, 0);
    leavePages(); setPicker(r);
    document.title = `${b.en} — Tanach Reader`;
    app.innerHTML = `
      <div class="reader-wrap">
        <article class="reader sefer-reader">
          <header class="reader-head">
            <div class="crumb"><a href="#">Tanach</a> · ${esc(sec.en)}</div>
            <h1>${esc(b.he)}</h1>
            <div class="en-title">${esc(b.en)}</div>
            <div class="meta">${n} perakim · ${total} pesukim</div>
            <div class="reader-tools" id="readerTools"></div>
          </header>
          <div class="verses sefer" id="seferBody"></div>
          <nav class="chapter-nav">
            ${prevB ? `<a class="prev" href="${chapterHash(prevB, book(prevB).verses.length)}"><span class="k">← Previous sefer</span><span class="v">${esc(book(prevB).en)} · <span class="he">${esc(book(prevB).he)}</span></span></a>` : `<span class="spacer"></span>`}
            ${nextB ? `<a class="next" href="${chapterHash(nextB, 1)}"><span class="k">Next sefer →</span><span class="v">${esc(book(nextB).en)} · <span class="he">${esc(book(nextB).he)}</span></span></a>` : `<span class="spacer"></span>`}
          </nav>
        </article>
      </div>`;
    const body = $("#seferBody");
    body.addEventListener("click", onVerseClick);
    renderReaderTools();
    const a = pendingAnchor; pendingAnchor = null;
    const c0 = a && a.s === slug && a.c >= 1 && a.c <= n ? a.c : Math.min(Math.max(1, r.c || 1), n);
    st.win = true;
    win.rebuildAt(c0);
    win.watch(body);
    // What will be on the screen is drawn (with what's below it), the page is put in its place, then the perakim
    // above are added with the page kept exactly where it is — all in this one moment, before the screen is drawn,
    // so the sefer is first seen where it belongs, complete: the pasuk asked for, the place being kept (coming back
    // to the site, switching from Pages, a setting), or the haftarah being opened
    const row = a && $(`#v-${a.s}-${a.c}-${a.v}`), card = !row && hp && $(`#haft-${hp.id}`);
    const target = !row && !card && r.v ? $(`#v-${slug}-${r.c}-${r.v}`) : null;
    const el = row || card || target || $(`#perek-${slug}-${c0}`);
    win.below(el.getBoundingClientRect().top);
    if (row) window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - a.top);
    else if (card) card.scrollIntoView({ block: "start" });
    else if (target) { selectVerse(slug, r.c, r.v, { scroll: true }); target.classList.add("flash"); }
    else if (c0 > 1) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
    win.above();
    if (restoreSel) { const q = restoreSel; restoreSel = null; markSelected(q.s, q.c, q.v); }
    win.note();
    showPendingComment();
    trackPosition(true);
    preloadForCopy();
    preloadPagesData(slug);
  }
  /* while reading in Scroll, quietly fetch what Pages needs for this sefer, so switching never waits:
     soon after the sefer opens, one file at a time in idle moments — the Hebrew of each commentary first
     (what a page shows), then the English and the introductions */
  const idle = (fn, timeout = 1500) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 60));
  function preloadPagesData(slug) {
    const c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return;
    setTimeout(() => {
      if (!readerState || readerState.slug !== slug) return;
      fontsReady("pages");
      const comms = pgComms(slug);
      const jobs = [() => loadLex(), ...comms.map((cm) => () => loadComm(cm.id, slug)),
        ...comms.filter((cm) => cm.enDir).map((cm) => () => loadCommEn(cm.id, slug)),
        ...comms.filter((cm) => cm.introDir && INDEX.intros && (INDEX.intros[cm.id] || []).includes(slug)).map((cm) => () => fetchJSON(cm.introDir + slug + ".json"))];
      const next = () => {
        if (!jobs.length || !readerState || readerState.slug !== slug) { warmTop(); return; }
        const job = jobs.shift();
        idle(() => Promise.resolve(job()).catch(() => {}).then(next));
      };
      next();
    }, 700);
  }
  /* the phrase matching of a pasuk's commentaries, done before it is needed (it is remembered) */
  let warmKey = "";
  function warmPasuk(s, c, v) {
    if (!LEX || !s || !c || !v) return false;
    const comms = pgComms(s);
    if (!comms.every((cm) => resolved.has(commUrl(cm.id, s)) && (!cm.enDir || resolved.has(commEnUrl(cm.id, s))))) return false;
    try { commentaryBody(s, c, v, []); } catch { return false; }
    return true;
  }
  function warmTop() {
    const st = readerState; if (!st || settings.view === "pages") return;
    const row = (st.sel && $(`#v-${st.sel.s}-${st.sel.c}-${st.sel.v}`)) || topRow(); if (!row) return;
    const k = `${row.dataset.s}:${row.dataset.c}:${row.dataset.v}`;
    if (k === warmKey) return;
    idle(() => { if (warmPasuk(row.dataset.s, +row.dataset.c, +row.dataset.v)) warmKey = k; }, 3000);   // remembered only once done
  }
  /* a part just added to the page (a perek, or a parsha's pesukim) gets its aliyah headings, its haftarah and its
     Rashi in the same moment, so it goes in at its full size and never changes size after */
  function afterInsert(sections) {
    const st = readerState; if (!st) return;
    st.rowsDirty = true;
    for (const sec of sections) {
      paintAliyot(sec);
      $$(".haftarah", sec).forEach((el) => fillHaftarah(el, el.classList.contains("full")));
      paintRows($$(":scope > .verse", sec));
      if (st.sel) { const row = $(`#v-${st.sel.s}-${st.sel.c}-${st.sel.v}`, sec); if (row) row.classList.add("selected"); }
    }
  }
  let lastScrollAt = 0, touching = false;
  let selfScrollAt = 0;   // our own position corrections are not the reader scrolling
  window.addEventListener("scroll", () => { if (Date.now() - selfScrollAt > 120) lastScrollAt = Date.now(); }, { passive: true });
  window.addEventListener("touchstart", () => { touching = true; }, { passive: true });
  window.addEventListener("touchend", () => { touching = false; lastScrollAt = Date.now(); }, { passive: true });

  /* ── Scroll: keeping your place ──
     A sefer is not put on the page whole. Only the perakim around where you're reading are there — a few screens
     above and below — and they are drawn in full: no part of the page is skipped by the browser or held at a
     guessed size, so nothing on it ever changes size by itself.
       • As you read on, the next perakim are added below (that never moves what you see).
       • When you're near the top of what's there and not scrolling, the perakim before are added above, and the
         page is moved by exactly their height in the same moment — before the screen is drawn again.
       • Perakim far from you are let go in quiet moments (the page stays light; the same way, in reverse).
       • Anything else that changes size above you — a setting, Rashi opened or closed, a font arriving, the
         iPad turned — is put right in the same moment too (keep), or, if it came by itself, before the frame it
         happened in is drawn (a ResizeObserver: hold).
     The browser's own scroll anchoring is off (overflow-anchor: none in styles.css): one thing keeps your place, so
     it is never done twice, and the first frame drawn after any change is the final one. */
  const win = (() => {
    const AHEAD = 3.5, BEHIND = 3.5, FAR = 10, KEEP = 5;     // screens
    const sefer = () => { const st = readerState; return st && st.win && !PG ? $("#seferBody") : null; };
    /* the anchor: the pasuk at the reading line — or, if you're reading in its Rashi, the comment there */
    function anchorAt() {
      if (!readerState || PG || !$(".reader")) return null;
      const row = topRow(); if (!row) return null;
      const L = topLine() + 6;
      let el = row;
      const dd = row.querySelector(".rdrop"), he = row.querySelector(".v-he"), en = row.querySelector(".v-en");
      const textEnd = Math.max(he ? he.getBoundingClientRect().bottom : 0, en ? en.getBoundingClientRect().bottom : 0);
      if (dd && textEnd < L) { for (const rr of dd.querySelectorAll(".rrow")) if (rr.getBoundingClientRect().bottom > L) { el = rr; break; } }
      return { el, row, top: el.getBoundingClientRect().top, rowTop: row.getBoundingClientRect().top, ri: el === row ? null : el.dataset.i };
    }
    function scrollFix(d) { if (!(Math.abs(d) >= .5)) return; selfScrollAt = Date.now(); window.scrollTo(0, window.scrollY + d); }
    /* put the page back so the anchor is where it was on the screen */
    function restore(a, pasuk) {
      if (a) {
        let el = a.el.isConnected ? a.el : null, top = a.top;
        if (!el && a.ri != null && a.row.isConnected) { el = a.row.querySelector(`.rrow[data-i="${a.ri}"]`); }
        if (el) scrollFix(el.getBoundingClientRect().top - top);
        else if (a.row.isConnected) scrollFix(a.row.getBoundingClientRect().top - a.rowTop);
        // the pasuk you were on gone up above the screen (its Rashi, which you were in, closed): back to the top
        if (pasuk && a.row.isConnected && (!el || el === a.row)) {
          const he = a.row.querySelector(".v-he"), L = topLine();
          if (he && he.getBoundingClientRect().bottom < L + 4) scrollFix(a.row.getBoundingClientRect().top - (L + 2));
        }
      }
      if (readerState) readerState.rowsDirty = true;
      note();
    }
    /* change something above you, keeping your place: done and put right in the same moment */
    function keep(fn, pasuk) { const a = anchorAt(); fn(); restore(a, pasuk); }
    /* where the anchor is in the page — so a change of size that comes by itself can be made up for */
    let anc = null;
    function note() { const a = anchorAt(); anc = a ? { el: a.el, doc: a.top + window.scrollY } : null; }
    function hold() {
      if (!anc || !anc.el.isConnected || PG) { note(); return; }
      const doc = anc.el.getBoundingClientRect().top + window.scrollY, d = doc - anc.doc;
      anc.doc = doc;
      scrollFix(d);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(() => hold()) : null;
    let watched = null;
    function watch(el) { if (!ro) return; if (watched) ro.unobserve(watched); watched = el; ro.observe(el); }
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => hold());

    /* perakim in and out */
    function ins(b, where, c) {
      const st = readerState, tpl = document.createElement("template");
      tpl.innerHTML = perekHTML(st.slug, c, st.text, st.r);
      const secs = [...tpl.content.children];
      if (where === "after") b.append(tpl.content); else b.prepend(tpl.content);
      afterInsert(secs);
    }
    function rebuildAt(c) {
      const b = sefer(), st = readerState; if (!b) return;
      st.lo = st.hi = c; b.textContent = ""; ins(b, "after", c);
    }
    /* below: enough to read on for a few screens from `from` (a point on the screen; by default its top) */
    function below(from = 0) {
      const b = sefer(), st = readerState; if (!b) return;
      const n = book(st.slug).verses.length, want = from + (AHEAD + 1) * innerHeight;
      let k = 0;
      while (st.hi < n && k++ < 16 && b.getBoundingClientRect().bottom < want) { st.hi++; ins(b, "after", st.hi); }
    }
    /* above: a few screens to scroll back into, added with the page kept where it is */
    function above() {
      const b = sefer(), st = readerState; if (!b || st.lo <= 1) return;
      const have = topLine() - b.getBoundingClientRect().top, H = innerHeight;
      if (have >= BEHIND * H) return;
      keep(() => {
        const h0 = b.offsetHeight; let k = 0;
        while (st.lo > 1 && k++ < 16 && have + (b.offsetHeight - h0) < BEHIND * H) { st.lo--; ins(b, "before", st.lo); }
      });
    }
    /* far away: let go (below freely; above with the page kept where it is) */
    function trim() {
      const b = sefer(), st = readerState; if (!b) return;
      const H = innerHeight;
      let extra = b.getBoundingClientRect().bottom - H;
      if (extra > FAR * H) {
        while (b.children.length > 2) {
          const P = b.lastElementChild, h = P.getBoundingClientRect().height;
          if (extra - h < KEEP * H) break;
          P.remove(); st.hi--; extra -= h; st.rowsDirty = true;
        }
      }
      const have = topLine() - b.getBoundingClientRect().top;
      if (have > FAR * H) keep(() => {
        let left = have;
        while (b.children.length > 2) {
          const P = b.firstElementChild, h = P.getBoundingClientRect().height;
          if (left - h < KEEP * H) break;
          P.remove(); st.lo++; left -= h;
        }
      });
    }
    /* a perek that may be far from here: the window is made around it if it isn't on the page; returns el() */
    function bring(c, el) {
      const st = readerState; if (!sefer()) return null;
      if (c < st.lo || c > st.hi) rebuildAt(c);
      const e = el(); if (e) below(e.getBoundingClientRect().top);
      return e;
    }
    /* quiet moments: the perakim above are added, far ones let go */
    let settleT = 0;
    function settle() {
      clearTimeout(settleT);
      settleT = setTimeout(() => {
        if (!sefer()) return;
        if (touching || Date.now() - lastScrollAt < 200) { settle(); return; }
        idle(() => {
          if (!sefer()) return;
          if (touching || Date.now() - lastScrollAt < 200) { settle(); return; }
          below(); above(); trim();
        }, 400);
      }, 220);
    }
    window.addEventListener("scroll", () => {
      const b = sefer();
      if (b) {
        const r = b.getBoundingClientRect();
        if (r.bottom < innerHeight * 1.6) below();                                   // nearly at the end of what's here
        if (!touching && readerState.lo > 1 && topLine() - r.top < innerHeight * .6) above();   // nearly at its top
        settle();
      }
      note();
    }, { passive: true });
    window.addEventListener("touchend", () => { if (sefer()) settle(); }, { passive: true });
    return { sefer, anchorAt, restore, keep, note, hold, watch, rebuildAt, below, above, trim, bring };
  })();
  /* opening a pasuk or a perek in the sefer you're reading */
  function jumpWithinSefer(c, v) {
    const st = readerState;
    const el = win.bring(c, () => (v ? $(`#v-${st.slug}-${c}-${v}`) : $(`#perek-${st.slug}-${c}`)));
    if (!el) return;
    if (v) {
      st.open.add(`${st.slug}:${c}:${v}`); paintRow(el);
      selectVerse(st.slug, c, v, { scroll: true });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    } else {
      el.scrollIntoView({ block: "start" });
      history.replaceState(null, "", chapterHash(st.slug, c));
    }
    win.above(); win.note();
    trackPosition(true);
  }

  /* the reading line: just below the top bar (and the copy bar) */
  function topLine() { return $(".topbar").getBoundingClientRect().bottom + ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight) + 8; }
  /* where the reader is: the first pasuk under the top bar (binary search) */
  function topRow() {
    const st = readerState; if (!st) return null;
    if (!st.rows || st.rowsDirty) { st.rows = $$(".reader .verse"); st.rowsDirty = false; }
    const rows = st.rows; if (!rows.length) return null;
    const top = topLine();
    const sb = st.r.view === "chapter" && $("#seferBody");
    if (sb && sb.children.length > 1) {
      // a whole sefer: find the perek at the line first, then the pasuk in it
      const ps = sb.children;
      let lo = 0, hi = ps.length - 1, k = ps.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (ps[mid].getBoundingClientRect().bottom > top + 14) { k = mid; hi = mid - 1; } else lo = mid + 1; }
      for (; k < ps.length; k++) {
        const rs = ps[k].querySelectorAll(".verse"); if (!rs.length) continue;
        let a = 0, b = rs.length - 1, ans = -1;
        while (a <= b) { const mid = (a + b) >> 1; if (rs[mid].getBoundingClientRect().bottom > top + 14) { ans = mid; b = mid - 1; } else a = mid + 1; }
        if (ans >= 0) return rs[ans];
      }
      return rows[rows.length - 1];
    }
    let lo = 0, hi = rows.length - 1, ans = rows.length - 1;
    // the first row with a real part of it below the bar (a sliver of the previous one doesn't count)
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].getBoundingClientRect().bottom > top + 14) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return rows[ans];
  }
  function trackPosition(force) {
    const st = readerState; if (!st) return;
    // the top bar follows you — not the page's own corrections of its place (only a scroll of yours, or a jump,
    // can change what it shows)
    if (!force && st.trackedAt && lastScrollAt <= st.trackedAt) return;
    st.trackedAt = Date.now();
    const row = topRow(); if (!row) return;
    const hs = row.closest(".haftarah");
    const pos = { s: row.dataset.s, c: +row.dataset.c, v: +row.dataset.v, haft: !!hs };
    if (hs) pos.pid = hs.dataset.p;
    st.lastPos = pos; saveLast(pos); updateAliyahBtn(pos);
    savePlace(row);
    warmTop();
    if (st.r.view === "chapter" && !pos.haft && (force || pos.c !== st.curC)) {
      st.curC = pos.c; current.c = pos.c;
      setPicker({ view: "chapter", slug: st.slug, c: pos.c });
      if (!st.sel || st.sel.c !== pos.c) history.replaceState(null, "", chapterHash(st.slug, pos.c));
      // get this parsha's haftarah (text + Rashi) ready before its card is reached
      if (settings.haftarah && book(st.slug).section === "torah") {
        const p = INDEX.parshiot.find((x) => inParsha(x, pos)); if (p) preloadParshaHaftarot(p);
      }
    }
  }
  /* after a re-render (settings change), put the same pasuk back at the same height on screen */
  let pendingAnchor = null, pendingOpen = null, pendingHaftOpen = null, pendingHaftFull = null, restoreSel = null;
  function restoreAnchor() {
    const a = pendingAnchor; pendingAnchor = null;
    const row = a && $(`#v-${a.s}-${a.c}-${a.v}`);
    if (row) window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - a.top);
    win.note();
    if (restoreSel) { const r = restoreSel; restoreSel = null; markSelected(r.s, r.c, r.v); }
  }
  let suppressOpen = false;
  let pendingHaftChoice = null;

  /* ───── Haftarah ─────
     Every parsha has its regular haftarah plus, where the calendar can replace it, irregular ones
     (Rosh Chodesh, Machar Chodesh, Chanukah, the four parshiot, HaGadol, Shuva, after 17 Tammuz, joined parshiot). */
  const haftOptions = (p) => [{ id: "reg", en: "Regular", he: "רגילה", a: p.haft.a, s: p.haft.s }, ...(p.haftSpec || [])];
  const haftChoice = (p) => (readerState && readerState.haftChoice && readerState.haftChoice[p.id]) || "reg";
  function haftRanges(p, optId) {
    const o = haftOptions(p).find((x) => x.id === (optId || haftChoice(p))) || haftOptions(p)[0];
    return (settings.haftCustom === "s" && o.s) || o.a || [];
  }
  const rangeEn = ([s, c1, v1, c2, v2]) => `${book(s).en} ${c1}:${v1}${c2 !== c1 ? `–${c2}:${v2}` : v2 !== v1 ? `–${v2}` : ""}`;
  const rangeHe = ([s, c1, v1, c2, v2]) => `${book(s).he} ${plainGem(c1)}:${plainGem(v1)}${c2 !== c1 ? `–${plainGem(c2)}:${plainGem(v2)}` : v2 !== v1 ? `–${plainGem(v2)}` : ""}`;

  /* load the text, Rashi and English Rashi of a sefer (the haftarah's "place") */
  function loadPlace(s) {
    const jobs = [loadText(s)];
    for (const c of activeComms(s)) { jobs.push(loadComm(c.id, s)); if (c.enDir) jobs.push(loadCommEn(c.id, s)); }
    return Promise.allSettled(jobs);
  }
  /* preload every haftarah option of a parsha in the background, so opening or switching is instant */
  function preloadParshaHaftarot(p, done = new Set()) {
    if (!p || !p.haft) return;
    const opts = haftOptions(p);
    const cur = opts.find((o) => o.id === haftChoice(p)) || opts[0];
    for (const o of [cur, ...opts.filter((x) => x !== cur)]) for (const rg of (settings.haftCustom === "s" && o.s) || o.a || []) {
      if (!done.has(rg[0])) { done.add(rg[0]); loadPlace(rg[0]); }
    }
  }
  function preloadHaftarot() {
    const done = new Set();
    for (const el of $$(".reader .haftarah")) preloadParshaHaftarot(INDEX.parshiot.find((x) => x.id === el.dataset.p), done);
  }
  /* preload everything a reader page will need (text, Rashi, English Rashi, its haftarot) */
  function preloadPlaceFor(s, c, v, pid) {
    loadPlace(s);
    if (!settings.haftarah || book(s).section !== "torah") return;
    const pos = { s, c, v };
    const ps = pid ? INDEX.parshiot.filter((p) => p.id === pid)
                   : INDEX.parshiot.filter((p) => p.range[0] === s && (inParsha(p, pos) || p.range[3] === c));
    const done = new Set([s]);
    ps.forEach((p) => preloadParshaHaftarot(p, done));
  }

  function fillHaftarah(el, expanded) {
    const p = INDEX.parshiot.find((x) => x.id === el.dataset.p); if (!p) return Promise.resolve();
    const opts = haftOptions(p), choice = haftChoice(p), opt = opts.find((o) => o.id === choice) || opts[0];
    const ranges = haftRanges(p);
    const sefard = settings.haftCustom === "s" && opt.s;
    const links = ranges.map((rg) => `<a href="${chapterHash(rg[0], rg[1], rg[2])}" title="Open in ${esc(book(rg[0]).en)}"><span>${esc(rangeEn(rg))}</span> · <span class="he">${esc(rangeHe(rg))}</span> ↗</a>`).join(`<span class="plus">+</span>`);
    const chips = opts.length > 1 ? `<div class="haft-opts" role="group" aria-label="Which haftarah">${opts.map((o) =>
      `<button type="button" class="haft-opt ${o.id === choice ? "on" : ""}" data-opt="${o.id}" title="${esc(o.en)}"><span class="he">${esc(o.he)}</span><small>${esc(o.en)}</small></button>`).join("")}</div>` : "";
    const head = `<div class="haft-head">
        <div class="haft-title"><span class="en">Haftarah · ${esc(p.en)}${opt.id !== "reg" ? ` · ${esc(opt.en)}` : ""}${sefard ? " (Sephardi)" : ""}</span><span class="he">הפטרת ${esc(p.he)}${opt.id !== "reg" ? ` · ${esc(opt.he)}` : ""}</span></div>
        ${chips}
        <div class="haft-src">${links}</div>
      </div>`;
    const wire = () => $$(".haft-opt", el).forEach((b) => b.addEventListener("click", () => {
      readerState.haftChoice = readerState.haftChoice || {};
      readerState.haftChoice[p.id] = b.dataset.opt;
      fillHaftarah(el, el.classList.contains("full"));
      renderAliyahMenu && $("#aliyahOverlay").hidden === false && renderAliyahMenu();
    }));
    if (!expanded) {
      el.innerHTML = head + `<button type="button" class="haft-open">Show the haftarah here</button>`;
      wire();
      $(".haft-open", el).addEventListener("click", () => {
        if (readerState) readerState.haftFull.add(p.id);
        el.classList.add("full"); el.classList.remove("card"); fillHaftarah(el, true);
      });
      return Promise.resolve();
    }
    const books = [...new Set(ranges.map((rg) => rg[0]))];
    const draw = () => {
      const texts = {};
      for (const s of books) texts[s] = resolved.get(textUrl(s));
      if (books.some((s) => !texts[s])) { el.innerHTML = head + `<p class="empty">Couldn't load the haftarah.</p>`; wire(); return; }
      let rows = "";
      ranges.forEach((rg, k) => {
        const [s, c1, v1, c2, v2] = rg;
        if (k > 0) rows += `<div class="haft-gap"><span>${esc(rangeEn(rg))}</span><span class="he">${esc(rangeHe(rg))}</span></div>`;
        for (let c = c1; c <= c2; c++) {
          const from = c === c1 ? v1 : 1, to = c === c2 ? v2 : book(s).verses[c - 1];
          for (let v = from; v <= to; v++) rows += verseRow(s, c, v, texts[s]);
        }
      });
      el.innerHTML = head + `<div class="verses haft-verses">${rows}</div>`;
      wire();
      paintRows($$(".verse", el));          // clicks bubble up to the reader's .verses listener
      if (readerState) readerState.rowsDirty = true;
    };
    // with its text and Rashi in memory it is drawn in the same moment; otherwise when they're loaded, all at once
    if (books.every((s) => resolved.has(textUrl(s))) && commSync(books)) { draw(); return Promise.resolve(); }
    el.innerHTML = head + `<div class="loading" style="padding:20px 0;font-size:1rem">טוען…</div>`; wire();
    const st = readerState;
    return Promise.all(books.map(loadPlace)).then(() => loadCommFor(books)).then(() => { if (el.isConnected && readerState === st) win.keep(draw); });
  }
  function rerenderKeepingPlace() {
    if (!readerState || !current) return Promise.resolve();
    const st = readerState, pos = st.lastPos;
    const row = pos && $(`#v-${pos.s}-${pos.c}-${pos.v}`);
    pendingAnchor = row ? { s: pos.s, c: pos.c, v: pos.v, top: row.getBoundingClientRect().top } : null;
    pendingHaftChoice = st.haftChoice; pendingOpen = new Set(st.open); pendingHaftFull = new Set(st.haftFull || []);
    if (PG && pos) {
      pendingAnchor = null;
      const it = PG.items[PG.idx];
      current = Object.assign({}, current, { c: pos.c, v: pos.v, pgParsha: null,
        pgIntro: it && it.type === "intro" ? { key: it.key, parsha: it.parsha } : null,
        pgHaft: it && it.type === "haft" ? it.pid : null, pgHaftAt: it && it.type === "haft" ? { s: it.s, c: it.c, v: it.v } : null });
      return renderReader(current);
    }
    if (current.view === "chapter" && pos && pos.s === current.slug) current = Object.assign({}, current, { c: pos.c, v: null });
    return renderReader(current);
  }

  /* ───── Aliyah breaks ───── */
  function paintAliyot(root) {
    root = root || $(".reader"); if (!root) return;
    $$(".aliyah-tag", root).forEach((el) => el.remove());
    if (!readerState) return;
    const chapterView = readerState.r.view === "chapter";
    for (const p of relevantParshiot()) {
      for (const st of aliyahStops(p)) {
        const row = root.querySelector(`#v-${st.slug}-${st.c}-${st.v}`); if (!row) continue;
        const sub = st.kind === "w" ? ` <small>Mon/Thu</small>` : "";
        const subHe = st.kind === "w" ? ` <small>קריאת חול</small>` : "";
        row.insertAdjacentHTML("beforebegin", `<div class="aliyah-tag k-${st.kind}" id="al-${p.id}-${st.kind}-${st.n}">
          <span class="en">${esc(st.en)}${sub}${chapterView ? ` · ${esc(p.en)}` : ""}</span>
          <span class="he">${esc(st.he)}${subHe}${chapterView ? ` · ${esc(p.he)}` : ""}</span></div>`);
      }
    }
  }
  function currentStop(pos) {
    for (const p of relevantParshiot()) {
      if (!inParsha(p, pos)) continue;
      let cur = null;
      for (const st of aliyahStops(p)) if (cmpPos(st, pos) <= 0) cur = st;
      return cur || { p, he: "", en: "" };
    }
    return null;
  }
  function updateAliyahBtn(pos) {
    const btn = $("#aliyahBtn"); if (!btn) return;
    const isTorah = readerState && book(readerState.slug).section === "torah";
    if (btn.hidden !== !isTorah) btn.hidden = !isTorah;
    if (!isTorah) { $("#topParsha").hidden = true; document.body.classList.remove("has-parsha"); return; }
    const lbl = $("#aliyahLabel");
    const st = pos && !pos.haft ? currentStop(pos) : null;
    const p = pos && pos.pid ? INDEX.parshiot.find((x) => x.id === pos.pid) : st ? st.p : null;
    const al = pos && pos.haft ? "הפטרה" : st && st.he ? st.he : "עליה";
    // only what changed is written: the bar is not redrawn on every scroll
    if (lbl.textContent !== al) lbl.textContent = al;
    // the parsha you're in gets its own label on the top bar — in Pages, and in Scroll too where the bar has room
    // (tablets and wider), so the bar is the same in both layouts and doesn't change when you switch
    const wide = !window.matchMedia || matchMedia("(min-width: 561px)").matches;
    const tp = $("#topParsha"), showP = !!(p && (PG || wide));
    if (tp.hidden !== !showP) tp.hidden = !showP;
    if (showP && tp.textContent !== `פרשת ${p.he}`) tp.textContent = `פרשת ${p.he}`;
    if (document.body.classList.contains("has-parsha") !== showP) document.body.classList.toggle("has-parsha", showP);
    const title = p ? `${pos && pos.haft ? "Haftarah" : st && st.en ? st.en : ""} · Parashat ${p.en} — jump to an aliyah` : "Jump to an aliyah";
    if (btn.title !== title) btn.title = title;
  }
  function openAliyahMenu() {
    renderAliyahMenu();
    openDialog("#aliyahOverlay");
  }
  function renderAliyahMenu() {
    const pos = readerState && readerState.lastPos;
    const cur = pos ? currentStop(pos) : null;
    const tog = (key, label) => `<label class="toggle"><span>${label}</span><input type="checkbox" data-key="${key}" ${settings[key] ? "checked" : ""}></label>`;
    const lists = menuParshiot().map((p) => `
      <div class="al-group">
        <div class="col-head"><span class="en">Parashat ${esc(p.en)}${settings.weekday ? " · weekday" : ""}</span><span class="he">פרשת ${esc(p.he)}</span></div>
        ${aliyahStops(p).map((st) => `<button type="button" class="lrow al-item ${cur && cur.p === p && cur.kind === st.kind && cur.n === st.n ? "current" : ""}" data-p="${p.id}" data-kind="${st.kind}" data-n="${st.n}">
            <span class="en">${esc(st.en)} <small>${st.c}:${st.v}</small></span><span class="he">${esc(st.he)} <small>${plainGem(st.c)}:${plainGem(st.v)}</small></span></button>`).join("")}
        ${settings.haftarah && p.haft ? (() => { const hr = haftRanges(p); const o = haftOptions(p).find((x) => x.id === haftChoice(p)); return `<button type="button" class="lrow al-item al-haft ${pos && pos.haft ? "current" : ""}" data-haft="${p.id}"><span class="en">Haftarah${o && o.id !== "reg" ? ` · ${esc(o.en)}` : ""} <small>${esc(hr.map(rangeEn).join(" + "))}</small></span><span class="he">הפטרה${o && o.id !== "reg" ? ` · ${esc(o.he)}` : ""}</span></button>`; })() : ""}
      </div>`).join("");
    $("#aliyahBody").innerHTML = `
      <div class="al-toggles">
        ${tog("weekday", "Weekday reading (Mon/Thu)")}
        ${tog("maftir", "Maftir")}
        ${tog("haftarah", "Haftarah")}
      </div>
      <div class="al-lists">${lists || `<p class="empty">Aliyot are only in the Torah.</p>`}</div>`;
    $$("#aliyahBody input[type=checkbox]").forEach((i) => i.addEventListener("change", () => {
      settings[i.dataset.key] = i.checked; saveSettings();
      if (i.dataset.key === "haftarah") {
        if (PG) { const cur = PG.items[PG.idx]; buildPagerItems(); let k = PG.items.indexOf(cur); if (k < 0) k = PG.items.findIndex((it) => it.type === "pasuk" && cur && it.c === (cur.type === "haft" ? 0 : cur.c) && it.v === cur.v); pagerShow(Math.max(0, k), 0); renderAliyahMenu(); return; }
        rerenderKeepingPlace().then(renderAliyahMenu); return;
      }
      paintAliyot(); updateAliyahBtn(readerState && readerState.lastPos); renderAliyahMenu();
    }));
    $$("#aliyahBody .al-haft").forEach((b) => b.addEventListener("click", () => {
      closeAllDialogs();
      if (PG) { const i = PG.items.findIndex((it) => it.type === "haft" && it.pid === b.dataset.haft); if (i >= 0) { pagerShow(i, 0); return; } }
      const el = $(`#haft-${b.dataset.haft}`);
      if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
      const hp = INDEX.parshiot.find((x) => x.id === b.dataset.haft);
      if (hp && win.sefer() && hp.range[0] === readerState.slug) {
        const card = win.bring(hp.range[3], () => $(`#haft-${hp.id}`));
        if (card) { card.scrollIntoView({ block: "start" }); win.above(); win.note(); trackPosition(true); return; }
      }
      location.hash = `#parsha-${b.dataset.haft}-haftarah`;
    }));
    $$("#aliyahBody .al-item:not(.al-haft)").forEach((b) => b.addEventListener("click", () => {
      const p = INDEX.parshiot.find((x) => x.id === b.dataset.p);
      const st = aliyahStops(p).find((x) => x.kind === b.dataset.kind && x.n === +b.dataset.n);
      closeAllDialogs(); jumpToStop(st);
    }));
  }
  function jumpToStop(st) {
    const tag = $(`#al-${st.p.id}-${st.kind}-${st.n}`);
    const row = $(`#v-${st.slug}-${st.c}-${st.v}`);
    if (tag && row) {
      const y = tag.getBoundingClientRect().top + window.scrollY - $(".topbar").offsetHeight - ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight) - 8;
      window.scrollTo({ top: y, behavior: "smooth" });
      row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
      return;
    }
    const r = readerState && readerState.r;
    if (PG && PG.slug === st.slug) { pagerGoTo(st.c, st.v); return; }
    if (r && r.view === "chapter" && r.slug === st.slug && win.sefer()) {
      const t2 = win.bring(st.c, () => $(`#al-${st.p.id}-${st.kind}-${st.n}`));
      if (t2) { t2.scrollIntoView({ block: "start" }); win.above(); win.note(); trackPosition(true); }
      return;
    }
    suppressOpen = true;
    location.hash = r && r.view === "parsha" ? `#parsha-${st.p.id}-${st.c}-${st.v}` : chapterHash(st.slug, st.c, st.v);
  }

  /* where you are on the screen, kept for this tab: if Safari reloads the page when you come back to it,
     you're put back on the same pasuk at the same height */
  function savePlace(row) {
    try {
      if (!row) { sessionStorage.removeItem("tanach:place"); return; }
      const top = Math.round(row.getBoundingClientRect().top);
      sessionStorage.setItem("tanach:place", JSON.stringify({ hash: location.hash, view: settings.view, s: row.dataset.s, c: +row.dataset.c, v: +row.dataset.v, top, sel: readerState && readerState.sel, t: Date.now() }));
    } catch {}
  }
  function takePlace() {
    try {
      const p = JSON.parse(sessionStorage.getItem("tanach:place") || "null");
      if (!p || p.view !== settings.view || p.view !== "scroll" || p.hash !== location.hash) return null;
      return p;
    } catch { return null; }
  }
  const savePlaceNow = () => { if (readerState && settings.view === "scroll" && !PG) { const r = topRow(); if (r) savePlace(r); } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") savePlaceNow(); });
  window.addEventListener("pagehide", savePlaceNow);

  /* remember the pasuk at the top of the screen for "Continue reading" */
  function saveLast(pos) {
    if (!readerState || !pos) return;
    const r = readerState.r;
    const rec = { s: pos.s, c: pos.c, v: pos.v };
    if (r.view === "parsha" && pos.s === r.p.range[0]) Object.assign(rec, { pid: r.p.id, pen: r.p.en, phe: r.p.he, hash: `#parsha-${r.p.id}-${pos.c}-${pos.v}` });
    else rec.hash = chapterHash(pos.s, pos.c, pos.v);
    store.set("last", rec);
  }
  let scrollTimer = null;
  window.addEventListener("scroll", () => {
    if (!readerState || scrollTimer) return;
    scrollTimer = setTimeout(() => { scrollTimer = null; trackPosition(false); }, 200);
  }, { passive: true });

  function parshaOfChapter(slug, c) {
    if (book(slug).section !== "torah") return "";
    const ps = INDEX.parshiot.filter((p) => { const [, c1, , c2] = p.range; return p.range[0] === slug && c >= c1 && c <= c2; });
    return ps.length ? " · " + ps.map((p) => `<a href="#parsha-${p.id}">פרשת ${esc(p.he)}</a>`).join(" · ") : "";
  }

  function verseRow(slug, c, v, text) {
    const he = heText(text.he[c - 1][v - 1] || "");
    const en = text.en[c - 1][v - 1] || "";
    const on = isBookmarked(slug, c, v), fv = isFav(slug, c, v);
    return `<div class="verse cu${picks.has(pickKey(slug, c, v)) ? " picked" : ""}" data-kind="verse" id="v-${slug}-${c}-${v}" data-s="${slug}" data-c="${c}" data-v="${v}">
      <div class="v-he cu-he">${he}</div>
      <div class="v-num no-copy">
        <span class="n-he">${gematria(v)}</span><span class="n-en">${v}</span>
        <span class="v-tools">
          <button class="v-btn bm-btn ${on ? "on" : ""}" type="button" aria-label="Bookmark ${esc(refEn(slug, c, v))}" title="Bookmark">${iconBookmark}</button>
          <button class="v-btn fav-btn ${fv ? "on" : ""}" type="button" aria-pressed="${fv}" aria-label="Favourite ${esc(refEn(slug, c, v))}" title="Favourite">${iconStar}</button>
          <button class="v-btn unit-copy" type="button" aria-label="Copy ${esc(refEn(slug, c, v))}" title="Copy this pasuk">${iconCopy}</button>
        </span>
      </div>
      <div class="v-en cu-en">${en}</div>
    </div>`;
  }

  /* ───── Rashi dropdown under each pasuk ───── */
  function renderReaderTools() {
    const el = $("#readerTools"); if (!el) return;
    const meta = commMeta(readerState ? readerState.tab : COMMENTARIES[0].id);
    el.innerHTML = `
      <span class="rt-lbl"><span class="he">${meta.he}</span></span>
      <button type="button" class="pill ${settings.rashiOpen ? "on" : ""}" data-tool="rashiOpen" aria-pressed="${settings.rashiOpen}">Always open</button>
      ${meta.enDir ? `<button type="button" class="pill ${settings.rashiEn ? "on" : ""}" data-tool="rashiEn" aria-pressed="${settings.rashiEn}">English</button>` : ""}
      ${meta.enDir && settings.rashiEn ? `<button type="button" class="pill ${settings.rashiLines ? "on" : ""}" data-tool="rashiLines" aria-pressed="${settings.rashiLines}">Line by line</button>` : ""}`;
    $$("[data-tool]", el).forEach((b) => b.addEventListener("click", () => {
      const spot = captureSpot();
      const k = b.dataset.tool; settings[k] = !settings[k]; saveSettings(); renderReaderTools();
      if (k === "rashiOpen" && !settings.rashiOpen) readerState.open.clear();
      repaintComm(spot);
      if (k === "rashiLines") return;
      toast(k === "rashiOpen" ? (settings.rashiOpen ? `${meta.en} open under every pasuk` : `${meta.en} closed — tap a pasuk to open`) : (settings.rashiEn ? `English ${meta.en} on` : `English ${meta.en} off`));
    }));
  }

  /* ───── Rashi line by line: each Hebrew phrase with its translation beside it ───── */
  const NO_BREAK = new Set(["r", "rav", "heb", "cf", "v", "vs", "ch", "etc", "viz", "lit", "ibid", "no", "pp", "p", "ff", "dr", "mr", "st", "comp", "ex", "esp", "ed", "trans", "vol", "fol", "loc", "op", "cit", "b", "ben", "lat", "fr", "gr", "ger", "aram", "o", "mt", "rab", "sec"]);
  /* Bold survives the trip to plain phrase text as two private-use markers, turned back into <b> by boldSeq */
  const B0 = "\uE000", B1 = "\uE001", RE_BMARK = /[\uE000\uE001]/g;
  const unB = (s) => (s || "").replace(RE_BMARK, "");
  function boldSeq(list) {            // phrase texts in reading order → HTML, bold carried across phrase breaks
    let on = false;
    return list.map((s) => {
      let h = on ? "<b>" : "";
      for (const part of (s || "").split(/([\uE000\uE001])/)) {
        if (part === B0) { if (!on) { h += "<b>"; on = true; } }
        else if (part === B1) { if (on) { h += "</b>"; on = false; } }
        else h += esc(part);
      }
      if (on) h += "</b>";
      return h.replace(/<b>(\s*)<\/b>/g, "$1");
    });
  }
  function extractDH(html, keepBold) {
    const t = document.createElement("template"); t.innerHTML = html || "";
    t.content.querySelectorAll("sup, i.footnote, .footnote").forEach((n) => n.remove());
    t.content.querySelectorAll("br").forEach((n) => n.replaceWith(" "));  // paragraph breaks keep a space between sentences
    let dh = "";
    const first = [...t.content.childNodes].find((n) => !(n.nodeType === 3 && !n.data.trim()));
    if (first && first.nodeName === "B") { dh = norm(first.textContent); first.remove(); }
    if (keepBold) t.content.querySelectorAll("b, strong").forEach((n) => n.replaceWith(B0 + n.textContent + B1));
    return { dh, rest: norm(t.content.textContent) };
  }
  function splitPhrases(text, lang) {
    const out = []; let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(" || ch === "[") depth++;
      else if ((ch === ")" || ch === "]") && depth > 0) depth--;
      else if (depth === 0 && /[,.:;?!]/.test(ch)) {
        let j = i + 1; while (j < text.length && /[\]\)"”’'״\uE001]/.test(text[j])) j++;
        if (j >= text.length || !/\s/.test(text[j])) continue;
        if (lang === "en") {
          const before = text.slice(0, i);
          if (ch === "." ) { const w = unB((before.match(/([^\s(\[“"]+)$/) || ["", ""])[1]).toLowerCase(); if (w.length <= 1 || w.includes(".") || NO_BREAK.has(w)) continue; }
          if (ch === "," && /(^|\s|\[)(i\.e|e\.g)\.$/i.test(before)) continue;
        }
        out.push(text.slice(start, j).trim()); start = j;
      }
    }
    const last = text.slice(start).trim(); if (last) out.push(last);
    const merged = [];
    for (const s of out) { if (merged.length && s.split(/\s+/).length <= 1) merged[merged.length - 1] += " " + s; else merged.push(s); }
    return merged;
  }
  const heLen = (s) => s.replace(/\([^)]*\)/g, "").replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").length;  // citations have no English counterpart
  const heWords = (s) => new Set((s.replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").match(/[א-ת"״׳']{2,}/g) || []));
  /* ── a Hebrew→English word dictionary learned from the matched texts (scripts/build_lexicon.py) ──
     Normalisation here must match the script. */
  let LEX = null;
  function loadLex() { return LEX ? Promise.resolve(LEX) : fetchJSON("data/lex.json").then((d) => (LEX = d.h)).catch(() => null); }
  const HE_PFX = "והבכלמש";
  const EN_STOP = new Set(("a an the and or but of to in on at by for from with as is are was were be been being it its this that these those he she they them his her " +
    "their him i you your we us our my me not no so if then than there here which who whom whose what when where why how all any some such " +
    "also very more most much many one two three each other into upon unto out up down over under again further only own same too can will " +
    "shall should would could may might must do does did done have has had having thee thou thy thine ye yea hath doth unto said say says saying " +
    "s t just even about after before because while being both either neither nor whether").split(" "));
  const lexHeWords = (t) => unB(t).replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").replace(/[״"׳']/g, "").match(/[\u05d0-\u05ea]{2,}/g) || [];
  const lexHeFeats = (w) => { const f = [w]; if (w.length > 3 && HE_PFX.includes(w[0])) { f.push(w.slice(1)); if (w.length > 4 && HE_PFX.includes(w[1])) f.push(w.slice(2)); } return f; };
  function lexEnStem(w) {
    w = w.toLowerCase();
    if (w.endsWith("’s") || w.endsWith("'s")) w = w.slice(0, -2);
    for (const suf of ["ings", "ing", "edly", "ed", "es", "s"]) if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
    return w;
  }
  const lexEnSet = (t) => { const o = new Set(); for (const w of unB(t).match(/[A-Za-z’']+/g) || []) if (w.length > 2 && !EN_STOP.has(w.toLowerCase())) o.add(lexEnStem(w)); return o; };
  /* how much each Hebrew phrase's words are translated in each English phrase */
  function lexMatrix(H, E) {
    if (!LEX) return null;
    const hw = H.map((h) => lexHeWords(h).map(lexHeFeats)), es = E.map(lexEnSet);
    return H.map((_, k) => E.map((_, l) => {
      let sum = 0;
      for (const feats of hw[k]) { let best = 0; for (const f of feats) { const ent = LEX[f]; if (ent) for (const [e, sc] of ent) if (sc > best && es[l].has(e)) best = sc; } sum += best; }
      return sum / 100;
    }));
  }
  let LEX_W = 2;
  /* dynamic-programming alignment (Gale–Church style: lengths, quoted Hebrew, and the word dictionary) */
  function alignPhrases(H, E) {
    const n = H.length, m = E.length;
    if (!n) return [];
    if (!m) return H.map((h) => ({ he: [h], en: [] }));
    const hl = H.map(heLen), el = E.map((e) => e.length);
    const TH = hl.reduce((x, y) => x + y, 0) || 1, TE = el.reduce((x, y) => x + y, 0) || 1, r = TE / TH;
    const pH = [0], pE = [0]; hl.forEach((x) => pH.push(pH[pH.length - 1] + x)); el.forEach((x) => pE.push(pE[pE.length - 1] + x));
    // everything about a phrase that the cost needs is worked out once, not in the inner loop
    const hw = H.map(heWords);
    const ew = E.map((e) => unB(e).replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").match(/[א-ת"״׳']{2,}/g) || []);
    const hq = H.map((h) => /\?\W*$/.test(h)), eq = E.map((e) => /\?\W*$/.test(unB(e)));
    // Hebrew the translator quotes (two or more words running together) that occurs in only one Hebrew phrase
    // pins that English phrase to that Hebrew phrase
    const bare = (x) => unB(x).replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").replace(/[״"׳'`]/g, "");
    const hWords = H.map((h) => " " + bare(h).replace(/[^\u05d0-\u05ea]+/g, " ").trim() + " ");
    const anc = E.map((e) => {
      for (const run of bare(e).match(/[\u05d0-\u05ea]+(?:[\s\-־,.:;]+[\u05d0-\u05ea]+)+/g) || []) {
        const w = run.replace(/[^\u05d0-\u05ea]+/g, " ").trim().split(" ");
        for (let a = 0; a + 1 < w.length; a++) {
          const pair = " " + w[a] + " " + w[a + 1] + " ";
          const hits = []; hWords.forEach((h, k) => { if (h.includes(pair)) hits.push(k); });
          if (hits.length === 1) return hits[0];
        }
      }
      return -1;
    });
    const moves = [[1, 1, 0], [1, 2, .6], [2, 1, .6], [1, 3, 1.2], [3, 1, 1.2], [2, 2, 1.2], [2, 3, 1.6], [3, 2, 1.6], [1, 4, 1.8], [4, 1, 1.8], [1, 5, 2.4], [5, 1, 2.4], [1, 0, 3]];
    // word-dictionary support for putting Hebrew i..ni with English j..nj together (2-D prefix sums)
    // each English phrase: what share of its dictionary matches lies in each Hebrew phrase; and each Hebrew
    // phrase: what share of its words' matches lies in each English phrase — so every phrase counts the same
    const S = lexMatrix(H, E), P = S ? Array.from({ length: n + 1 }, () => new Float64Array(m + 1)) : null;
    if (S) {
      const colT = E.map((_, l) => H.reduce((t, __, k) => t + S[k][l], 0)), rowT = S.map((r) => r.reduce((t, x) => t + x, 0));
      for (let a = 1; a <= n; a++) for (let b = 1; b <= m; b++) {
        const x = S[a - 1][b - 1], share = (colT[b - 1] > .15 ? x / colT[b - 1] : 0) + (rowT[a - 1] > .15 ? x / rowT[a - 1] : 0);
        P[a][b] = share + P[a - 1][b] + P[a][b - 1] - P[a - 1][b - 1];
      }
    }
    const W = m + 1, INF = 1e9;
    const D = new Float64Array((n + 1) * W).fill(INF), Bi = new Int32Array((n + 1) * W), Bj = new Int32Array((n + 1) * W);
    D[0] = 0;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
      const d0 = D[i * W + j]; if (d0 >= INF) continue;
      for (let t = 0; t < moves.length; t++) {
        const di = moves[t][0], dj = moves[t][1];
        const ni = i + di, nj = j + dj; if (ni > n || nj > m) continue;
        const hL = pH[ni] - pH[i], eL = pE[nj] - pE[j];
        let cost = moves[t][2] + Math.abs(Math.log((eL + 8) / (r * hL + 8))) * 4
          + Math.abs(pH[ni] / TH - pE[nj] / TE) * 4;                 // stay near the diagonal: no drift
        if (dj) {
          let bonus = 0;
          for (let l = j; l < nj && bonus < 2.4; l++) for (const w of ew[l]) {
            for (let k = i; k < ni; k++) if (hw[k].has(w)) { bonus += .8; break; }
            if (bonus >= 2.4) break;
          }
          cost -= Math.min(bonus, 2.4);
          if (eq[nj - 1] && hq[ni - 1]) cost -= .5;
          for (let l = j; l < nj; l++) if (anc[l] >= 0) cost += anc[l] >= i && anc[l] < ni ? -3 : 5;
          if (P) cost -= LEX_W * (P[ni][nj] - P[i][nj] - P[ni][j] + P[i][j]);
        }
        const x = ni * W + nj;
        if (d0 + cost < D[x]) { D[x] = d0 + cost; Bi[x] = i; Bj[x] = j; }
      }
    }
    if (D[n * W + m] >= INF) return [{ he: H, en: [E.join(" ")] }];
    const rows = []; let i = n, j = m;
    while (i > 0 || j > 0) { const x = i * W + j, pi = Bi[x], pj = Bj[x]; rows.unshift({ he: H.slice(pi, i), en: E.slice(pj, j) }); i = pi; j = pj; }
    return rows;
  }
  /* A commentary's Hebrew and English are matched sentence by sentence first (sentence ends, questions,
     references and the Hebrew words the translator quotes are strong clues), and a sentence is split further
     only where both sides break into phrases the same way. Where that isn't certain, the whole sentence is
     one highlight with its whole translation — a bigger highlight rather than a wrong one. */
  function sentencesOf(text, lang) {
    const out = []; let depth = 0, start = 0;
    const END = lang === "he" ? /[.:?!׃]/ : /[.?!]/;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(" || ch === "[") depth++;
      else if ((ch === ")" || ch === "]") && depth > 0) depth--;
      else if (depth === 0 && END.test(ch)) {
        let j = i + 1; while (j < text.length && /[\]\)"”’'״\uE001]/.test(text[j])) j++;
        if (j < text.length && !/\s/.test(text[j])) continue;
        if (lang === "en" && ch === ".") { const w = unB((text.slice(0, i).match(/([^\s(\[“"]+)$/) || ["", ""])[1]).toLowerCase(); if (w.length <= 1 || w.includes(".") || NO_BREAK.has(w)) continue; }
        if (lang === "he" && ch === "." && /(^|\s)[א-ת]$/.test(text.slice(0, i))) continue;   // an abbreviation like ר.
        const seg = text.slice(start, j).trim(); if (seg) out.push(seg); start = j;
      }
    }
    const last = text.slice(start).trim(); if (last) out.push(last);
    return out;
  }
  const lenOk = (hp, ep, r, tol) => { const hL = hp.reduce((t, x) => t + heLen(x), 0), eL = ep.reduce((t, x) => t + unB(x).length, 0); return Math.abs(Math.log((eL + 6) / (r * hL + 6))) < tol; };
  const ALIGN_MEMO = new Map();
  function alignComment(heText, enText) {
    const key = `${LEX_W}|${LEX ? 1 : 0}|${heText}\u0001${enText || ""}`;
    let rows = ALIGN_MEMO.get(key);
    if (!rows) {
      rows = alignCommentNow(heText, enText);
      ALIGN_MEMO.set(key, rows);
      if (ALIGN_MEMO.size > 3000) ALIGN_MEMO.delete(ALIGN_MEMO.keys().next().value);
    }
    return rows.map((r) => ({ he: r.he.slice(), en: r.en.slice() }));
  }
  function alignCommentNow(heText, enText) {
    const hp = splitPhrases(heText, "he");
    if (!enText) return hp.map((h) => ({ he: [h], en: [] }));
    const ep = splitPhrases(enText, "en");
    let rows = alignPhrases(hp, ep);
    const TH = hp.reduce((t, x) => t + heLen(x), 0) || 1, TE = ep.reduce((t, x) => t + unB(x).length, 0) || 1, r = TE / TH;
    const bare = (x) => unB(x).replace(RE_TAAMIM, "").replace(RE_NIKKUD, "").replace(/[״"׳'`]/g, "").replace(/[^\u05d0-\u05ea]+/g, " ").trim();
    const pinned = (row) => {   // the English quotes two words running together that are in this row's Hebrew
      const hw = " " + bare(row.he.join(" ")) + " ";
      for (const run of row.en.map((e) => bare(e)).join(" | ").split(" | ")) { const w = run.split(" "); for (let a = 0; a + 1 < w.length; a++) if (w[a] && hw.includes(" " + w[a] + " " + w[a + 1] + " ")) return true; }
      return false;
    };
    const sure = (row) => row.en.length > 0 && (pinned(row) || lenOk(row.he, row.en, r, .55));
    // boundaries where an English clause at the edge matches the neighbouring Hebrew about as well as its own
    // are uncertain: those two highlights become one
    const S = lexMatrix(hp, ep);
    if (S && rows.length > 1) {
      let hi = 0, ei = 0; const span = rows.map((x) => { const o = { h0: hi, h1: hi + x.he.length, e0: ei, e1: ei + x.en.length }; hi = o.h1; ei = o.e1; return o; });
      const aff = (l, sp) => { let t = 0; for (let k = sp.h0; k < sp.h1; k++) t += S[k][l]; return t; };
      const unsure = (a, b) => {   // the boundary between rows a and b
        const A = span[a], Bs = span[b];
        // the two clauses on each side of the boundary: any that leans (even slightly) to the other side
        const edge = [A.e1 - 2, A.e1 - 1, Bs.e0, Bs.e0 + 1].filter((l) => l >= A.e0 && l < Bs.e1);
        return edge.some((l) => { const own = l < A.e1 ? aff(l, A) : aff(l, Bs), other = l < A.e1 ? aff(l, Bs) : aff(l, A); return other > .05 && other >= own * .8; });
      };
      const out = [rows[0]];
      for (let k = 1; k < rows.length; k++) {
        if (unsure(k - 1, k) && !(pinned(rows[k - 1]) && pinned(rows[k]))) { const last = out[out.length - 1]; out[out.length - 1] = { he: [...last.he, ...rows[k].he], en: [...last.en, ...rows[k].en] }; }
        else out.push(rows[k]);
      }
      rows = out;
    }
    // merge each doubtful pair into the neighbour that suits it best, until every highlight is sure
    let guard = 0;
    while (rows.length > 1 && guard++ < 400) {
      const k = rows.findIndex((x) => !sure(x)); if (k < 0) break;
      const join = (a, b) => ({ he: [...a.he, ...b.he], en: [...a.en, ...b.en] });
      const left = k > 0 ? join(rows[k - 1], rows[k]) : null, right = k < rows.length - 1 ? join(rows[k], rows[k + 1]) : null;
      const score = (x) => (x ? (sure(x) ? 0 : 1) + Math.abs(Math.log((x.en.join(" ").length + 6) / (r * x.he.reduce((t, y) => t + heLen(y), 0) + 6))) : 99);
      if (score(left) <= score(right)) rows.splice(k - 1, 2, left); else rows.splice(k, 2, right);
    }
    return rows;
  }
  function linesHTML(heHtml, enHtml, al) {
    if (al) {
      const p = commParts(heHtml, enHtml), u = unitsFromAlign(al, p.heDH, p.heRest, p.enDH, p.enRest);
      if (u) return u.map((x) => x.dh
        ? `<div class="rline dh"><div class="r-en cu-en">${x.html}</div><div class="r-he cu-he dh-line"><b>${esc(x.he)}</b></div></div>`
        : `<div class="rline"><div class="r-en cu-en">${x.html}</div><div class="r-he cu-he">${x.heDH ? `<b>${esc(x.heDH)}</b> ` : ""}${esc(x.he)}</div></div>`).join("");
    }
    const H = extractDH(heComm(heHtml)), E = extractDH(enHtml, true);
    let enRest = E.rest, enDH = E.dh;
    if (!H.dh && enDH) { enRest = `${B0}${enDH}${B1} ${enRest}`.trim(); enDH = ""; }
    const rows = alignComment(H.rest, enRest);
    const ens = boldSeq(rows.map((rw) => rw.en.join(" ")));
    return (H.dh ? `<div class="rline dh"><div class="r-en cu-en">${enDH ? `<b>${esc(enDH)}</b>` : ""}</div><div class="r-he cu-he dh-line"><b>${esc(H.dh)}</b></div></div>` : "") +
      rows.map((rw, k) => `<div class="rline"><div class="r-en cu-en">${ens[k]}</div><div class="r-he cu-he">${rw.he.map(esc).join("<br>")}</div></div>`).join("");
  }

  const commBmBtn = (cid, s, c, v, i) => `<button class="c-bm ${isCommBm(cid, s, c, v, i) ? "on" : ""}" type="button" aria-label="Bookmark this ${esc(commMeta(cid).en)}" title="Bookmark this comment">${iconBookmark}</button>`;
  function commentRow(cid, s, c, v, i, he, en) {
    const showEn = settings.rashiEn && en;
    if (showEn && settings.rashiLines) {
      return `<div class="rrow lines cu has-en" data-kind="comm" data-cid="${cid}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}">
        <button class="unit-copy c-copy" type="button" aria-label="Copy this comment" title="Copy this comment">${iconCopy}</button>
        ${commBmBtn(cid, s, c, v, i)}
        ${linesHTML(he, en, alignOf(cid, s, c, v, i))}
      </div>`;
    }
    return `<div class="rrow cu ${showEn ? "has-en" : "no-en"}" data-kind="comm" data-cid="${cid}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}">
      <button class="unit-copy c-copy" type="button" aria-label="Copy this comment" title="Copy this comment">${iconCopy}</button>
      ${commBmBtn(cid, s, c, v, i)}
      ${showEn ? `<div class="r-en cu-en">${en}</div>` : ""}
      <div class="r-he cu-he">${heComm(he)}</div>
    </div>`;
  }
  function dropdownHTML(cid, s, c, v, list, enl) {
    const meta = commMeta(cid);
    return `<div class="rdrop">
      <div class="rdrop-head no-copy"><span class="en">${esc(meta.en)}</span><span class="he">${meta.he}</span></div>
      ${list.map((x, i) => commentRow(cid, s, c, v, i, x, enl[i])).join("")}
    </div>`;
  }

  const isOpen = (s, c, v) => settings.rashiOpen || (readerState && readerState.open.has(`${s}:${c}:${v}`));

  /* the commentary of the open tab for these sefarim, from memory: true when everything needed is there
     (force: whatever is there, what couldn't be loaded counts as none) */
  function commSync(slugs, force) {
    const st = readerState; if (!st) return false;
    const cid = st.tab, meta = commMeta(cid);
    if (settings.rashiLines && settings.rashiEn && !LEX && !force) return false;
    const out = {};
    for (const s of slugs) {
      if (!avail(meta, s)) { out[s] = { data: null, enData: null }; continue; }
      const he = resolved.get(commUrl(cid, s));
      const wantEn = settings.rashiEn && meta.enDir, en = wantEn ? resolved.get(commEnUrl(cid, s)) : null;
      if (!force && (!he || (wantEn && !en && !MISSING.has(commEnUrl(cid, s))))) return false;
      out[s] = { data: he || null, enData: en || null };
    }
    st.comm = Object.assign(st.comm || {}, out);
    return true;
  }
  async function loadCommFor(slugs) {
    const st = readerState; if (!st) return;
    if (commSync(slugs)) return;
    const cid = st.tab, meta = commMeta(cid);
    await Promise.all([settings.rashiLines && settings.rashiEn ? loadLex() : null, ...slugs.map((s) => avail(meta, s)
      ? Promise.allSettled([loadComm(cid, s), settings.rashiEn && meta.enDir ? loadCommEn(cid, s) : null]) : null)]);
    if (readerState === st) commSync(slugs, true);
  }
  function paintRows(rows) { for (const row of rows) paintRow(row); }
  /* Rashi on these pesukim (all on the page, by default), loading it first if it isn't in memory */
  async function decorateCommentary(rows) {
    const st = readerState; if (!st) return;
    rows = rows || $$(".reader .verse");
    await loadCommFor([...new Set(rows.map((r) => r.dataset.s))]);
    if (readerState !== st) return;
    win.keep(() => paintRows(rows.filter((r) => r.isConnected)));
  }
  /* a Rashi setting changed: every pasuk on the page painted again, your place kept */
  function repaintComm(spot) {
    const st = readerState; if (!st) return;
    const rows = () => $$(".reader .verse");
    const slugs = [...new Set(rows().map((r) => r.dataset.s))];
    if (commSync(slugs)) { paintRows(rows()); restoreSpot(spot); return; }
    restoreSpot(spot);
    loadCommFor(slugs).then(() => { if (readerState === st) win.keep(() => paintRows(rows()), true); });
  }

  function paintRow(row) {
    const st = readerState; if (!st || !st.comm) return;
    const s = row.dataset.s, c = +row.dataset.c, v = +row.dataset.v;
    const cm = st.comm[s]; if (!cm) return;
    const list = at(cm.data, c, v), enl = at(cm.enData, c, v);
    $(".rashi-pill", row)?.remove(); $(".rdrop", row)?.remove();
    row.classList.toggle("has-rashi", list.length > 0);
    const open = list.length > 0 && isOpen(s, c, v);
    row.classList.toggle("open", open);
    if (!list.length) return;
    $(".v-tools", row).insertAdjacentHTML("beforeend",
      `<button type="button" class="rashi-pill" aria-expanded="${open}" title="${list.length} ${commMeta(st.tab).en} comment${list.length > 1 ? "s" : ""}"><span class="he">${commMeta(st.tab).he}</span><span class="n">${list.length}</span><svg class="chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 3.6l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`);
    if (open) {
      row.insertAdjacentHTML("beforeend", dropdownHTML(st.tab, s, c, v, list, enl));
    }
  }

  function toggleRashi(row, force) {
    const st = readerState; if (!st || !row.classList.contains("has-rashi")) return;
    const key = `${row.dataset.s}:${row.dataset.c}:${row.dataset.v}`;
    if (settings.rashiOpen) { return; }
    const willOpen = force != null ? force : !st.open.has(key);
    if (willOpen) st.open.add(key); else st.open.delete(key);
    paintRow(row); win.note();
  }

  function onVerseClick(e) {
    const fnm = e.target.closest("sup.footnote-marker");
    if (fnm) {
      const fn = fnm.nextElementSibling;
      if (fn && fn.classList.contains("footnote")) fn.classList.toggle("open");
      e.stopPropagation(); return;
    }
    const unitBtn = e.target.closest(".unit-copy");
    if (unitBtn) { e.stopPropagation(); copyUnit(unitBtn.closest(".cu")); return; }
    const row = e.target.closest(".verse"); if (!row) return;
    const s = row.dataset.s, c = +row.dataset.c, v = +row.dataset.v;
    const bm = e.target.closest(".bm-btn");
    if (bm) { e.stopPropagation(); toggleBookmark(s, c, v); return; }
    const fv = e.target.closest(".fav-btn");
    if (fv) { e.stopPropagation(); toggleFav(s, c, v); return; }
    const cbm = e.target.closest(".c-bm");
    if (cbm) { e.stopPropagation(); const cr = cbm.closest(".rrow"); toggleCommBm(cr.dataset.cid, cr.dataset.s, +cr.dataset.c, +cr.dataset.v, +cr.dataset.i, cbm); return; }
    if (e.target.closest(".rashi-pill")) { toggleRashi(row); markSelected(s, c, v); return; }
    if (e.target.closest(".rdrop")) return;                        // reading / selecting inside Rashi
    if (window.getSelection && String(window.getSelection()).length > 1) return; // selecting text
    if (copyMode) { togglePick(s, c, v); return; }                 // copy mode: a tap picks the pasuk (or lets it go)
    // a second tap on the selected pasuk lets it go (and closes its Rashi)
    if (row.classList.contains("selected")) { clearSelected(); toggleRashi(row, false); return; }
    markSelected(s, c, v);
    toggleRashi(row);
  }
  function clearSelected() {
    $$(".verse.selected").forEach((x) => x.classList.remove("selected"));
    const st = readerState; if (!st) return;
    const was = st.sel; st.sel = null;
    if (was && st.r.view === "chapter") history.replaceState(null, "", chapterHash(st.slug, was.c));
  }

  function markSelected(s, c, v) {
    $$(".verse.selected").forEach((x) => x.classList.remove("selected"));
    const row = $(`#v-${s}-${c}-${v}`); if (!row) return null;
    row.classList.add("selected");
    if (readerState) readerState.sel = { s, c, v };
    if (readerState && readerState.r.view === "chapter") history.replaceState(null, "", chapterHash(s, c, v));
    return row;
  }
  /* opening a pasuk (a link, search, Continue reading, a bookmark): selected, at the top of the screen */
  function selectVerse(s, c, v, { scroll = false } = {}) {
    const row = markSelected(s, c, v); if (!row) return;
    if (scroll) pasukToTop(row);
  }
  function pasukToTop(row) {
    const top = $(".topbar").getBoundingClientRect().bottom + ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight) + 10;
    window.scrollTo(0, Math.max(0, Math.round(row.getBoundingClientRect().top + window.scrollY - top)));
    win.note();
  }

  function renderNotFound() {
    setPicker(null);
    $("#app").innerHTML = `<div class="error-box"><h2 class="he-display" style="font-size:2rem;margin:0">לא נמצא</h2><p>That reference wasn't found.</p><p><a href="#">Back to the Tanach</a></p></div>`;
  }

  /* ───────── Copy mode ─────────
     Every copy starts with the source in Hebrew in brackets:
       pasuk:     (בראשית, א:ג)
       meforash:  (רש״י על בראשית, א:א, <b>בראשית</b>)
     followed by the Hebrew (RTL) and, in "both" format, the English (LTR). */
  function unitInfo(el) {
    const d = el.dataset;
    return { el, kind: d.kind, s: d.s, c: +d.c, v: +d.v, cid: d.cid, i: d.i != null ? +d.i : null, heSel: null, enSel: null };
  }

  function partSelection(el, range) {
    const r = document.createRange(); r.selectNodeContents(el);
    let atStart = true;
    if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) {
      r.setStart(range.startContainer, range.startOffset);
      const pre = document.createRange(); pre.setStart(el, 0); pre.setEnd(range.startContainer, range.startOffset);
      atStart = norm(pre.toString()) === "";
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
    const frag = cleanFrag(r.cloneContents());
    return { frag, atStart };
  }

  function unitsFromRange(range) {
    const units = new Map();
    for (const part of $$(".cu-he, .cu-en")) {
      if (!range.intersectsNode(part) || !part.getClientRects().length) continue;
      const { frag, atStart } = partSelection(part, range);
      const txt = norm(frag.textContent);
      if (!txt) continue;
      const el = part.closest(".cu"); if (!el) continue;
      if (!units.has(el)) units.set(el, unitInfo(el));
      const u = units.get(el);
      if (part.classList.contains("cu-he")) {
        if (part.classList.contains("dh-line")) continue;          // the dibbur hamatchil goes in the reference
        const t2 = u.kind === "comm" && atStart && !el.classList.contains("lines") ? stripDH(frag) : txt;
        (u.heParts ||= []).push(t2);
      } else (u.enParts ||= []).push(txt);
    }
    for (const u of units.values()) {
      if (u.heParts) u.heSel = { txt: u.heParts.filter(Boolean).join(" ") };
      if (u.enParts) u.enSel = u.enParts.join(" ");
    }
    return [...units.values()];
  }

  const dhOf = (heHtml) => {
    const t = document.createElement("template"); t.innerHTML = heHtml || "";
    const b = t.content.querySelector("b");
    return b ? norm(b.textContent).replace(/[.:׃,]+$/, "").trim() : "";
  };
  function stripDH(frag) {
    const b = frag.querySelector("b");
    if (b && norm(frag.textContent).startsWith(norm(b.textContent))) b.remove();
    return norm(frag.textContent).replace(/^[.:,\s]+/, "");
  }

  function commData(u) {
    const he = at(resolved.get(commUrl(u.cid, u.s)), u.c, u.v)[u.i] || "";
    const en = at(resolved.get(commEnUrl(u.cid, u.s)), u.c, u.v)[u.i] || "";
    return { he, en };
  }

  function buildBlocks(units) {
    const blocks = [];
    for (const u of units) {
      if (u.kind === "verse") {
        const text = resolved.get(textUrl(u.s));
        const he = u.heSel && u.heSel.txt ? u.heSel.txt : htmlToText(heText(text.he[u.c - 1][u.v - 1]));
        const en = u.enSel != null ? u.enSel : htmlToText(text.en[u.c - 1][u.v - 1]);
        const prev = blocks[blocks.length - 1];
        if (prev && prev.kind === "verse" && prev.s === u.s) {
          if (prev.items.some((x) => x.c === u.c && x.v === u.v)) continue; // same pasuk shown twice (text + panel)
          prev.items.push({ c: u.c, v: u.v, he, en }); prev.he.push(he); prev.en.push(en); prev.last = { c: u.c, v: u.v };
        } else {
          blocks.push({ kind: "verse", s: u.s, first: { c: u.c, v: u.v }, last: { c: u.c, v: u.v }, he: [he], en: [en], items: [{ c: u.c, v: u.v, he, en }] });
        }
      } else {
        const d = commData(u);
        const dh = dhOf(d.he);
        let he;
        if (u.heSel && u.heSel.txt) he = u.heSel.txt;
        else { const t = document.createElement("template"); t.innerHTML = heComm(d.he); he = stripDH(cleanFrag(t.content)); }
        let en = u.enSel != null ? u.enSel : htmlToText(d.en);
        if (!en) { const domEn = u.el && u.el.querySelector(".cu-en"); if (domEn) en = htmlToText(domEn.innerHTML); }
        blocks.push({ kind: "comm", s: u.s, c: u.c, v: u.v, cid: u.cid, dh, enDH: extractDH(d.en).dh, he: [he], en: [en] });
      }
    }
    return blocks;
  }

  /* the pesukim of a block as runs: כד:י-יב, טו · כד:סה-כה:ב */
  function versesLoc(s, items) {
    const sorted = [...items].sort((a, b) => a.c - b.c || a.v - b.v), runs = [];
    const next = (x) => (x.v < book(s).verses[x.c - 1] ? { c: x.c, v: x.v + 1 } : { c: x.c + 1, v: 1 });
    for (const x of sorted) {
      const r = runs[runs.length - 1];
      if (r) { const n = next(r.l); if (n.c === x.c && n.v === x.v) { r.l = x; continue; } }
      runs.push({ f: x, l: x });
    }
    let lastC = null;
    return runs.map(({ f, l }) => {
      let t = f.c === lastC ? plainGem(f.v) : `${plainGem(f.c)}:${plainGem(f.v)}`;
      if (l.c !== f.c) t += `-${plainGem(l.c)}:${plainGem(l.v)}`;
      else if (l.v !== f.v) t += `-${plainGem(l.v)}`;
      lastC = l.c;
      return t;
    }).join(", ");
  }
  function blockRef(b) {
    const B = book(b.s).he;
    if (b.kind === "verse") {
      const loc = versesLoc(b.s, b.items || [b.first, b.last]);
      return { html: esc(`(${B}, ${loc})`), plain: `(${B}, ${loc})` };
    }
    const name = `${commMeta(b.cid).he} על ${B}`;
    const loc = `${plainGem(b.c)}:${plainGem(b.v)}`;
    return {
      html: `(${esc(name)}, ${esc(loc)}${b.dh ? `, <b>${esc(b.dh)}</b>` : ""})`,
      plain: `(${name}, ${loc}${b.dh ? `, ${b.dh}` : ""})`,
    };
  }

  function formatCopy(blocks) {
    const both = settings.copyFmt === "both";
    const html = [], plain = [];
    for (const b of blocks) {
      const ref = blockRef(b);
      if (b.kind === "verse" && b.items && b.items.length > 1) {
        // several pesukim: the reference, then each pasuk — its number in Hebrew, its Hebrew, then its English
        const items = [...b.items].sort((a, c) => a.c - c.c || a.v - c.v);
        const oneC = items.every((x) => x.c === items[0].c);
        const num = (x) => `${oneC ? "" : plainGem(x.c) + ":"}${plainGem(x.v)}.`;
        let h = `<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 6px">${ref.html}</p>`, t = `‏${ref.plain}`;
        for (const x of items) {
          h += `<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 2px">${esc(num(x))} ${esc(x.he)}</p>`;
          t += `\n‏${num(x)} ${x.he}`;
          if (both && x.en) { h += `<p dir="ltr" style="direction:ltr;text-align:left;margin:0 0 8px">${esc(x.en)}</p>`; t += `\n‎${x.en}`; }
        }
        html.push(h); plain.push(t);
        continue;
      }
      const he = b.he.filter(Boolean).join(" ");
      const en = both ? b.en.filter(Boolean).join(" ") : "";
      const enH = b.enDH && en.startsWith(b.enDH) ? `<b>${esc(b.enDH)}</b>${esc(en.slice(b.enDH.length))}` : esc(en);
      html.push(`<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 4px">${ref.html} ${esc(he)}</p>` +
        (en ? `<p dir="ltr" style="direction:ltr;text-align:left;margin:0 0 4px">${enH}</p>` : ""));
      plain.push(`‏${ref.plain} ${he}` + (en ? `\n‎${en}` : ""));
    }
    return {
      html: `<div>${html.join('<p style="margin:0">&nbsp;</p>')}</div>`,
      plain: plain.join("\n\n"),
      label: blocks.length ? blockRef(blocks[0]).plain + (blocks.length > 1 ? ` +${blocks.length - 1}` : "") : "",
    };
  }

  /* ── several pesukim picked for copying (copy mode: tap pesukim; in Pages, "Select" on the page) ── */
  const picks = new Map();                       // "s:c:v" → {s, c, v}
  const pickKey = (s, c, v) => `${s}:${c}:${v}`;
  function togglePick(s, c, v) {
    const k = pickKey(s, c, v);
    if (picks.has(k)) picks.delete(k); else picks.set(k, { s, c, v });
    paintPicks(); updateCopyBar();
  }
  function paintPicks() {
    $$(".verse.picked").forEach((x) => { if (!picks.has(pickKey(x.dataset.s, +x.dataset.c, +x.dataset.v))) x.classList.remove("picked"); });
    for (const p of picks.values()) { const row = $(`#v-${p.s}-${p.c}-${p.v}`); if (row) row.classList.add("picked"); }
    const pp = $("#pgTop .pg-pasuk.cu");
    if (pp) {
      const on = picks.has(pickKey(pp.dataset.s, +pp.dataset.c, +pp.dataset.v));
      pp.classList.toggle("picked", on);
      const b = $("#pgTop .pg-pick"); if (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); const sp = $("span", b); if (sp) sp.textContent = on ? "Selected" : "Select"; }
    }
  }
  function clearPicks() { picks.clear(); paintPicks(); updateCopyBar(); }
  /* the picked pesukim between the first and the last picked one of each sefer, all of them */
  function fillPicks() {
    const bySefer = new Map();
    for (const p of picks.values()) (bySefer.get(p.s) || bySefer.set(p.s, []).get(p.s)).push(p);
    for (const [s, ps] of bySefer) {
      ps.sort((a, b) => a.c - b.c || a.v - b.v);
      let { c, v } = ps[0]; const L = ps[ps.length - 1], V = book(s).verses;
      while (c < L.c || (c === L.c && v <= L.v)) { picks.set(pickKey(s, c, v), { s, c, v }); if (++v > V[c - 1]) { c++; v = 1; } }
    }
    paintPicks(); updateCopyBar();
  }
  const picksGaps = () => {
    const bySefer = new Map();
    for (const p of picks.values()) (bySefer.get(p.s) || bySefer.set(p.s, []).get(p.s)).push(p);
    for (const [s, ps] of bySefer) {
      ps.sort((a, b) => a.c - b.c || a.v - b.v);
      const V = book(s).verses; let n = 0;
      for (let c = ps[0].c; c <= ps[ps.length - 1].c; c++) n += (c === ps[ps.length - 1].c ? ps[ps.length - 1].v : V[c - 1]) - (c === ps[0].c ? ps[0].v - 1 : 0);
      if (n > ps.length) return true;
    }
    return false;
  };
  function picksBlocks() {
    const order = Object.keys(INDEX.books);
    const units = [...picks.values()].sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s) || a.c - b.c || a.v - b.v)
      .map((p) => ({ kind: "verse", s: p.s, c: p.c, v: p.v, heSel: null, enSel: null }));
    return buildBlocks(units);
  }
  function copyPicks() {
    const slugs = [...new Set([...picks.values()].map((p) => p.s))];
    if (slugs.every((x) => resolved.has(textUrl(x)))) { copyBlocks(picksBlocks()); return; }
    Promise.allSettled(slugs.map((x) => loadText(x))).then(() => copyBlocks(picksBlocks()));
  }

  let pendingCopy = null;
  /* Copy synchronously inside the tap (needed on iPhone), falling back to the async clipboard API */
  async function writeClipboard(out) {
    pendingCopy = out;
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    pendingCopy = null;
    if (ok) return true;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([out.html], { type: "text/html" }),
          "text/plain": new Blob([out.plain], { type: "text/plain" }),
        })]);
        return true;
      }
    } catch {}
    try { await navigator.clipboard.writeText(out.plain); return true; } catch {}
    return false;
  }
  function copyReady(slug) {
    if (!resolved.has(textUrl(slug))) return false;
    return activeComms(slug).every((c) => resolved.has(commUrl(c.id, slug)) && (!c.enDir || resolved.has(commEnUrl(c.id, slug))));
  }

  async function copyBlocks(blocks) {
    if (!blocks.length) { toast("Select some text first"); return; }
    const out = formatCopy(blocks);
    const ok = await writeClipboard(out);
    toast(ok ? `Copied ${out.label}` : "Couldn't reach the clipboard — try the Copy key or menu");
  }

  function copyUnit(el) {
    if (!el) return;
    if (copyReady(el.dataset.s)) { copyBlocks(buildBlocks([unitInfo(el)])); return; }
    preloadForCopy(el.dataset.s).then(() => copyBlocks(buildBlocks([unitInfo(el)])));
  }

  async function preloadForCopy(slug) {
    const s = slug || (readerState && readerState.slug); if (!s) return;
    const jobs = [loadText(s)];
    for (const c of activeComms(s)) { jobs.push(loadComm(c.id, s)); if (c.enDir) jobs.push(loadCommEn(c.id, s)); }
    await Promise.allSettled(jobs);
  }

  /* selection tracking (so the Copy button works even if a tap collapses the selection) */
  let savedRange = null, clearTimer = null, copyBtnDownAt = 0;
  function selectionInContent(sel) {
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return $$(".cu-he, .cu-en").some((p) => r.intersectsNode(p)) ? r : null;
  }
  document.addEventListener("selectionchange", () => {
    if (!copyMode) return;
    const r = selectionInContent(window.getSelection());
    if (r) { clearTimeout(clearTimer); savedRange = r.cloneRange(); updateCopyBar(); }
    else {
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => { if (Date.now() - copyBtnDownAt > 800) { savedRange = null; updateCopyBar(); } }, 350);
    }
  });
  document.addEventListener("copy", (e) => {
    if (pendingCopy) {
      e.clipboardData.setData("text/html", pendingCopy.html);
      e.clipboardData.setData("text/plain", pendingCopy.plain);
      e.preventDefault(); return;
    }
    const r = selectionInContent(window.getSelection()); if (!r) return;   // every copy from the text gets its reference
    const blocks = buildBlocks(unitsFromRange(r)); if (!blocks.length) return;
    const out = formatCopy(blocks);
    e.clipboardData.setData("text/html", out.html);
    e.clipboardData.setData("text/plain", out.plain);
    e.preventDefault();
    toast(`Copied ${out.label}`);
  });

  function updateCopyBar() {
    const bar = $("#copybar"); if (!bar) return;
    const btn = $("#copySelBtn");
    let label = "";
    if (savedRange) { try { const bl = buildBlocks(unitsFromRange(savedRange)); if (bl.length) label = formatCopy(bl).label; } catch {} }
    const usePicks = !label && picks.size > 0;
    if (usePicks) { try { const bl = picksBlocks(); label = bl.map((b) => blockRef(b).plain).join(" · "); } catch { label = ""; } }
    btn.disabled = !label;
    btn.innerHTML = usePicks ? (picks.size > 1 ? `Copy ${picks.size}<span class="cb-l"> pesukim</span>` : `Copy<span class="cb-l"> pasuk</span>`) : "Copy";
    $("#copyFill").hidden = !(usePicks && picksGaps());
    $("#copyClear").hidden = !picks.size;
    const hint = PG ? "Select pesukim on their pages, or tap the copy icon" : "Tap pesukim to select them, or select text";
    const pv = $("#copyPreview"); pv.textContent = label || hint; pv.dir = label ? "rtl" : "ltr";
    $$("#copybar .seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings.copyFmt));
  }

  function setCopyMode(on) {
    copyMode = on;
    document.body.classList.toggle("copy-mode", on);
    $("#copybar").hidden = !on;
    $("#copyModeBtn").classList.toggle("active", on);
    $("#copyModeBtn").setAttribute("aria-pressed", String(on));
    savedRange = null;
    if (!on) { picks.clear(); paintPicks(); }
    updateCopyBar();
    if (on) { preloadForCopy(); toast("Copy mode on — tap pesukim to select them"); }
    if (PG) requestAnimationFrame(() => pagerLayout(true));
  }

  /* ───────── Picker ───────── */
  function setPicker(r) {
    const el = $("#pickerLabel");
    const html = !r ? `Choose a sefer` : r.view === "chapter" ? `<span class="he">${esc(book(r.slug).he)} ${gematria(r.c)}</span>` : `<span class="he">פרשת ${esc(r.p.he)}</span>`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  function openPicker(slug) { openDialog("#pickerOverlay"); if (slug) showChapters(slug); else showBooks(); }
  function showBooks() {
    $("#pickerTitle").textContent = "Choose a sefer";
    $("#pickerBack").hidden = true;
    const cur = current && (current.slug || (current.p && current.p.range[0]));
    // Torah, Nevi'im, Ketuvim side by side; the short Sefarim Chitzonim list sits under Torah (on a phone, last)
    const secHTML = (sec, order) => `<div class="pk-sec" style="order:${order}"><div class="col-head"><span class="en">${esc(sec.en)}</span><span class="he">${esc(sec.he)}</span></div>
        ${sec.groups.flatMap((g) => g.books).map((s) => `<button type="button" class="lrow ${s === cur ? "current" : ""}" data-book="${s}">
          <span class="en">${esc(book(s).en)}</span><span class="he">${esc(book(s).he)}</span></button>`).join("")}
      </div>`;
    const secs = INDEX.sections, byId = (id) => secs.find((x) => x.id === id);
    const extra = secs.filter((x) => !["torah", "neviim", "ketuvim"].includes(x.id));
    const cols = [[byId("torah"), ...extra], [byId("neviim")], [byId("ketuvim")]].map((col) => col.filter(Boolean));
    $("#pickerBody").innerHTML = `<div class="picker-sections">${cols.map((col) =>
      `<div class="pk-col">${col.map((sec) => secHTML(sec, 0)).join("")}</div>`).join("")}</div>`;
    $$("#pickerBody [data-book]").forEach((b) => b.addEventListener("click", () => showChapters(b.dataset.book)));
  }
  function showChapters(slug) {
    const b = book(slug);
    $("#pickerTitle").innerHTML = `${esc(b.en)} <span class="he">${esc(b.he)}</span>`;
    $("#pickerBack").hidden = false;
    const curC = current && current.view === "chapter" && current.slug === slug ? current.c : 0;
    const ps = INDEX.parshiot.filter((p) => p.range[0] === slug);
    const box = (c) => `<a href="${chapterHash(slug, c)}" class="${c === curC ? "current" : ""}" title="${esc(b.en)} ${c}"><span>${plainGem(c)}</span></a>`;
    if (!ps.length) { $("#pickerBody").innerHTML = `<div class="ch-grid">${b.verses.map((_, i) => box(i + 1)).join("")}</div>`; return; }

    // Torah: rows of perek boxes, each with a lane of brackets above showing which perakim every parsha covers.
    // A parsha that starts or ends mid-perek covers half of that box.
    const body = $("#pickerBody");
    const usable = Math.max(240, body.clientWidth - 36);
    const N = Math.max(5, Math.min(12, Math.floor(usable / 52)));
    const n = b.verses.length;
    let html = `<div class="ch-rows">`;
    for (let r0 = 1; r0 <= n; r0 += N) {
      const r1 = Math.min(n, r0 + N - 1), cols = r1 - r0 + 1;
      let brk = "";
      ps.forEach((p) => {
        const [, c1, v1, c2, v2] = p.range;
        if (c2 < r0 || c1 > r1) return;
        const contS = c1 < r0, contE = c2 > r1;
        const s = contS ? 0 : (c1 - r0) * 2 + (v1 > 1 ? 1 : 0);
        const e = contE ? cols * 2 : (c2 - r0) * 2 + (v2 < b.verses[c2 - 1] ? 1 : 2);
        const cur = current && current.p === p;
        const wide = e - s >= 3;
        brk += `<a class="brk ${p.index % 2 ? "alt" : ""} ${contS ? "cs" : ""} ${contE ? "ce" : ""} ${cur ? "current" : ""}" href="#parsha-${p.id}"
                  style="grid-column:${s + 1} / ${e + 1}" title="Parashat ${esc(p.en)} · ${c1}:${v1}–${c2}:${v2}">
                  ${wide ? `<span class="lbl he">${esc(p.he)}</span>` : ""}</a>`;
      });
      html += `<div class="ch-row">
          <div class="ch-brk" style="grid-template-columns:repeat(${N * 2}, minmax(0, 1fr))">${brk}</div>
          <div class="ch-cells" style="grid-template-columns:repeat(${N}, minmax(0, 1fr))">${Array.from({ length: cols }, (_, i) => box(r0 + i)).join("")}</div>
        </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  }

  /* ───────── Search / jump ───────── */
  const ABBR = {
    gen: "genesis", gn: "genesis", ex: "exodus", exod: "exodus", lev: "leviticus", lv: "leviticus", num: "numbers", nm: "numbers",
    deut: "deuteronomy", dt: "deuteronomy", deu: "deuteronomy", josh: "joshua", jos: "joshua", judg: "judges", jdg: "judges",
    isa: "isaiah", is: "isaiah", jer: "jeremiah", ezek: "ezekiel", eze: "ezekiel", hos: "hosea", ob: "obadiah", obad: "obadiah",
    jon: "jonah", mic: "micah", nah: "nahum", hab: "habakkuk", zeph: "zephaniah", hag: "haggai", zech: "zechariah", zec: "zechariah",
    mal: "malachi", ps: "psalms", psa: "psalms", psalm: "psalms", tehillim: "psalms", prov: "proverbs", pr: "proverbs", mishlei: "proverbs",
    song: "song-of-songs", sos: "song-of-songs", shir: "song-of-songs", "shir-hashirim": "song-of-songs", lam: "lamentations", eicha: "lamentations", eichah: "lamentations",
    eccl: "ecclesiastes", ecc: "ecclesiastes", kohelet: "ecclesiastes", koheles: "ecclesiastes", qoh: "ecclesiastes", est: "esther", esth: "esther",
    dan: "daniel", neh: "nehemiah", bereshit: "genesis", bereishit: "genesis", shemot: "exodus", vayikra: "leviticus", bamidbar: "numbers", devarim: "deuteronomy",
    yehoshua: "joshua", shoftim: "judges", yeshayahu: "isaiah", yirmiyahu: "jeremiah", yechezkel: "ezekiel", iyov: "job", rut: "ruth",
  };
  const HE_ALIASES = { "שמואל א": "i-samuel", "שמואל ב": "ii-samuel", "מלכים א": "i-kings", "מלכים ב": "ii-kings", "דברי הימים א": "i-chronicles", "דברי הימים ב": "ii-chronicles", "תהלים": "psalms", "קהלת": "ecclesiastes", "שיר השירים": "song-of-songs" };

  const BOOK_KEYS = {};
  function bookKeys(s) {
    if (BOOK_KEYS[s]) return BOOK_KEYS[s];
    const out = [];
    for (const name of [book(s).en, book(s).enOld].filter(Boolean)) {
      const w = name.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
      const num = { i: "1", ii: "2" };
      const last = w[w.length - 1], first = w[0];
      if (num[last]) { const base = w.slice(0, -1).join(""); out.push(base + last, base + num[last], last + base, num[last] + base); }
      else if (num[first]) { const base = w.slice(1).join(""); out.push(first + base, num[first] + base, base + first, base + num[first]); }
      else out.push(w.join(""));
    }
    return (BOOK_KEYS[s] = out);
  }
  function normEnBook(s) {
    s = s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
    s = s.replace(/^(2|ii|second)\s*(?=[a-z])/, "ii ").replace(/^(?:(?:1|i|first)\s+|1)(?=[a-z])/, "i ");
    return s.replace(/ /g, "-");
  }
  function findBooks(q) {
    const out = [];
    if (/[א-ת]/.test(q)) {
      const nq = q.replace(/["״׳']/g, "").trim();
      for (const [s, b] of Object.entries(INDEX.books)) if (b.he.replace(/["״׳']/g, "").startsWith(nq) || nq.startsWith(b.he.replace(/["״׳']/g, ""))) out.push(s);
      for (const [a, s] of Object.entries(HE_ALIASES)) if (a.startsWith(nq) && !out.includes(s)) out.push(s);
      return out;
    }
    const n = normEnBook(q);
    if (ABBR[n]) out.push(ABBR[n]);
    const m = n.match(/^(i|ii)-(.*)$/);
    if (m && ABBR[m[2]] == null) for (const s of ORDER) if (s.startsWith(m[1] + "-") && s.slice(m[1].length + 1).startsWith(m[2])) out.push(s);
    for (const s of ORDER) if (s.startsWith(n) && !out.includes(s)) out.push(s);
    // the site's names (Bereshit, Shmuel I, Divrei Hayamim II) and the older English (Genesis, I Samuel)
    const k = q.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k.length >= 3) for (const s of ORDER) if (!out.includes(s) && bookKeys(s).some((f) => f.startsWith(k))) out.push(s);
    if (!out.length && n.length >= 3) for (const s of ORDER) if (s.includes(n)) out.push(s);
    return [...new Set(out)];
  }
  function searchQuery(raw) {
    const q = raw.trim(); if (!q) return [];
    const res = [];
    const qn = q.toLowerCase().replace(/['’\s-]/g, "");
    for (const p of INDEX.parshiot) {
      const en = p.en.toLowerCase().replace(/['’\s-]/g, "");
      if ((qn.length >= 2 && en.startsWith(qn)) || (/[א-ת]/.test(q) && p.he.startsWith(q.replace(/^פרשת\s*/, ""))))
        res.push({ hash: `#parsha-${p.id}`, en: `Parashat ${p.en}`, he: `פרשת ${p.he}`, t: "Parsha" });
    }
    const m = q.match(/^(.*?)[\s,]*(\d+|[א-ת]{1,4}["״׳']?[א-ת]?)?(?:\s*[:., ]\s*(\d+|[א-ת]{1,4}["״׳']?[א-ת]?))?\s*$/);
    let bq = q, cq = null, vq = null;
    if (m && m[1] && m[2]) { bq = m[1]; cq = m[2]; vq = m[3] || null; }
    const num = (x) => (x == null ? null : /^\d+$/.test(x) ? +x : parseGematria(x));
    let books = findBooks(bq);
    let c = num(cq), v = num(vq);
    if (!books.length && cq) { books = findBooks(q); c = null; v = null; }
    for (const s of books.slice(0, 6)) {
      const b = book(s);
      if (c && c <= b.verses.length) {
        const vv = v && v <= b.verses[c - 1] ? v : null;
        res.unshift({ hash: chapterHash(s, c, vv), en: refEn(s, c, vv), he: refHe(s, c, vv), t: vv ? "Pasuk" : "Perek" });
      } else res.push({ hash: chapterHash(s, 1), en: b.en, he: b.he, t: "Sefer", book: s });
    }
    // a Hebrew name that ends in its number (שמואל א, מקבים ב, דברי הימים א) followed by a perek: that sefer first
    if (/[א-ת]/.test(q)) {
      const nq = q.replace(/["״׳']/g, "").replace(/\s+/g, " ").trim();
      for (const [s, b] of Object.entries(INDEX.books)) {
        const bh = b.he.replace(/["״׳']/g, "");
        if (!/ [אב]$/.test(bh) || !nq.startsWith(bh + " ")) continue;
        const mm = nq.slice(bh.length + 1).match(/^(\d+|[א-ת]{1,4})(?:\s*[:., ]\s*(\d+|[א-ת]{1,4}))?$/);
        if (!mm) continue;
        const cc = num(mm[1]), vv0 = num(mm[2]);
        if (!cc || cc > b.verses.length) continue;
        const vv = vv0 && vv0 <= b.verses[cc - 1] ? vv0 : null;
        const hash = chapterHash(s, cc, vv);
        for (let i = res.length - 1; i >= 0; i--) if (res[i].hash === hash) res.splice(i, 1);
        res.unshift({ hash, en: refEn(s, cc, vv), he: refHe(s, cc, vv), t: vv ? "Pasuk" : "Perek" });
      }
    }
    return res.slice(0, 10);
  }
  let searchSel = 0, searchRes = [];
  function renderSearch() {
    searchRes = searchQuery($("#searchInput").value);
    searchSel = 0;
    $("#searchResults").innerHTML = searchRes.map((r, i) => `<a href="${r.hash}" class="${i === 0 ? "active" : ""}" ${r.book ? `data-book="${r.book}"` : ""}><span><span class="t">${r.t}</span><br>${esc(r.en)}</span><span class="he">${esc(r.he)}</span></a>`).join("");
    $$("#searchResults [data-book]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); closeAllDialogs(); openPicker(a.dataset.book); }));
  }

  /* ───────── Settings dialog ───────── */
  function renderSettings() {
    const body = $("#settingsBody"), keepTop = body.scrollTop;
    requestAnimationFrame(() => { body.scrollTop = keepTop; });
    renderSettingsBody();
    body.scrollTop = keepTop;
  }
  const modeBoxOpen = { pages: null, scroll: null };   // opened / closed by the reader while the app is open
  function renderSettingsBody() {
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${settings[key] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const tog = (key, label) => `<label class="toggle"><span>${label}</span><input type="checkbox" data-key="${key}" ${settings[key] ? "checked" : ""}></label>`;
    const scroll = settings.view !== "pages";
    const sec = (en, he, body, id) => `<section class="set-sec"${id ? ` data-sec="${id}"` : ""}><h3><span class="en">${en}</span><span class="he">${he}</span></h3>${body}</section>`;
    // a box of settings for each layout: the one you're in is open, the other can be opened to set it up too
    const box = (mode, en, he, body) => {
      const open = modeBoxOpen[mode] != null ? modeBoxOpen[mode] : (mode === "pages") !== scroll;
      const here = (mode === "pages") !== scroll;
      return `<details class="mode-box" data-mode="${mode}" data-sec="${mode}"${open ? " open" : ""}>
        <summary><span class="mb-title"><span class="en">${en}</span>${here ? `<span class="mb-here">in use</span>` : ""}</span><span class="he">${he}</span></summary>
        <div class="mb-body">${body}</div></details>`;
    };
    const order = pgOrdered();
    const pagesBox = box("pages", "Pages mode", "מצב עמודים", `
      <section class="set-sec mb-wide"><h3><span class="en">Meforshim · show and order</span><span class="he">מפרשים</span></h3>
        <div class="pg-list">${order.map((c, i) => `
          <div class="pg-row" data-id="${c.id}">
            <span class="pg-ord">
              <button type="button" class="ord-btn" data-move="-1" aria-label="Move ${c.en} up" ${i === 0 ? "disabled" : ""}><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 6.4l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <button type="button" class="ord-btn" data-move="1" aria-label="Move ${c.en} down" ${i === order.length - 1 ? "disabled" : ""}><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.6l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </span>
            ${tog("pg_" + c.id, `<span class="tg2"><span class="he">${c.he}</span><small>${c.en}${c.note ? ` · ${c.note} only` : ""}</small></span>`)}
          </div>`).join("")}</div>
        <p class="set-note">Shown on each page in this order, top to bottom (right to left across the columns).</p></section>
      <section class="set-sec"><h3><span class="en">Letters</span><span class="he">כתב</span></h3>${tog("rashiScript", "Rashi script for the meforshim")}</section>`);
    const scrollBox = box("scroll", "Scroll mode", "מצב גלילה", `
      <section class="set-sec mb-wide"><h3><span class="en">Text layout</span><span class="he">פריסה</span></h3>
        ${seg("mode", [["side", "Side by side"], ["stack", "Stacked"], ["he", "עברית"], ["en", "English"]])}</section>
      <section class="set-sec"><h3><span class="en">Text</span><span class="he">טקסט</span></h3>
        ${tog("notes", "English footnotes")}
        ${tog("petuchot", "Parsha breaks (פ / ס)")}</section>
      <section class="set-sec"><h3><span class="en">Rashi</span><span class="he">רש״י</span></h3>
        ${tog("rashiOpen", "Always open")}
        ${tog("rashiEn", "English")}
        ${tog("rashiLines", "Line by line")}
        ${tog("rashiScript", "Rashi script")}</section>`);
    $("#settingsBody").innerHTML = `
      ${sec("Display", "תצוגה", `
        ${seg("view", [["scroll", "Scroll"], ["pages", "Pages · פסוק לעמוד"]])}
        ${seg("theme", [["paper", "Parchment"], ["white", "White"], ["dark", "Night"]])}`)}
      ${scroll ? scrollBox + pagesBox : pagesBox + scrollBox}
      ${sec("Text", "טקסט", `
        ${tog("nikkud", "Nikkud")}
        ${tog("taamim", "Ta'amim")}
        ${tog("sedarim", "Sedarim")}`)}
      ${sec("Torah reading", "קריאת התורה", `
        ${tog("maftir", "Maftir")}
        ${tog("weekday", "Weekday reading (Mon/Thu)")}
        ${tog("haftarah", "Haftarah")}
        ${settings.haftarah ? seg("haftCustom", [["a", "Ashkenazi"], ["s", "Sephardi"]]) : ""}`)}
      ${sec("Copying", "העתקה", seg("copyFmt", [["both", "Hebrew + English"], ["he", "Hebrew only"]]))}
      ${sec("Offline", "ללא חיבור", `<a class="set-link" href="#offline">Download sefarim for offline reading →</a>`)}`;
    // remember only what the reader opens or closes (drawing the panel also fires "toggle")
    $$("#settingsBody details.mode-box > summary").forEach((sm) => sm.addEventListener("click", () => { const d = sm.parentElement; modeBoxOpen[d.dataset.mode] = !d.open; }));
    $$("#settingsBody .ord-btn").forEach((btn) => btn.addEventListener("click", () => {
      const ids = pgOrdered().map((c) => c.id), id = btn.closest(".pg-row").dataset.id;
      const i = ids.indexOf(id), j = i + +btn.dataset.move;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const spot = captureSpot();
      // the row moves in place (the panel isn't drawn again, so nothing in it flickers)
      const row = btn.closest(".pg-row"), list = row.parentElement, other = list.querySelector(`.pg-row[data-id="${ids[i]}"]`);
      if (j < i) list.insertBefore(row, other); else list.insertBefore(other, row);
      const rows = [...list.children];
      rows.forEach((r, k) => { r.querySelector('[data-move="-1"]').disabled = k === 0; r.querySelector('[data-move="1"]').disabled = k === rows.length - 1; });
      settings.pg_order = ids; saveSettings(); afterSettingChange("pg_order", spot);
      if (btn.disabled) { const alt = row.querySelector(`.ord-btn[data-move="${-btn.dataset.move}"]`); if (alt) alt.focus({ preventScroll: true }); }
    }));
    $$("#settingsBody .seg").forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || settings[s.dataset.key] === b.dataset.v) return;
      const spot = captureSpot(), key = s.dataset.key;
      $$("button", s).forEach((x) => x.classList.toggle("on", x === b));       // in place: the panel isn't drawn again
      settings[key] = b.dataset.v; saveSettings();
      if (key === "view") renderSettings();                                 // the layout boxes change places
      afterSettingChange(key, spot);
    }));
    $$("#settingsBody input[type=checkbox]").forEach((i) => i.addEventListener("change", () => {
      const spot = captureSpot();
      $$(`#settingsBody input[data-key="${i.dataset.key}"]`).forEach((x) => { x.checked = i.checked; });   // Rashi script is in both boxes
      settings[i.dataset.key] = i.checked; saveSettings(); afterSettingChange(i.dataset.key, spot);
      if (i.dataset.key === "haftarah") renderSettings();
    }));
  }
  /* Scroll ⇄ Pages (see morphLayout for how the change is shown) */
  let quietShow = false, layoutSwitch = null;   // the running Scroll ⇄ Pages switch (a promise)
  /* the pasuk a switch from Scroll opens on */
  function switchTarget() {
    let pos = readerState.lastPos || { s: readerState.slug, c: current.c || 1, v: 1 };
    // a pasuk you've just picked (highlighted) and can see wins over the one at the top of the screen
    const sel = readerState.sel, selRow = sel && !PG && $(`#v-${sel.s}-${sel.c}-${sel.v}`);
    if (selRow && !selRow.closest(".haftarah") && sel.s === readerState.slug) {
      const rc = selRow.getBoundingClientRect();
      if (rc.bottom > $(".topbar").getBoundingClientRect().bottom + 10 && rc.top < innerHeight - 40) pos = { s: sel.s, c: sel.c, v: sel.v };
    }
    return pos;
  }
  let switchPos = null;
  function switchLayout() {
    const pos = switchPos || switchTarget(); switchPos = null;
    const slug = readerState.slug;
    if (settings.view === "pages") {
      // Scroll → Pages: open on the pasuk at the top of the screen (or its haftarah page)
      // (on the haftarah: its page for the same haftarah pasuk)
      if (pos.haft && pos.pid) {
        const p = INDEX.parshiot.find((x) => x.id === pos.pid);
        current = { view: "chapter", slug, c: p.range[3], v: null, pgHaft: pos.pid, pgHaftAt: pos.at || { s: pos.s, c: pos.c, v: pos.v } };
      } else current = { view: "chapter", slug, c: pos.c, v: pos.v };
      suppressOpen = true; return renderReader(current);
    } else {
      // Pages → Scroll: put the same pasuk at the top of the screen, with nothing highlighted or opened
      const it = PG && PG.items[PG.idx];
      const top = $(".topbar").getBoundingClientRect().bottom + ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight) + 10;
      if (it && it.type === "haft") {
        // the haftarah card at the end of the parsha, opened, with the same haftarah pasuk at the top
        const p = INDEX.parshiot.find((x) => x.id === it.pid);
        pendingHaftOpen = it.pid;
        pendingAnchor = { s: it.s, c: it.c, v: it.v, top };
        current = { view: "chapter", slug, c: p.range[3], v: null };
        history.replaceState(null, "", chapterHash(slug, p.range[3]));
        suppressOpen = true; return renderReader(current);
      }
      const pIt = it && it.type === "intro" && it.parsha ? INDEX.parshiot.find((x) => x.id === it.parsha) : null;
      const c = it && it.type === "pasuk" ? it.c : pIt ? pIt.range[1] : 1, v = it && it.type === "pasuk" ? it.v : pIt ? pIt.range[2] : 1;
      pendingAnchor = it && (it.type === "pasuk" || pIt) ? { s: slug, c, v, top } : null;
      current = { view: "chapter", slug, c, v: null };
      history.replaceState(null, "", chapterHash(slug, c, it && (it.type === "pasuk" || pIt) ? v : null));
      suppressOpen = true; return renderReader(current);
    }
  }
  /* the web fonts a layout uses, loaded before it is drawn: a font arriving later re-flows the text
     (and, in Pages, the page breaks), which shows as a jump just after the switch */
  const FONT_SAMPLE = "אבג בְּרֵאשִׁ֖ית Ab ’“—–ĀāḤḥŠšÉé";
  const FONT_FACES = {
    // the rest of what Scroll and Pages use, so no font arrives after the page is shown (and moves the text)
    all: ['600 1em "Noto Serif Hebrew"', '500 1em "Frank Ruhl Libre"', '900 1em "Frank Ruhl Libre"', '500 1em "EB Garamond"', '600 1em "EB Garamond"',
      '400 1em "IBM Plex Sans"', '500 1em "IBM Plex Sans"', '600 1em "IBM Plex Sans"', '400 1em "IBM Plex Sans Hebrew"', '500 1em "IBM Plex Sans Hebrew"', '600 1em "Noto Rashi Hebrew"'],
    pages: ['400 1em "Noto Rashi Hebrew"', '600 1em "Noto Rashi Hebrew"', '500 1em "Frank Ruhl Libre"', '700 1em "Frank Ruhl Libre"', '400 1em "Noto Serif Hebrew"', '400 1em "EB Garamond"', 'italic 400 1em "EB Garamond"'],
    scroll: ['400 1em "Noto Serif Hebrew"', '500 1em "Noto Serif Hebrew"', '400 1em "Frank Ruhl Libre"', '700 1em "Frank Ruhl Libre"', '400 1em "EB Garamond"', 'italic 400 1em "EB Garamond"', '400 1em "Noto Rashi Hebrew"'],
  };
  const fontsAsked = new Set();
  function fontsLoaded(kind) {
    if (!document.fonts || !document.fonts.check) return true;
    try { return [...FONT_FACES[kind], ...FONT_FACES.all].every((f) => document.fonts.check(f, FONT_SAMPLE)); } catch { return false; }
  }
  function fontsReady(kind, wait = 1500) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const jobs = [...FONT_FACES[kind], ...FONT_FACES.all].map((f) => { fontsAsked.add(f); return document.fonts.load(f, FONT_SAMPLE).catch(() => {}); });
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, wait))]);
  }
  /* Scroll ⇄ Pages: everything the other layout needs is loaded first (texts, commentaries, fonts), then
     the page fades out, the layout is swapped while nothing shows, and the new one fades in. One layout
     never shows through the other (a cross-fade of two pages of text looks like a flicker) and nothing on
     the page is transformed (a transform would move the fixed page controls for the length of the fade). */
  /* Changing view (Home ⇄ a sefer, Scroll ⇄ Pages): a plain sheet in the page's colour fades in over the
     page, the new view is drawn and scrolled into place under it, and the sheet fades away. The text is
     never faded itself: fading a whole page of text makes the browser (Safari above all) repaint it into
     a layer of its own and back, which flashes; one view showing through the other looks like a flicker;
     and a page drawn first and moved after is a jump. The parts of the top bar that change fade with it. */
  const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  let veilUp = false;
  function veilTo(on, ms, fadeBar = true) {
    let v = document.getElementById("veil");
    if (!v) { v = document.createElement("div"); v.id = "veil"; v.setAttribute("aria-hidden", "true"); document.body.append(v); }
    // the centre of the top bar fades with the sheet when what it shows changes (Home ⇄ a sefer); switching
    // Scroll ⇄ Pages it shows the same place before and after, so it stays perfectly still
    const nav = fadeBar || !on ? $(".nav-center") : null;
    if (reduceMotion()) ms = 0;
    veilUp = on;
    return new Promise((res) => {
      const tr = ms ? `opacity ${ms}ms ${on ? "ease-in" : "ease-out"}` : "none";
      v.style.transition = tr; if (nav) nav.style.transition = tr;
      if (on) v.style.visibility = "visible";
      void v.offsetWidth;
      v.style.opacity = on ? "1" : "0"; if (nav) nav.style.opacity = on ? "0" : "";
      setTimeout(async () => {
        if (on) {   // fully up (a busy page can run a fade late) and that frame shown, before anything changes under it
          const t0 = performance.now();
          while (parseFloat(getComputedStyle(v).opacity) < .99 && performance.now() - t0 < 400) await frames(1);
          await frames(1);
        } else if (!veilUp) v.style.visibility = "hidden";
        res();
      }, ms + 16);
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  /* Scroll ⇄ Pages: everything the other layout needs is loaded first (texts, commentaries, fonts), so the
     swap under the veil is instant */
  async function morphLayout(update) {
    const mark = (n) => { try { performance.mark("layout-" + n); } catch {} };
    mark("start");
    const slug = readerState && readerState.slug;
    const jobs = [fontsReady(settings.view === "pages" ? "pages" : "scroll")];
    if (slug) {
      jobs.push(loadText(slug), loadLex());
      const comms = settings.view === "pages" ? pgComms(slug) : COMMENTARIES.filter((c) => c.id === ((readerState && readerState.tab) || "rashi") && avail(c, slug));
      for (const c of comms) {
        jobs.push(loadComm(c.id, slug)); if (c.enDir) jobs.push(loadCommEn(c.id, slug));
        if (settings.view === "pages" && c.introDir && INDEX.intros && (INDEX.intros[c.id] || []).includes(slug)) jobs.push(fetchJSON(c.introDir + slug + ".json"));
      }
    }
    let done; layoutSwitch = new Promise((r) => (done = r));
    quietShow = true;
    const slow = setTimeout(() => toast("Loading…"), 450);
    try {
      // everything the other layout needs is in memory first (the page you're on stays as it is meanwhile); then
      // the swap is made in one go — the next frame shows the other layout at the same place. No sheet fades over
      // the page (that was a blink of its own), and nothing is seen half drawn.
      const pos = settings.view === "pages" && readerState && !PG ? (switchPos = switchTarget()) : null;
      await Promise.allSettled(jobs);
      mark("data");
      if (pos && !pos.haft && warmKey !== `${pos.s}:${pos.c}:${pos.v}`) warmPasuk(pos.s, pos.c, pos.v);
      clearTimeout(slow);
      mark("hidden");
      await update();
      mark("updated");
    } finally {
      quietShow = false; clearTimeout(slow);
      mark("done"); done(); layoutSwitch = null;
    }
  }
  /* ── keeping your place when a setting changes ── */
  function captureSpot() {
    if (PG && $(".pager")) return { pages: pagerSpot() };
    if (readerState && $(".reader")) return { scroll: win.anchorAt() };
    return null;
  }
  function restoreSpot(a) {
    if (!a) return;
    if (a.pages) { if (PG && $(".pager")) pagerReanchor(a.pages); return; }
    win.restore(a.scroll, true);
  }
  const itemIdent = (it) => it && ({ type: it.type, key: it.key, parsha: it.parsha, c: it.c, v: it.v, pid: it.pid, s: it.s });
  const sameItem = (it, id) => it.type === id.type && (id.type === "intro" ? it.key === id.key
    : id.type === "haft" ? it.pid === id.pid && it.s === id.s && it.c === id.c && it.v === id.v : it.c === id.c && it.v === id.v);
  function pagerSpot() {
    const spot = { ident: itemIdent(PG.items[PG.idx]), page: PG.page };
    const first = $$("#pgFlow .ph").find((x) => pageOf(x) === PG.page);
    const bl = first && first.closest("[data-anchor]");
    if (bl) { spot.block = bl.dataset.anchor; spot.k = $$(".ph", bl).indexOf(first); }
    if (PG.active != null) {
      const el = $(`#pgStage .ph[data-p="${PG.active}"]`), ab = el && el.closest("[data-anchor]");
      if (ab) spot.active = { block: ab.dataset.anchor, k: $$(".ph", ab).indexOf(el) };
      else if (el && el.closest("#pgTop")) spot.active = { top: true, k: $$("#pgTop .ph").indexOf(el) };
    }
    return spot;
  }
  function pagerReanchor(spot) {
    pagerLayout(false);
    let pg = spot.page;
    const bl = spot.block && $(`#pgFlow [data-anchor="${spot.block}"]`);
    if (bl) { const phs = $$(".ph", bl); const ph = phs[Math.min(spot.k || 0, phs.length - 1)]; if (ph) pg = pageOf(ph); }
    PG.page = Math.max(0, Math.min(pg, PG.pages - 1)); pagerMove(false);
    if (spot.active) {
      let el = null;
      if (spot.active.top) el = $$("#pgTop .ph")[spot.active.k];
      else { const ab = $(`#pgFlow [data-anchor="${spot.active.block}"]`); if (ab) el = $$(".ph", ab)[spot.active.k]; }
      if (el) showPhrase(+el.dataset.p);
    }
  }
  /* redraw the current page in place (optionally rebuilding the list of pages first) */
  function pagerRefresh(spot, rebuild) {
    if (!PG || !$(".pager")) return;
    if (rebuild) buildPagerItems();
    const id = spot.ident;
    let i = PG.items.findIndex((it) => sameItem(it, id));
    if (i < 0) {   // what this page was is gone (haftarah or introductions switched off): the nearest pasuk
      const p = id.parsha || id.pid ? INDEX.parshiot.find((x) => x.id === (id.parsha || id.pid)) : null;
      const [c, v] = id.type === "haft" && p ? [p.range[3], p.range[4]] : p ? [p.range[1], p.range[2]] : id.type === "intro" ? [1, 1] : [id.c, id.v];
      i = PG.items.findIndex((it) => it.type === "pasuk" && it.c === c && it.v === v);
      if (i < 0) i = PG.firstPasuk;
      spot = { ident: itemIdent(PG.items[i]), page: 0 };
    }
    quietShow = true; try { pagerShow(i, 0); } finally { quietShow = false; }
    pagerReanchor(spot);
  }
  async function refreshPagerComms(spot) {
    const slug = PG.slug, comms = pgComms(slug);
    await Promise.allSettled(comms.flatMap((c) => [loadComm(c.id, slug), c.enDir ? loadCommEn(c.id, slug) : null,
      c.introDir && INDEX.intros && (INDEX.intros[c.id] || []).includes(slug) && !PG.intros[c.id]
        ? fetchJSON(c.introDir + slug + ".json").then((d) => { if (PG) PG.intros[c.id] = d; }) : null]));
    if (!PG || PG.slug !== slug) return;
    PG.comms = comms;
    pagerRefresh(spot, true);
  }
  function openSettings(section) {
    renderSettings(); openDialog("#settingsOverlay");
    if (section) { const el = $(`#settingsBody [data-sec="${section}"]`); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1200); } }
  }
  function afterSettingChange(key, spot) {
    if (key === "view") {
      if (readerState && current && current.view !== "home") morphLayout(switchLayout);
      return;
    }
    if (key === "copyFmt") { updateCopyBar(); return; }
    if (!readerState || !current || current.view === "home") return;
    if (PG && $(".pager")) {
      // Pages: only what the page shows is redrawn, and you stay on the same page and phrase
      if (key.startsWith("pg_")) refreshPagerComms(spot ? spot.pages : pagerSpot());
      else if (["nikkud", "taamim", "sedarim", "maftir", "weekday"].includes(key)) { pagerRefresh(spot ? spot.pages : pagerSpot(), false); updateAliyahBtn(readerState.lastPos); }
      else if (key === "haftarah" || key === "haftCustom") pagerRefresh(spot ? spot.pages : pagerSpot(), true);
      else if (key === "rashiScript" && spot) restoreSpot(spot);       // a different font: same text, measured again
      return;                                                         // theme and the like: nothing on the page moves
    }
    // Scroll: the change and the page put back in place happen in the same moment (one frame, the final one)
    const keep = () => restoreSpot(spot);
    if (["nikkud", "taamim", "petuchot", "sedarim"].includes(key)) rerenderKeepingPlace();
    else if (key === "weekday" || key === "maftir") { paintAliyot(); updateAliyahBtn(readerState.lastPos); keep(); }
    else if (key === "rashiLines" || key === "rashiOpen" || key === "rashiEn") {
      if (key === "rashiOpen" && !settings.rashiOpen) readerState.open.clear();
      renderReaderTools(); repaintComm(spot);
    }
    else if (key === "haftarah" || key === "haftCustom") rerenderKeepingPlace();
    else keep();                                                      // layout and font choices: same pasuk, same height on screen
  }

  /* ───────── Dialog plumbing ───────── */
  function openDialog(sel) { closeAllDialogs(); $(sel).hidden = false; document.body.style.overflow = "hidden"; }
  function closeAllDialogs() { $$(".overlay").forEach((o) => (o.hidden = true)); document.body.style.overflow = ""; }

  function wireChrome() {
    $("#pickerBtn").addEventListener("click", () => {
      const s = current && (current.slug || (current.p && current.p.range[0]));
      openPicker(s || null);
    });
    $("#pickerBack").addEventListener("click", showBooks);
    $("#searchBtn").addEventListener("click", () => { openDialog("#searchOverlay"); $("#searchInput").value = ""; renderSearch(); setTimeout(() => $("#searchInput").focus(), 30); });
    $("#settingsBtn").addEventListener("click", () => openSettings());
    $("#copyModeBtn").addEventListener("click", () => setCopyMode(!copyMode));
    $("#layoutBtn").addEventListener("click", () => {
      settings.view = settings.view === "pages" ? "scroll" : "pages"; saveSettings();
      afterSettingChange("view");
    });
    $("#aliyahBtn").addEventListener("click", openAliyahMenu);
    $("#copyExit").addEventListener("click", () => setCopyMode(false));
    $("#copySelBtn").addEventListener("pointerdown", (e) => { copyBtnDownAt = Date.now(); e.preventDefault(); });
    $("#copySelBtn").addEventListener("mousedown", (e) => e.preventDefault());
    $("#copyFill").addEventListener("click", fillPicks);
    $("#copyClear").addEventListener("click", clearPicks);
    $("#copySelBtn").addEventListener("click", () => {
      const r = selectionInContent(window.getSelection()) || savedRange;
      if (!r && picks.size) { copyPicks(); return; }
      if (!r) { toast("Select some text first"); return; }
      if (readerState && !copyReady(readerState.slug)) { preloadForCopy().then(() => copyBlocks(buildBlocks(unitsFromRange(r)))); return; }
      copyBlocks(buildBlocks(unitsFromRange(r)));
    });
    $("#copybar .seg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      settings.copyFmt = b.dataset.v; saveSettings(); updateCopyBar();
    });
    $$(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) closeAllDialogs(); }));
    $$(".overlay").forEach((o) => o.addEventListener("click", (e) => { const a = e.target.closest("a[href^='#']"); if (a && !a.dataset.book) closeAllDialogs(); }));
    $("#searchInput").addEventListener("input", renderSearch);
    $("#searchInput").addEventListener("keydown", (e) => {
      const links = $$("#searchResults a");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!links.length) return;
        searchSel = (searchSel + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle("active", i === searchSel));
      }
    });
    $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); const link = $$("#searchResults a")[searchSel]; if (link) link.click(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllDialogs();
      const typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if (!typing && e.key === "/") { e.preventDefault(); $("#searchBtn").click(); }
    });
    $("[data-home]").addEventListener("click", (e) => { e.preventDefault(); if (location.hash) location.hash = ""; else route(); });
    window.addEventListener("hashchange", route);
  }

  /* ───────── Boot ───────── */

  /* ───────── Offline: a service worker keeps the site, and whatever you download, on this device ─────────
     Downloads live in the "tanach-data" cache; data/manifest.json gives each file's size and fingerprint,
     so changed files are noticed and fetched again. Inside Claude (a sandboxed frame) service workers are
     refused, so the page explains where offline reading works. */
  const SITE_URL = "https://rafidavidneville-code.github.io/tanach/";
  const DATA_CACHE = "tanach-data", FONT_CACHE = "tanach-fonts";
  const OFF = { ok: false, why: "", man: null, have: null, busy: null, init: null };
  async function initOffline() {
    if (!("serviceWorker" in navigator) || !("caches" in window)) { OFF.why = "unsupported"; return; }
    try { await navigator.serviceWorker.register("sw.js"); OFF.ok = true; }
    catch { OFF.why = "blocked"; return; }
    // the site opens from its saved copy; when a newer one has just been fetched, offer it
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "updated") toast("A new version of the site is ready", { label: "Reload", run: () => { savePlaceNow(); location.reload(); } });
    });
    setTimeout(() => syncDownloads().catch(() => {}), 5000);
  }
  const absUrl = (p) => new URL(p, location.href).href;
  async function loadManifest(fresh) {
    if (OFF.man && !fresh) return OFF.man;
    const r = await fetch("data/manifest.json", { cache: fresh ? "no-cache" : "default" });
    if (!r.ok) throw new Error("manifest");
    return (OFF.man = await r.json());
  }
  /* path → fingerprint of every file in the offline copy */
  async function downloadedFiles() {
    const cache = await caches.open(DATA_CACHE), have = new Map();
    const base = absUrl("./");
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      have.set(req.url.replace(base, "").split("?")[0], res ? res.headers.get("x-hash") || "" : "");
    }
    return (OFF.have = have);
  }
  /* what can be downloaded for a sefer */
  const DL_KINDS = () => [
    { id: "text", en: "Tanach text", sub: "Hebrew + English", he: "מקרא", files: (s) => [`data/text/${s}.json`] },
    ...COMMENTARIES.map((c) => ({ id: c.id, en: c.en, sub: c.note ? `with English · ${c.note} only` : "with English", he: c.he,
      files: (s) => avail(c, s) ? [c.dir + s + ".json", c.enDir && c.enDir + s + ".json", c.introDir && INDEX.intros && (INDEX.intros[c.id] || []).includes(s) && c.introDir + s + ".json"].filter(Boolean) : [] })),
  ];
  const filesFor = (slugs, kinds) => {
    const man = OFF.man ? OFF.man.files : {}, out = new Set();
    for (const s of slugs) for (const k of DL_KINDS()) if (kinds.has(k.id)) for (const f of k.files(s)) if (man[f]) out.add(f);
    return [...out];
  };
  const sizeOf = (files) => files.reduce((t, f) => t + ((OFF.man && OFF.man.files[f]) ? OFF.man.files[f][0] : 0), 0);
  const fmtMB = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  const fileState = (f) => { const h = OFF.have && OFF.have.get(f); return h == null ? "missing" : h === OFF.man.files[f][1] ? "ok" : "old"; };

  async function fetchToCache(files, onStep, signal) {
    const cache = await caches.open(DATA_CACHE), queue = [...files];
    const worker = async () => {
      while (queue.length) {
        if (signal && signal.aborted) throw new DOMException("cancelled", "AbortError");
        const f = queue.shift(), [size, hash] = OFF.man.files[f];
        const res = await fetch(`${f}?dl=${hash}`, { cache: "no-cache", signal });
        if (!res.ok) throw new Error(f);
        const body = await res.blob();
        await cache.put(absUrl(f), new Response(body, { headers: { "content-type": "application/json", "x-hash": hash } }));
        OFF.have && OFF.have.set(f, hash);
        onStep && onStep(size);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  /* the fonts, so the text looks the same offline */
  async function cacheFonts() {
    const link = $('link[href^="https://fonts.googleapis.com/css2"]'); if (!link) return;
    const cache = await caches.open(FONT_CACHE);
    const r = await fetch(link.href, { mode: "cors" }); if (!r.ok) return;
    const css = await r.clone().text();
    await cache.put(link.href, r);
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]))];
    const missing = [];
    for (const u of urls) if (!(await cache.match(u))) missing.push(u);
    await Promise.all(missing.map((u) => fetch(u, { mode: "cors" }).then((x) => x.ok && cache.put(u, x)).catch(() => {})));
  }
  /* when online, quietly refresh downloaded files that have changed */
  async function syncDownloads() {
    if (!OFF.ok || !navigator.onLine) return;
    const have = await downloadedFiles(); if (!have.size) return;
    const man = await loadManifest(true);
    const old = [...have].filter(([f, h]) => man.files[f] && man.files[f][1] !== h).map(([f]) => f);
    if (old.length) { await fetchToCache(old); if (current && current.view === "offline") renderOffline(); }
  }

  function renderOffline() {
    leavePages();
    document.title = "Read offline — Tanach Reader";
    setPicker(null);
    const app = $("#app");
    const head = (en, he) => `<div class="section-head"><h2>${esc(en)}</h2><span class="he">${esc(he)}</span></div>`;
    const intro = `<section class="hero off-hero"><h1 class="off-h1">קריאה ללא חיבור</h1><p class="sub">Read offline</p>
      <p class="intro">Choose what to keep on this device. Once it's downloaded, those sefarim open without an internet connection.</p></section>`;
    if (OFF.init && !OFF.ok && !OFF.why) {   // still starting up
      app.innerHTML = `<div class="home offline">${intro}<div class="loading">טוען…</div></div>`;
      OFF.init.finally(() => { if (current && current.view === "offline") renderOffline(); });
      return;
    }
    if (!OFF.ok) {
      app.innerHTML = `<div class="home offline">${intro}<div class="off-note">${OFF.why === "blocked"
        ? `Offline downloads work on the website itself, not inside Claude. Open <a href="${SITE_URL}#offline" target="_blank" rel="noopener">${SITE_URL.replace("https://", "")}</a> and download from there.`
        : `This browser can't keep the site offline. Try a current version of Safari, Chrome, Edge or Firefox.`}</div></div>`;
      window.scrollTo(0, 0); return;
    }
    app.innerHTML = `<div class="home offline">${intro}<div class="loading">טוען…</div></div>`;
    Promise.all([loadManifest(), downloadedFiles()]).then(() => { if (current && current.view === "offline") drawOffline(); })
      .catch(() => { $(".offline .loading").outerHTML = `<div class="off-note">Couldn't reach the list of files. Connect to the internet and try again.</div>`; });
    window.scrollTo(0, 0);

    function drawOffline() {
      const sel = new Set(store.get("dlSel", ORDER));
      const kinds = new Set(store.get("dlKinds", DL_KINDS().map((k) => k.id)));
      const save = () => { store.set("dlSel", [...sel]); store.set("dlKinds", [...kinds]); };
      const tileState = (s) => {
        const fs = filesFor([s], kinds); if (!fs.length) return "";
        const st = fs.map(fileState);
        return st.every((x) => x === "ok") ? "ok" : st.includes("old") ? "old" : st.some((x) => x === "ok") ? "part" : "";
      };
      const badge = { ok: "✓", old: "↻", part: "◐", "": "" };
      const groups = INDEX.sections.map((sec) => `
        <div class="off-sec">
          <div class="off-sec-head"><label class="off-check"><input type="checkbox" data-secsel="${sec.id}"><span class="he">${esc(sec.he)}</span><span class="en">${esc(sec.en)}</span></label></div>
          <div class="off-books">${sec.groups.flatMap((g) => g.books).map((s) => {
            const st = tileState(s), size = sizeOf(filesFor([s], kinds));
            return `<label class="off-book ${st ? "st-" + st : ""}" title="${esc(book(s).en)}"><input type="checkbox" data-s="${s}" ${sel.has(s) ? "checked" : ""}>
              <span class="he">${esc(book(s).he)}</span><span class="en">${esc(book(s).en)}</span><span class="sz">${fmtMB(size)}</span><span class="bd" aria-label="${st}">${badge[st]}</span></label>`;
          }).join("")}</div>
        </div>`).join("");
      const kindRows = DL_KINDS().map((k) => {
        const size = sizeOf(filesFor(ORDER, new Set([k.id])));
        return `<label class="toggle off-kind"><span><b>${esc(k.en)}</b> <span class="he">${esc(k.he)}</span><small>${esc(k.sub)} · ${fmtMB(size)} in all</small></span><input type="checkbox" data-kind="${k.id}" ${kinds.has(k.id) ? "checked" : ""} ${k.id === "text" ? "disabled checked" : ""}></label>`;
      }).join("");
      const haveAll = [...OFF.have.keys()].filter((f) => OFF.man.files[f]);
      const haveSize = sizeOf(haveAll);
      app.innerHTML = `<div class="home offline">${intro}
        <section class="section">${head("What to include", "מה להוריד")}<div class="off-kinds">${kindRows}</div></section>
        <section class="section">${head("Which sefarim", "אילו ספרים")}
          <div class="off-quick">
            <button type="button" class="chip" data-quick="all">Everything · הכל</button>
            ${INDEX.sections.map((sec) => `<button type="button" class="chip" data-quick="${sec.id}">${esc(sec.en)} · ${esc(sec.he)}</button>`).join("")}
            <button type="button" class="chip" data-quick="none">Clear</button>
          </div>
          ${groups}
          <p class="off-legend">✓ downloaded · ◐ partly · ↻ an update is waiting</p>
          ${kinds.size && [...sel].some((s) => book(s).section === "torah") && settings.haftarah ? `<p class="off-tip">Haftarot come from Nevi'im — include those sefarim to read the haftarah offline too.</p>` : ""}
        </section>
        <section class="section">${head("On this device", "במכשיר זה")}
          <p class="off-have" id="offHave">${haveAll.length ? `${fmtMB(haveSize)} downloaded` : "Nothing downloaded yet."} <span id="offQuota"></span></p>
          <div class="off-actions">
            <button type="button" class="chip" id="offRemoveSel" ${haveAll.length ? "" : "disabled"}>Remove selected</button>
            <button type="button" class="chip" id="offRemoveAll" ${haveAll.length ? "" : "disabled"}>Remove everything</button>
          </div>
          <p class="off-tip">On an iPhone or iPad, add the site to your Home Screen (Share → Add to Home Screen) and open it from there — Safari can clear the saved copy of websites you haven't opened for a while.</p>
        </section>
        <div class="off-bar" id="offBar"></div>
      </div>`;
      const todo = () => filesFor([...sel], kinds).filter((f) => fileState(f) !== "ok");
      const drawBar = () => {
        const t = todo(), size = sizeOf(t), bar = $("#offBar");
        if (OFF.busy) return;
        bar.innerHTML = `<div class="off-bar-in"><span class="off-sum">${sel.size} ${sel.size === 1 ? "sefer" : "sefarim"} selected · ${t.length ? `${fmtMB(size)} to download` : "all downloaded"}</span>
          <button type="button" class="off-go" id="offGo" ${t.length ? "" : "disabled"}>${t.some((f) => fileState(f) === "old") && t.every((f) => fileState(f) !== "missing") ? "Update" : "Download"}</button></div>`;
        $("#offGo").addEventListener("click", startDownload);
      };
      const syncSecBoxes = () => INDEX.sections.forEach((sec) => {
        const bs = sec.groups.flatMap((g) => g.books), n = bs.filter((s) => sel.has(s)).length, box = $(`[data-secsel="${sec.id}"]`);
        box.checked = n === bs.length; box.indeterminate = n > 0 && n < bs.length;
      });
      syncSecBoxes(); drawBar();
      $$("[data-s]", app).forEach((i) => i.addEventListener("change", () => { i.checked ? sel.add(i.dataset.s) : sel.delete(i.dataset.s); save(); syncSecBoxes(); drawBar(); }));
      $$("[data-secsel]", app).forEach((i) => i.addEventListener("change", () => {
        INDEX.sections.find((x) => x.id === i.dataset.secsel).groups.flatMap((g) => g.books).forEach((s) => i.checked ? sel.add(s) : sel.delete(s));
        save(); drawOffline();
      }));
      $$("[data-kind]", app).forEach((i) => i.addEventListener("change", () => { i.checked ? kinds.add(i.dataset.kind) : kinds.delete(i.dataset.kind); kinds.add("text"); save(); drawOffline(); }));
      $$("[data-quick]", app).forEach((b) => b.addEventListener("click", () => {
        const q = b.dataset.quick; sel.clear();
        if (q === "all") ORDER.forEach((s) => sel.add(s));
        else if (q !== "none") INDEX.sections.find((x) => x.id === q).groups.flatMap((g) => g.books).forEach((s) => sel.add(s));
        save(); drawOffline();
      }));
      $("#offRemoveSel").addEventListener("click", async () => {
        const fs = filesFor([...sel], kinds).filter((f) => OFF.have.has(f)); if (!fs.length) { toast("Nothing selected is downloaded"); return; }
        const cache = await caches.open(DATA_CACHE); await Promise.all(fs.map((f) => cache.delete(absUrl(f))));
        await downloadedFiles(); toast(`Removed ${fmtMB(sizeOf(fs))}`); drawOffline();
      });
      $("#offRemoveAll").addEventListener("click", async () => {
        await caches.delete(DATA_CACHE); await downloadedFiles(); toast("Removed all downloads"); drawOffline();
      });
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { const q = $("#offQuota"); if (q && e.quota) q.textContent = `· this site may use up to ${fmtMB(e.quota)}`; }).catch(() => {});

      async function startDownload() {
        const files = todo(); if (!files.length) return;
        const total = sizeOf(files); let got = 0;
        const ctl = new AbortController(); OFF.busy = ctl;
        const bar = $("#offBar");
        bar.innerHTML = `<div class="off-bar-in"><span class="off-sum" id="offProg">Downloading… 0 of ${fmtMB(total)}</span><div class="off-meter"><i id="offMeter"></i></div><button type="button" class="off-go ghost" id="offCancel">Cancel</button></div>`;
        $("#offCancel").addEventListener("click", () => ctl.abort());
        try {
          if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
          await Promise.all([cacheFonts().catch(() => {}), caches.open("tanach-shell-v2").then((c) => c.addAll(["./", "index.html", "app.js", "styles.css", "data/index.json", "data/manifest.json", "data/lex.json", "data/shabbat-il.json"])).catch(() => {})]);
          await fetchToCache(files, (n) => {
            got += n; const pct = Math.min(100, Math.round(100 * got / total));
            const pr = $("#offProg"), m = $("#offMeter"); if (pr) pr.textContent = `Downloading… ${fmtMB(got)} of ${fmtMB(total)}`; if (m) m.style.width = pct + "%";
          }, ctl.signal);
          OFF.busy = null; toast(`Downloaded ${fmtMB(total)} — ready offline`);
        } catch (e) {
          OFF.busy = null;
          toast(e && e.name === "AbortError" ? "Download stopped — what finished is kept" : navigator.onLine ? "Download failed — try again" : "You're offline — connect and try again");
        }
        await downloadedFiles();
        if (current && current.view === "offline") drawOffline();
      }
    }
  }
  // for checking the phrase matching from tests (no effect on the page)
  window.__tanachDebug = { commParts, commUnits, splitPhrases, alignPhrases, alignComment, sentencesOf, extractDH, heComm, boldSeq, unB, loadLex, lexMatrix, setLexW: (w) => { LEX_W = w; } };
  async function boot() {
    applySettings();
    wireChrome();
    $("#app").innerHTML = `<div class="loading">טוען…</div>`;
    try { INDEX = await fetchJSON("data/index.json"); }
    catch (e) { $("#app").innerHTML = `<div class="error-box"><p>Couldn't load the Tanach index.</p></div>`; return; }
    ORDER = INDEX.sections.flatMap((s) => s.groups.flatMap((g) => g.books));
    buildMarks();
    buildSedarim();
    OFF.init = initOffline();
    const back = takePlace();
    if (back) { pendingAnchor = { s: back.s, c: back.c, v: back.v, top: back.top }; suppressOpen = true; restoreSel = back.sel || null; }
    route();
  }
  boot();
})();
