# Claude's translation of the meforshim — how it is made

Every meforash on the site except Rashi is translated by Claude, phrase by phrase: one English line for each
Hebrew phrase exactly as Pages cuts it, so tapping any phrase shows its own English. Rashi keeps the published
translations (Metsudah / Judaica Press).

## Files
- `units/<cid>/<slug>.jsonl` — the work list: every comment cut into the site's Hebrew phrases
  (`{"k": "c:v:i", "d": 1 if phrase 0 is the dibbur hamatchil, "u": [phrases]}`), made by
  `dump_units.py` from the site itself. Re-make it if the site's phrase cutting changes.
- `data/<cid>-cl/<slug>.json` — the translation the site loads: `{"c:v:i": [d, [English of each phrase]]}`.
  `data/index.json` → `"cl": {cid: [slugs]}` says which sefarim have one.
  Where a comment has no Claude translation yet, the site still shows the published one.

## A round of work (from the repo root)
1. `python3 tools/translate/next.py <cid> <slug> 1500` — prints the next untranslated comments
   (about 1,500 Hebrew words), each as `@c:v:i` and numbered phrases.
2. Write `tools/translate/work/<cid>.<slug>.txt`: for each comment its `@c:v:i` line, then **exactly one line of
   English per Hebrew phrase, in the same order** (no numbers needed, no blank lines inside a comment).
3. `python3 tools/translate/build.py <cid> <slug>` — checks the line counts and adds them; fix any it reports.
4. Repeat; then `python3 tools/build_manifest.py` (offline sizes and hashes), commit, push, and publish the
   changed files (`data/<cid>-cl/<slug>.json`, `data/index.json`, `data/manifest.json`) to the artifact.

## Order
Parsha by parsha through the Torah, all meforshim of a parsha before the next: Ramban, Ibn Ezra, Sforno,
Or HaChaim, Rabbeinu Bachya, Kli Yakar, Beit HaLevi; then Ibn Ezra on Nach, Sforno on Shir Hashirim, and the
introductions. `build.py` prints how much of each sefer is done, and `next.py` always starts at the first comment
not yet translated, so the work picks up where it stopped.

## Style
- **Faithful and plain.** Translate what each phrase says, in clear modern English, close to the Hebrew; don't
  paraphrase, summarise, explain or add. A phrase that is only part of a sentence gets only that part of the
  English sentence (it may begin or end mid-sentence) — together the lines read as one continuous translation.
- **Nothing left out.** Every word of the phrase is translated. A phrase that is only a citation, e.g. `(שבת פח.)`,
  is written as it is in English: `(Shabbat 88a)`. Hebrew words being explained as words may stay in Hebrew,
  followed by the English: `the word וַיְכֻלּוּ, "were finished,"`.
- **The dibbur hamatchil** (when `DH`): the words of the pasuk in English, ending with a full stop, e.g.
  `In the beginning Elokim created.`
- **Names and terms** as the rest of the site writes them (modern Israeli transliteration): Hashem (for the
  Name, ה׳, השם), Elokim (אלהים), the Holy One, blessed be He (הקב״ה), Moshe, Aharon, Avraham, Yitzchak, Yaakov,
  Yosef, Yehudah, Yisrael, Bnei Yisrael, Mitzrayim, Paroh, Kenaan, Yerushalayim, Esav, Lavan, Noach, Chavah,
  Rivkah, Bilam; the sefarim Bereshit, Shemot, Vayikra, Bamidbar, Devarim, Yehoshua, Shoftim, Shmuel, Melachim,
  Yeshayahu, Yirmeyahu, Yechezkel, Tehillim, Mishlei, Iyov, Shir Hashirim, Kohelet, Eichah, Divrei Hayamim;
  Chazal, our Rabbis (רז״ל, רבותינו), the Gemara, the Midrash, Onkelos, Targum, Rashi, Ramban, Ibn Ezra.
  Keep common Hebrew terms that English readers use: Torah, mitzvah/mitzvot, Shabbat, Mishkan, korban,
  kohen, tzaddik, teshuvah, Gan Eden, Gehinnom, olam haba, Shechinah, sefirot (Kabbalah) — otherwise English.
- **References** in the English form: (Tehillim 104:4), (Bereshit Rabbah 1:4), (Sanhedrin 38b).
- Kabbalistic and philosophical passages (Bachya, Or HaChaim, Ramban's "by way of truth", Sforno's
  medieval science): translate literally; keep technical terms (sefirah, Tiferet, Malchut, form and matter,
  the spheres) rather than modernising them.
