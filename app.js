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

  /* ───────── Commentaries registry (add more here later) ───────── */
  const COMMENTARIES = [
    { id: "rashi", he: "רש״י", en: "Rashi", dir: "data/rashi/", enDir: "data/rashi-en/" },
    { id: "ramban", he: "רמב״ן", en: "Ramban", dir: "data/ramban/", enDir: "data/ramban-en/", introDir: "data/ramban-intro/", enSrc: "Chavel" },
    { id: "bachya", he: "רבנו בחיי", heIntro: "הקדמת רבנו בחיי", en: "Rabbeinu Bachya", dir: "data/bachya/", enDir: "data/bachya-en/", introDir: "data/bachya-intro/", enSrc: "Munk", note: "Torah" },
    { id: "sforno", he: "ספורנו", heIntro: "הקדמת הספורנו", en: "Sforno", dir: "data/sforno/", enDir: "data/sforno-en/", introDir: "data/sforno-intro/", enSrc: "Munk", note: "Torah and Shir Hashirim" },
    { id: "kliyakar", he: "כלי יקר", heIntro: "הקדמת כלי יקר", en: "Kli Yakar", dir: "data/kliyakar/", enDir: "data/kliyakar-en/", introDir: "data/kliyakar-intro/", note: "Torah" },
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
    pg_rashi: true, pg_ramban: true, pg_bachya: true, pg_sforno: true, pg_kliyakar: true, pg_beishalevi: true, pg_order: ["rashi", "ramban", "bachya", "sforno", "kliyakar", "beishalevi"],
  };
  const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
  if (settings.inlineRashi) settings.rashiOpen = true;
  delete settings.inlineRashi; delete settings.panel; delete settings.scale;   // text size is now fixed to the standard
  let bookmarks = store.get("bookmarks", []);
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
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  /* ───────── Data ───────── */
  let INDEX = null, ORDER = [];
  const cache = new Map();      // url → promise
  const resolved = new Map();   // url → data (sync access for copy)
  function fetchJSON(url) {
    if (!cache.has(url)) cache.set(url, fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status + " " + url); return r.json(); })
      .then((d) => { resolved.set(url, d); return d; })
      .catch((e) => { cache.delete(url); throw e; }));
    return cache.get(url);
  }
  const textUrl = (slug) => `data/text/${slug}.json`;
  const commUrl = (cid, slug) => commMeta(cid).dir + slug + ".json";
  const commEnUrl = (cid, slug) => commMeta(cid).enDir + slug + ".json";
  const loadText = (slug) => fetchJSON(textUrl(slug));
  const loadComm = (cid, slug) => fetchJSON(commUrl(cid, slug));
  const loadCommEn = (cid, slug) => fetchJSON(commEnUrl(cid, slug));
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
    if (veil) { if (work) await Promise.race([work, sleep(900)]); await frames(2); if (tok === routeTok) await veilTo(false, 170); }
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
    renderBookmarks();
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
      ${removable ? `<button class="icon-btn pc-rm" type="button" data-rm="${slug}:${c}:${v}" aria-label="Remove bookmark" title="Remove bookmark">${iconX}</button>` : ""}
    </div>`;
  }
  function wireCards(root) {
    $$(".pcard", root).forEach((el) => {
      const go = () => { location.hash = el.dataset.href; };
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

  async function renderBookmarks() {
    const el = $("#bmList"); if (!el) return;
    if (!bookmarks.length) { el.innerHTML = `<p class="empty">No saved pesukim yet — open the reader and tap the bookmark icon beside any pasuk.</p>`; return; }
    const list = bookmarks.filter((b) => INDEX.books[b.b]).slice().sort((a, b) => b.t - a.t);
    const texts = {};
    await Promise.all([...new Set(list.map((b) => b.b))].map((s) => loadText(s).then((t) => (texts[s] = t)).catch(() => {})));
    if (!$("#bmList")) return;
    el.innerHTML = `<div class="pcards">${list.filter((bm) => texts[bm.b]).map((bm) =>
      pasukCard({ slug: bm.b, c: bm.c, v: bm.v, text: texts[bm.b], href: chapterHash(bm.b, bm.c, bm.v), removable: true })).join("")}</div>`;
    wireCards(el);
    $$("[data-rm]", el).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const [s, c, v] = b.dataset.rm.split(":"); removeBookmark(s, +c, +v); renderBookmarks();
    }));
  }

  /* ───────── Bookmarks ───────── */
  const isBookmarked = (s, c, v) => bookmarks.some((b) => b.b === s && b.c === c && b.v === v);
  function removeBookmark(s, c, v) { bookmarks = bookmarks.filter((b) => !(b.b === s && b.c === c && b.v === v)); store.set("bookmarks", bookmarks); }
  function toggleBookmark(s, c, v, btn) {
    if (isBookmarked(s, c, v)) { removeBookmark(s, c, v); btn && btn.classList.remove("on"); toast("Bookmark removed"); return; }
    bookmarks.push({ b: s, c, v, t: Date.now() });
    store.set("bookmarks", bookmarks);
    btn && btn.classList.add("on");
    toast(`Saved ${refEn(s, c, v)}`);
  }

  /* ───────── Reader ───────── */
  const iconBookmark = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
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
    if (r.c > 1) prev = [r.slug, r.c - 1]; else if (bi > 0) { const s = ORDER[bi - 1]; prev = [s, book(s).verses.length]; }
    if (r.c < b.verses.length) next = [r.slug, r.c + 1]; else if (bi < ORDER.length - 1) next = [ORDER[bi + 1], 1];
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
  function phrasedComment(heHtml, enHtml, reg, src) {
    const H = extractDH(heComm(heHtml)), E = extractDH(enHtml || "", true);
    let enRest = E.rest, enDH = E.dh;
    if (!enDH) { const m = enRest.match(/^([^a-z\uE000\uE001]{3,}?[.:])\s+(?=\S)/); if (m && /[A-Z]{2}/.test(m[1])) { enDH = m[1]; enRest = enRest.slice(m[0].length); } }  // capitals, if any are left
    if (!H.dh && enDH) { enRest = `${B0}${enDH}${B1} ${enRest}`; enDH = ""; }
    const rows = alignComment(H.rest, enRest);
    const ens = boldSeq(rows.map((rw) => rw.en.join(" ")));
    let html = "";
    if (H.dh) { const i = reg.push({ en: enDH, html: enDH ? `<b>${esc(enDH)}</b>` : "", src }) - 1; html += `<b class="ph dh" data-p="${i}">${esc(H.dh)}</b> `; }
    rows.forEach((rw, k) => { const i = reg.push({ en: unB(rw.en.join(" ")), html: ens[k], src }) - 1; html += `<span class="ph" data-p="${i}">${esc(rw.he.join(" "))}</span> `; });
    return html;
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
        <div class="pg-pasuk cu" data-kind="verse" data-s="${it.s}" data-c="${it.c}" data-v="${it.v}"><div class="cu-he">${phrasedPasuk(text.he[it.c - 1][it.v - 1], text.en[it.c - 1][it.v - 1], reg, "JPS")}</div></div>`;
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
      <div class="pg-pasuk cu" data-kind="verse" data-s="${s}" data-c="${c}" data-v="${v}"><div class="cu-he">${phrasedPasuk(PG.text.he[c - 1][v - 1], PG.text.en[c - 1][v - 1], reg, "JPS")}</div></div>`;
    return { top, body: commentaryBody(s, c, v, reg) };
  }
  function pgTools(s, c, v) {
    return `<span class="pg-tools"><button type="button" class="pg-bm ${isBookmarked(s, c, v) ? "on" : ""}" data-s="${s}" data-c="${c}" data-v="${v}" aria-label="Bookmark" title="Bookmark">${iconBookmark}</button><button type="button" class="pg-copy" aria-label="Copy this pasuk" title="Copy this pasuk">${iconCopy}</button></span>`;
  }
  function commentaryBody(s, c, v, reg) {
    let body = "";
    for (const cm of pgComms(s)) {
      const list = at(resolved.get(commUrl(cm.id, s)), c, v); if (!list.length) continue;
      const enl = at(resolved.get(commEnUrl(cm.id, s)), c, v);
      body += `<h3 class="pg-cname"><span class="he">${cm.he}</span><span class="en">${esc(cm.en)}</span></h3>
        ${list.map((x, i) => `<div class="pg-c cu" data-anchor="c:${cm.id}:${i}" data-kind="comm" data-cid="${cm.id}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}"><div class="cu-he">${phrasedComment(x, enl[i] || "", reg, cm.enSrc ? `${cm.en} · ${cm.enSrc}` : cm.en)}</div></div>`).join("")}`;
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
    $$(".pg-btn[data-go='-1']").forEach((x) => (x.disabled = PG.idx === 0 && PG.page === 0 && bi === 0));
    $$(".pg-btn[data-go='1']").forEach((x) => (x.disabled = PG.idx === PG.items.length - 1 && PG.page === PG.pages - 1 && bi === ORDER.length - 1));
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
      else if (bi < ORDER.length - 1) location.hash = chapterHash(ORDER[bi + 1], 1);                 // on into the next sefer
    } else {
      if (PG.page > 0) { PG.page--; pagerMove(); }
      else if (PG.idx > 0) pagerShow(PG.idx - 1, "last", -1);
      else if (bi > 0) { const pb = book(ORDER[bi - 1]), lc = pb.verses.length; location.hash = chapterHash(ORDER[bi - 1], lc, pb.verses[lc - 1]); }
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
    src.textContent = ph.src;
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
    $("#pgStage").addEventListener("click", (e) => {
      if (PG.swiped) return;
      const bm = e.target.closest(".pg-bm");
      if (bm) { toggleBookmark(bm.dataset.s, +bm.dataset.c, +bm.dataset.v, bm); return; }
      const cp = e.target.closest(".pg-copy");
      if (cp) { const u = $("#pgTop .pg-pasuk.cu"); if (u) copyUnit(u); return; }
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
        if (ending && (!isParsha || ending === r.p)) rows += `<section class="haftarah ${isParsha ? "full" : "card"}" id="haft-${ending.id}" data-p="${ending.id}"></section>`;
      }
    }
    return rows;
  }

  async function renderReader(r) {
    const app = $("#app");
    leavePages();
    const slug = r.view === "parsha" ? r.p.range[0] : r.slug, b = book(slug);
    setPicker(r);
    if (!resolved.has(textUrl(slug))) app.innerHTML = `<div class="loading">טוען…</div>`;
    let text;
    try { text = await loadText(slug); }
    catch (e) {
      app.innerHTML = navigator.onLine === false
        ? `<div class="error-box"><p>${esc(b.he)} · ${esc(b.en)} isn't downloaded, and there's no internet connection.</p><p><a href="#offline">Download sefarim for offline reading</a></p></div>`
        : `<div class="error-box"><p>Couldn't load ${esc(b.en)}.</p><p><a href="">Try again</a></p></div>`;
      return;
    }
    if (current !== r) return;
    readerState = { r, slug, text, sel: null, open: pendingOpen || new Set(), tab: store.get("tab", "rashi"), haftChoice: pendingHaftChoice || {}, rowsDirty: true };
    pendingHaftChoice = null; pendingOpen = null;
    if (!commMeta(readerState.tab)) readerState.tab = COMMENTARIES[0].id;
    if (r.v && !suppressOpen) readerState.open.add(`${slug}:${r.c}:${r.v}`);
    suppressOpen = false;
    if (r.view === "chapter" && settings.view === "pages") return renderPages(r, text);
    if (r.view === "chapter") return renderSefer(r, text);

    // ── parsha view: one parsha across its perakim ──
    const segs = segmentsFor(r);
    const sec = INDEX.sections.find((s) => s.id === b.section);
    const pr = r.p.range;
    document.title = `Parashat ${r.p.en} — Tanach Reader`;
    const nb = neighbors(r);
    let rows = "";
    for (const sg of segs) {
      rows += `<div class="chapter-head"><span>פרק ${gematria(sg.c)}</span><small>${esc(b.en)} ${sg.c}</small></div>`;
      rows += rowsHTML(slug, sg.c, sg.from, sg.to, text, r);
    }
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
    paintAliyot();
    const haftJobs = $$(".haftarah", app).map((el) => fillHaftarah(el, el.classList.contains("full")));
    preloadHaftarot();
    $(".verses", app).addEventListener("click", onVerseClick);
    const target = r.v ? $(`#v-${slug}-${r.c}-${r.v}`) : null;
    // as in a sefer: in place in the first frame, kept there while Rashi is painted
    let spot = null;
    if (!pendingAnchor && !r.haft) { if (target) selectVerse(slug, r.c, r.v, { scroll: true }); else window.scrollTo(0, 0); spot = captureSpot(); }
    await decorateCommentary();
    preloadForCopy();
    if (pendingAnchor) restoreAnchor();
    else if (target) { restoreSpot(spot); target.classList.add("flash"); }
    else if (r.haft) { await Promise.all(haftJobs); const h = $(`#haft-${r.p.id}`); if (h) h.scrollIntoView({ block: "start" }); }
    else restoreSpot(spot);
    trackPosition(true);
  }

  /* ── sefer view: the whole sefer as one continuous scroll, with a break between perakim ──
     Opens at the requested perek, then fills in the rest of the sefer around it in the background
     (keeping the reader's place steady while perakim are added above). */
  function perekHTML(slug, c, text, r) {
    const b = book(slug);
    return `<section class="perek" id="perek-${slug}-${c}" data-c="${c}">
      <div class="chapter-head"><span>פרק ${gematria(c)}</span><small>${esc(b.en)} ${c}</small></div>
      ${rowsHTML(slug, c, 1, b.verses[c - 1], text, r)}
    </section>`;
  }
  async function renderSefer(r, text) {
    const app = $("#app"), slug = r.slug, b = book(slug), n = b.verses.length;
    const sec = INDEX.sections.find((s) => s.id === b.section);
    const bi = ORDER.indexOf(slug), prevB = ORDER[bi - 1], nextB = ORDER[bi + 1];
    document.title = `${b.en} — Tanach Reader`;
    const total = b.verses.reduce((x, y) => x + y, 0);
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
    const st = readerState;
    const body = $("#seferBody");
    body.addEventListener("click", onVerseClick);
    renderReaderTools();
    const c0 = r.c;
    st.lo = Math.max(1, c0 - 1); st.hi = Math.min(n, c0 + 1);
    let html = ""; for (let c = st.lo; c <= st.hi; c++) html += perekHTML(slug, c, text, r);
    body.innerHTML = html;
    const target = r.v ? $(`#v-${slug}-${r.c}-${r.v}`) : null;
    const place = () => {
      if (target) { selectVerse(slug, r.c, r.v, { scroll: true }); target.classList.add("flash"); }
      else if (c0 > 1) $(`#perek-${slug}-${c0}`).scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
    };
    // the page is put in place in the same frame its text arrives, so it is never seen at the top of the
    // sefer first; painting Rashi (which can change heights above) then keeps that place — Safari has no
    // scroll anchoring to do it for us
    const early = !pendingAnchor && !pendingHaftOpen;
    let spot = null;
    if (early) { place(); spot = captureSpot(); }
    await decorateCommentary();            // loads Rashi once for the sefer, paints these perakim
    if (readerState !== st) return;
    afterInsert($$(".perek", body), false);
    if (pendingHaftOpen) {
      const el = $(`#haft-${pendingHaftOpen}`); pendingHaftOpen = null;
      if (el) { el.classList.add("full"); el.classList.remove("card"); await fillHaftarah(el, true); if (readerState !== st) return; st.rowsDirty = true; }
    }
    preloadForCopy();
    if (pendingAnchor) restoreAnchor();
    else if (early) restoreSpot(spot);
    else place();
    trackPosition(true);
    fillSefer(st, c0);
    preloadPagesData(slug);
  }
  /* while reading in Scroll, quietly fetch what Pages needs for this sefer, so switching never waits */
  function preloadPagesData(slug) {
    const c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return;
    setTimeout(() => {
      if (!readerState || readerState.slug !== slug) return;
      fontsReady("pages");
      for (const cm of pgComms(slug)) {
        loadComm(cm.id, slug).catch(() => {}); if (cm.enDir) loadCommEn(cm.id, slug).catch(() => {});
        if (cm.introDir && INDEX.intros && (INDEX.intros[cm.id] || []).includes(slug)) fetchJSON(cm.introDir + slug + ".json").catch(() => {});
      }
    }, 2500);
  }
  function afterInsert(sections, paintRashi = true) {
    const st = readerState; if (!st) return;
    st.rowsDirty = true;
    for (const sec of sections) {
      paintAliyot(sec);
      $$(".haftarah", sec).forEach((el) => fillHaftarah(el, el.classList.contains("full")));
      if (paintRashi) {
        const rows = $$(".verse", sec);
        if (st.comm && st.comm[st.slug]) rows.forEach(paintRow); else decorateCommentary(rows);
      }
    }
  }
  let lastScrollAt = 0, touching = false;
  let selfScrollAt = 0;   // our own position corrections are not the reader scrolling
  window.addEventListener("scroll", () => { if (Date.now() - selfScrollAt > 120) lastScrollAt = Date.now(); }, { passive: true });
  window.addEventListener("touchstart", () => { touching = true; }, { passive: true });
  window.addEventListener("touchend", () => { touching = false; lastScrollAt = Date.now(); }, { passive: true });
  /* add a batch of perakim (≈80 pesukim at a time) after or before what's shown */
  function addPerakim(st, where) {
    const body = $("#seferBody"); if (!body) return;
    const b = book(st.slug), n = b.verses.length;
    let html = "", count = 0, added = 0;
    if (where === "after") {
      while (st.hi < n && (added === 0 || count < 40)) { st.hi++; html += perekHTML(st.slug, st.hi, st.text, st.r); count += b.verses[st.hi - 1]; added++; }
      const tpl = document.createElement("template"); tpl.innerHTML = html;
      const secs = [...tpl.content.children]; body.append(tpl.content); afterInsert(secs);
      return;
    }
    const cs = [];
    while (st.lo > 1 && (cs.length === 0 || count < 40)) { st.lo--; cs.unshift(st.lo); count += b.verses[st.lo - 1]; }
    for (const c of cs) html += perekHTML(st.slug, c, st.text, st.r);
    // before: keep whatever the reader is looking at exactly where it is
    const anchor = topRow(); const before = anchor ? anchor.getBoundingClientRect().top : 0;
    const tpl = document.createElement("template"); tpl.innerHTML = html;
    const secs = [...tpl.content.children];
    // the new perakim go in a box of a whole number of pixels, so the scroll correction is exact and the
    // text on screen doesn't shift by a fraction of a pixel (which shows as a shimmer)
    const box = document.createElement("div"); box.className = "perek-batch"; box.append(tpl.content);
    body.prepend(box); afterInsert(secs);
    const h = box.getBoundingClientRect().height; box.style.minHeight = Math.ceil(h) + "px";
    if (anchor) { const d = anchor.getBoundingClientRect().top - before; if (d) { selfScrollAt = Date.now(); window.scrollBy(0, Math.round(d)); } }
  }
  function addPerek(st, c, where) { addPerakim(st, where); }
  function fillSefer(st, c0) {
    const n = book(st.slug).verses.length;
    const step = () => {
      if (readerState !== st) return;
      const canPrepend = st.lo > 1 && !touching && Date.now() - lastScrollAt > 250;
      const wantAfter = st.hi < n && (st.lo <= 1 || st.hi - c0 <= c0 - st.lo || !canPrepend);
      if (wantAfter) addPerakim(st, "after");
      else if (canPrepend) addPerakim(st, "before");
      else if (st.lo <= 1 && st.hi >= n) return;     // whole sefer is in
      later(step);
    };
    const later = (f) => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 250 }) : setTimeout(f, 20);
    (layoutSwitch || Promise.resolve()).then(() => setTimeout(() => later(step), layoutSwitch ? 200 : 60));
  }
  /* render every perek between what's shown and c (used when jumping within the sefer) */
  function ensurePerek(c) {
    const st = readerState; if (!st || st.r.view !== "chapter") return;
    while (st.hi < c) addPerek(st, st.hi + 1, "after");
    while (st.lo > c) {
      const body = $("#seferBody"); body.insertAdjacentHTML("afterbegin", perekHTML(st.slug, st.lo - 1, st.text, st.r));
      st.lo--; afterInsert([body.firstElementChild]);
    }
  }
  function jumpWithinSefer(c, v) {
    const st = readerState; ensurePerek(c);
    if (v) {
      const row = $(`#v-${st.slug}-${c}-${v}`); if (!row) return;
      st.open.add(`${st.slug}:${c}:${v}`); paintRow(row);
      selectVerse(st.slug, c, v, { scroll: true });
      row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
    } else {
      const el = $(`#perek-${st.slug}-${c}`); if (el) el.scrollIntoView({ block: "start" });
      history.replaceState(null, "", chapterHash(st.slug, c));
    }
    trackPosition(true);
  }

  /* where the reader is: the first pasuk under the top bar (binary search — the sefer can have thousands) */
  function topRow() {
    const st = readerState; if (!st) return null;
    if (!st.rows || st.rowsDirty) { st.rows = $$(".reader .verse"); st.rowsDirty = false; }
    const rows = st.rows; if (!rows.length) return null;
    const top = $(".topbar").getBoundingClientRect().bottom + ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight) + 8;
    let lo = 0, hi = rows.length - 1, ans = rows.length - 1;
    // the first row with a real part of it below the bar (a sliver of the previous one doesn't count)
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].getBoundingClientRect().bottom > top + 14) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return rows[ans];
  }
  function trackPosition(force) {
    const st = readerState; if (!st) return;
    const row = topRow(); if (!row) return;
    const hs = row.closest(".haftarah");
    const pos = { s: row.dataset.s, c: +row.dataset.c, v: +row.dataset.v, haft: !!hs };
    if (hs) pos.pid = hs.dataset.p;
    st.lastPos = pos; saveLast(pos); updateAliyahBtn(pos);
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
  let pendingAnchor = null, pendingOpen = null, pendingHaftOpen = null;
  function restoreAnchor() {
    const a = pendingAnchor; pendingAnchor = null;
    const row = a && $(`#v-${a.s}-${a.c}-${a.v}`);
    if (row) window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - a.top);
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

  async function fillHaftarah(el, expanded) {
    const p = INDEX.parshiot.find((x) => x.id === el.dataset.p); if (!p) return;
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
      $(".haft-open", el).addEventListener("click", () => { el.classList.add("full"); el.classList.remove("card"); fillHaftarah(el, true); });
      return;
    }
    // wait until the text, Rashi and its translation are all loaded, then show everything at once
    const books = [...new Set(ranges.map((rg) => rg[0]))];
    const ready = books.every(copyReady);
    if (!ready) { el.innerHTML = head + `<div class="loading" style="padding:20px 0;font-size:1rem">טוען…</div>`; wire(); }
    await Promise.all(books.map(loadPlace));
    if (!el.isConnected) return;
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
    // clicks bubble up to the reader's .verses listener
    await decorateCommentary($$(".verse", el));
  }
  function rerenderKeepingPlace() {
    if (!readerState || !current) return Promise.resolve();
    const st = readerState, pos = st.lastPos;
    const row = pos && $(`#v-${pos.s}-${pos.c}-${pos.v}`);
    pendingAnchor = row ? { s: pos.s, c: pos.c, v: pos.v, top: row.getBoundingClientRect().top } : null;
    pendingHaftChoice = st.haftChoice; pendingOpen = new Set(st.open);
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
    btn.hidden = !isTorah;
    if (!isTorah) { $("#topParsha").hidden = true; document.body.classList.remove("has-parsha"); return; }
    const lbl = $("#aliyahLabel");
    const st = pos && !pos.haft ? currentStop(pos) : null;
    const p = pos && pos.pid ? INDEX.parshiot.find((x) => x.id === pos.pid) : st ? st.p : null;
    const al = pos && pos.haft ? "הפטרה" : st && st.he ? st.he : "עליה";
    lbl.textContent = al;
    // Pages: the parsha you're in gets its own label on the top bar
    const tp = $("#topParsha"), showP = !!(PG && p);
    tp.hidden = !showP; if (showP) tp.textContent = `פרשת ${p.he}`;
    document.body.classList.toggle("has-parsha", showP);
    btn.title = p ? `${pos && pos.haft ? "Haftarah" : st && st.en ? st.en : ""} · Parashat ${p.en} — jump to an aliyah` : "Jump to an aliyah";
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
      location.hash = `#parsha-${b.dataset.haft}-haftarah`;
    }));
    $$("#aliyahBody .al-item").forEach((b) => b.addEventListener("click", () => {
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
    if (r && r.view === "chapter" && r.slug === st.slug) { ensurePerek(st.c); const t2 = $(`#al-${st.p.id}-${st.kind}-${st.n}`); if (t2) { t2.scrollIntoView({ block: "start" }); trackPosition(true); } return; }
    suppressOpen = true;
    location.hash = r && r.view === "parsha" ? `#parsha-${st.p.id}-${st.c}-${st.v}` : chapterHash(st.slug, st.c, st.v);
  }

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
    const on = isBookmarked(slug, c, v);
    return `<div class="verse cu" data-kind="verse" id="v-${slug}-${c}-${v}" data-s="${slug}" data-c="${c}" data-v="${v}">
      <div class="v-he cu-he">${he}</div>
      <div class="v-num no-copy">
        <span class="n-he">${gematria(v)}</span><span class="n-en">${v}</span>
        <span class="v-tools">
          <button class="v-btn bm-btn ${on ? "on" : ""}" type="button" aria-label="Bookmark ${esc(refEn(slug, c, v))}" title="Bookmark">${iconBookmark}</button>
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
      const spot = captureSpot(), keep = () => restoreSpot(spot);
      const k = b.dataset.tool; settings[k] = !settings[k]; saveSettings(); renderReaderTools();
      if (k === "rashiLines") { keep(); decorateCommentary().then(keep); return; }
      if (k === "rashiOpen" && !settings.rashiOpen) readerState.open.clear();
      keep(); decorateCommentary().then(keep);
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
  function alignComment(heText, enText) {
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
  function linesHTML(heHtml, enHtml) {
    const H = extractDH(heComm(heHtml)), E = extractDH(enHtml, true);
    let enRest = E.rest, enDH = E.dh;
    if (!H.dh && enDH) { enRest = `${B0}${enDH}${B1} ${enRest}`.trim(); enDH = ""; }
    const rows = alignComment(H.rest, enRest);
    const ens = boldSeq(rows.map((rw) => rw.en.join(" ")));
    return (H.dh ? `<div class="rline dh"><div class="r-en cu-en">${enDH ? `<b>${esc(enDH)}</b>` : ""}</div><div class="r-he cu-he dh-line"><b>${esc(H.dh)}</b></div></div>` : "") +
      rows.map((rw, k) => `<div class="rline"><div class="r-en cu-en">${ens[k]}</div><div class="r-he cu-he">${rw.he.map(esc).join("<br>")}</div></div>`).join("");
  }

  function commentRow(cid, s, c, v, i, he, en) {
    const showEn = settings.rashiEn && en;
    if (showEn && settings.rashiLines) {
      return `<div class="rrow lines cu has-en" data-kind="comm" data-cid="${cid}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}">
        <button class="unit-copy c-copy" type="button" aria-label="Copy this comment" title="Copy this comment">${iconCopy}</button>
        ${linesHTML(he, en)}
      </div>`;
    }
    return `<div class="rrow cu ${showEn ? "has-en" : "no-en"}" data-kind="comm" data-cid="${cid}" data-s="${s}" data-c="${c}" data-v="${v}" data-i="${i}">
      <button class="unit-copy c-copy" type="button" aria-label="Copy this comment" title="Copy this comment">${iconCopy}</button>
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

  async function decorateCommentary(rows) {
    const st = readerState; if (!st) return;
    if (settings.rashiLines && settings.rashiEn) await loadLex();   // line by line matches phrases with the word dictionary
    const cid = st.tab, meta = commMeta(cid);
    rows = rows || $$(".reader .verse");
    st.comm = st.comm || {};
    const slugs = [...new Set(rows.map((r) => r.dataset.s))];
    await Promise.all(slugs.map(async (s) => {
      let data = null, enData = null;
      try { data = await loadComm(cid, s); } catch { return; }
      if (settings.rashiEn && meta.enDir) { try { enData = await loadCommEn(cid, s); } catch {} }
      st.comm[s] = { data, enData };
    }));
    if (readerState !== st) return;
    rows.forEach((row) => paintRow(row));
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
    paintRow(row);
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
    if (bm) { e.stopPropagation(); toggleBookmark(s, c, v, bm); return; }
    if (e.target.closest(".rashi-pill")) { toggleRashi(row); markSelected(s, c, v); return; }
    if (e.target.closest(".rdrop")) return;                        // reading / selecting inside Rashi
    if (window.getSelection && String(window.getSelection()).length > 1) return; // selecting text
    if (copyMode) return;                                          // taps in copy mode don't toggle
    markSelected(s, c, v);
    toggleRashi(row);
  }

  function markSelected(s, c, v) {
    $$(".verse.selected").forEach((x) => x.classList.remove("selected"));
    const row = $(`#v-${s}-${c}-${v}`); if (!row) return null;
    row.classList.add("selected");
    if (readerState) readerState.sel = { s, c, v };
    if (readerState && readerState.r.view === "chapter") history.replaceState(null, "", chapterHash(s, c, v));
    return row;
  }
  function selectVerse(s, c, v, { scroll = false } = {}) {
    const row = markSelected(s, c, v); if (!row) return;
    if (scroll) row.scrollIntoView({ block: "center" });
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
          if (prev.last.c === u.c && prev.last.v === u.v) continue; // same pasuk shown twice (text + panel)
          prev.he.push(he); prev.en.push(en); prev.last = { c: u.c, v: u.v };
        } else {
          blocks.push({ kind: "verse", s: u.s, first: { c: u.c, v: u.v }, last: { c: u.c, v: u.v }, he: [he], en: [en] });
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

  function blockRef(b) {
    const B = book(b.s).he;
    if (b.kind === "verse") {
      const { first: f, last: l } = b;
      let loc = `${plainGem(f.c)}:${plainGem(f.v)}`;
      if (l.c !== f.c) loc += `-${plainGem(l.c)}:${plainGem(l.v)}`;
      else if (l.v !== f.v) loc += `-${plainGem(l.v)}`;
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
    btn.disabled = !label;
    const pv = $("#copyPreview"); pv.textContent = label || "Select text, or tap the copy icon on a pasuk or comment"; pv.dir = label ? "rtl" : "ltr";
    $$("#copybar .seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings.copyFmt));
  }

  function setCopyMode(on) {
    copyMode = on;
    document.body.classList.toggle("copy-mode", on);
    $("#copybar").hidden = !on;
    $("#copyModeBtn").classList.toggle("active", on);
    $("#copyModeBtn").setAttribute("aria-pressed", String(on));
    savedRange = null; updateCopyBar();
    if (on) { preloadForCopy(); toast("Copy mode on"); }
    if (PG) requestAnimationFrame(() => pagerLayout(true));
  }

  /* ───────── Picker ───────── */
  function setPicker(r) {
    const el = $("#pickerLabel");
    if (!r) el.innerHTML = `Choose a sefer`;
    else if (r.view === "chapter") el.innerHTML = `<span class="he">${esc(book(r.slug).he)} ${gematria(r.c)}</span>`;
    else el.innerHTML = `<span class="he">פרשת ${esc(r.p.he)}</span>`;
  }
  function openPicker(slug) { openDialog("#pickerOverlay"); if (slug) showChapters(slug); else showBooks(); }
  function showBooks() {
    $("#pickerTitle").textContent = "Choose a sefer";
    $("#pickerBack").hidden = true;
    const cur = current && (current.slug || (current.p && current.p.range[0]));
    $("#pickerBody").innerHTML = `<div class="picker-sections">${INDEX.sections.map((sec) => `
      <div><div class="col-head"><span class="en">${esc(sec.en)}</span><span class="he">${esc(sec.he)}</span></div>
        ${sec.groups.flatMap((g) => g.books).map((s) => `<button type="button" class="lrow ${s === cur ? "current" : ""}" data-book="${s}">
          <span class="en">${esc(book(s).en)}</span><span class="he">${esc(book(s).he)}</span></button>`).join("")}
      </div>`).join("")}</div>`;
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
      settings.pg_order = ids; saveSettings(); renderSettings(); afterSettingChange("pg_order", spot);
      const again = $(`#settingsBody .pg-row[data-id="${id}"] .ord-btn[data-move="${btn.dataset.move}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }));
    $$("#settingsBody .seg").forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || settings[s.dataset.key] === b.dataset.v) return;
      const spot = captureSpot();
      settings[s.dataset.key] = b.dataset.v; saveSettings(); renderSettings(); afterSettingChange(s.dataset.key, spot);
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
  function switchLayout() {
    let pos = readerState.lastPos || { s: readerState.slug, c: current.c || 1, v: 1 };
    // a pasuk you've just picked (highlighted) and can see wins over the one at the top of the screen
    const sel = readerState.sel, selRow = sel && !PG && $(`#v-${sel.s}-${sel.c}-${sel.v}`);
    if (selRow && !selRow.closest(".haftarah") && sel.s === readerState.slug) {
      const rc = selRow.getBoundingClientRect();
      if (rc.bottom > $(".topbar").getBoundingClientRect().bottom + 10 && rc.top < innerHeight - 40) pos = { s: sel.s, c: sel.c, v: sel.v };
    }
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
  const FONT_FACES = {
    pages: ['400 1em "Noto Rashi Hebrew"', '600 1em "Noto Rashi Hebrew"', '500 1em "Frank Ruhl Libre"', '700 1em "Frank Ruhl Libre"', '400 1em "Noto Serif Hebrew"', '400 1em "EB Garamond"', 'italic 400 1em "EB Garamond"'],
    scroll: ['400 1em "Noto Serif Hebrew"', '500 1em "Noto Serif Hebrew"', '400 1em "Frank Ruhl Libre"', '700 1em "Frank Ruhl Libre"', '400 1em "EB Garamond"', 'italic 400 1em "EB Garamond"', '400 1em "Noto Rashi Hebrew"'],
  };
  const fontsAsked = new Set();
  function fontsReady(kind, wait = 1500) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const jobs = FONT_FACES[kind].map((f) => { fontsAsked.add(f); return document.fonts.load(f, "אבג בְּרֵאשִׁית Ab").catch(() => {}); });
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
  function veilTo(on, ms) {
    let v = document.getElementById("veil");
    if (!v) { v = document.createElement("div"); v.id = "veil"; v.setAttribute("aria-hidden", "true"); document.body.append(v); }
    const nav = $(".nav-center");
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
      }, ms + 30);
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
    const slow = setTimeout(() => toast("Loading…"), 350);
    await Promise.allSettled(jobs); clearTimeout(slow);
    mark("data");
    let done; layoutSwitch = new Promise((r) => (done = r));
    quietShow = true;
    try {
      await veilTo(true, 110);
      mark("hidden");
      await update();
      void $("#app").offsetHeight;       // laid out and scrolled into place before the veil lifts
      await frames(2);                    // …and painted
      mark("updated");
    } finally {
      quietShow = false;
      await veilTo(false, 190);
      mark("done"); done(); layoutSwitch = null;
    }
  }
  /* ── keeping your place when a setting changes ── */
  function captureSpot() {
    if (PG && $(".pager")) return { pages: pagerSpot() };
    if (readerState && $(".reader")) { const row = topRow(); return row ? { row: row.id, top: row.getBoundingClientRect().top } : null; }
    return null;
  }
  function restoreSpot(a) {
    if (!a) return;
    if (a.pages) { if (PG && $(".pager")) pagerReanchor(a.pages); return; }
    const r = a.row && document.getElementById(a.row);
    if (!r) return;
    const d = r.getBoundingClientRect().top - a.top; if (Math.abs(d) > .5) { selfScrollAt = Date.now(); window.scrollBy(0, d); }
    // if you were partway through this pasuk's Rashi and it closed, the pasuk itself could now be above the
    // screen: bring it back to the top, so you're still on the same pasuk
    const line = $(".topbar").getBoundingClientRect().bottom + ($("#copybar").hidden ? 0 : $("#copybar").offsetHeight);
    const he = r.querySelector(".v-he");
    if (he && he.getBoundingClientRect().bottom < line + 12) { selfScrollAt = Date.now(); window.scrollBy(0, Math.round(r.getBoundingClientRect().top - (line + 8))); }
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
    const keep = () => restoreSpot(spot);
    if (["nikkud", "taamim", "petuchot", "sedarim"].includes(key)) rerenderKeepingPlace();
    else if (key === "weekday" || key === "maftir") { paintAliyot(); updateAliyahBtn(readerState.lastPos); keep(); }
    else if (key === "rashiLines") { renderReaderTools(); keep(); decorateCommentary().then(keep); }
    else if (key === "haftarah" || key === "haftCustom") rerenderKeepingPlace();
    else if (key === "rashiOpen" || key === "rashiEn") { if (key === "rashiOpen" && !settings.rashiOpen) readerState.open.clear(); renderReaderTools(); keep(); decorateCommentary().then(keep); }
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
      toast(settings.view === "pages" ? "Pages — one pasuk per page" : "Scroll — the whole sefer");
      afterSettingChange("view");
    });
    $("#aliyahBtn").addEventListener("click", openAliyahMenu);
    $("#copyExit").addEventListener("click", () => setCopyMode(false));
    $("#copySelBtn").addEventListener("pointerdown", (e) => { copyBtnDownAt = Date.now(); e.preventDefault(); });
    $("#copySelBtn").addEventListener("mousedown", (e) => e.preventDefault());
    $("#copySelBtn").addEventListener("click", () => {
      const r = selectionInContent(window.getSelection()) || savedRange;
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
  window.__tanachDebug = { fillAboveOnce: () => { const st = readerState; const t = performance.now(); let html = ''; for (let c = 1; c < st.lo; c++) html += perekHTML(st.slug, c, st.text, st.r); const t1 = performance.now(); const body = $('#seferBody'); const tpl = document.createElement('template'); tpl.innerHTML = html; const secs = [...tpl.content.children]; const box = document.createElement('div'); box.className = 'perek-batch'; box.append(tpl.content); body.prepend(box); st.lo = 1; const t2 = performance.now(); afterInsert(secs); const t3 = performance.now(); box.getBoundingClientRect(); const t4 = performance.now(); return [t1 - t, t2 - t1, t3 - t2, t4 - t3]; }, fillAbove: () => { const st = readerState; const t = performance.now(); while (st.lo > 1) addPerakim(st, 'before'); return performance.now() - t; }, fillBelow: () => { const st = readerState; const t = performance.now(); const n = book(st.slug).verses.length; while (st.hi < n) addPerakim(st, 'after'); return performance.now() - t; }, splitPhrases, alignPhrases, alignComment, sentencesOf, extractDH, heComm, boldSeq, unB, loadLex, lexMatrix, setLexW: (w) => { LEX_W = w; } };
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
    route();
  }
  boot();
})();
