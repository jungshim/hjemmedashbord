import { CONFIG } from "./config.js";

const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let sb = null;
let me = "";
const state = { items: [], dinners: {}, events: null, calError: "", weekOffset: 0 };

// ---------- Datoer ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function monday(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return addDays(d, -((d.getDay() + 6) % 7) + offset * 7);
}
function weekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const fmtDay = (d, opts) => d.toLocaleDateString("nb-NO", opts);
const fmtTime = (d) => d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

// ---------- Lagring ----------
const DEMO_KEY = "hjemmedashbord-demo";
function demoRead() {
  try { const raw = localStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch { /* ingen lagring tilgjengelig */ }
  const now = new Date().toISOString();
  const mk = (list, text, extra = {}) => ({ id: crypto.randomUUID(), list, text, done: false, who: null, meta: {}, created_at: now, ...extra });
  return {
    items: [
      mk("handle", "Melk"), mk("handle", "Havregryn"),
      mk("gjoremal", "Bestille time til dekkskift", { who: "Arne", meta: { due: iso(addDays(new Date(), 3)) } }),
      mk("stress", "Julegaver er ikke påbegynt", { who: "Ildri" }),
      mk("onske", "Ny stekepanne", { who: "Hjemmet" }),
      mk("oppskrift", "Taco", { meta: { ingredients: ["400 g kjøttdeig", "1 pose tacokrydder", "8 tacoskjell", "1 boks mais", "2 tomater", "1 agurk", "150 g revet ost", "1 beger rømme"] } }),
      mk("kjoleskap", "Rømme"), mk("kjoleskap", "Agurk"), mk("fryser", "Kjøttdeig"), mk("skap", "Tacokrydder"),
      mk("hendelse", "Middag hos mormor", { meta: { day: iso(addDays(new Date(), 4)), time: "17:00" } }),
    ],
    dinners: { [today()]: "Taco" },
  };
}
function demoWrite() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ items: state.items, dinners: state.dinners })); } catch { /* ignorer */ }
}

async function loadAll() {
  if (DEMO) { const d = demoRead(); state.items = d.items; state.dinners = d.dinners; return; }
  const since = iso(addDays(new Date(), -60));
  const [a, b] = await Promise.all([
    sb.from("items").select("*").order("created_at"),
    sb.from("dinners").select("*").gte("day", since),
  ]);
  if (a.error || b.error) throw (a.error || b.error);
  state.items = a.data;
  state.dinners = Object.fromEntries(b.data.map((r) => [r.day, r.dish]));
}

async function run(local, remote) {
  local(); renderAll();
  if (DEMO) { demoWrite(); return; }
  const { error } = await remote();
  if (error) { toast("Kunne ikke lagre. Sjekk nettet og prøv igjen."); await refresh(); }
}
const addItem = (row) => run(() => state.items.push(row), () => sb.from("items").insert(row));
const addItems = (rows) => run(() => state.items.push(...rows), () => sb.from("items").insert(rows));
const patchItem = (id, patch) => run(
  () => Object.assign(state.items.find((i) => i.id === id) || {}, patch),
  () => sb.from("items").update(patch).eq("id", id));
const removeItems = (ids) => run(
  () => { state.items = state.items.filter((i) => !ids.includes(i.id)); },
  () => sb.from("items").delete().in("id", ids));
const setDinner = (day, dish) => run(
  () => { if (dish) state.dinners[day] = dish; else delete state.dinners[day]; },
  () => dish ? sb.from("dinners").upsert({ day, dish, updated_by: me }) : sb.from("dinners").delete().eq("day", day));

async function refresh() {
  try { await loadAll(); renderAll(); } catch { toast("Kunne ikke hente data. Sjekk nettet."); }
}

// ---------- Kalender ----------
async function loadCalendar() {
  state.calError = "";
  if (DEMO) {
    const d = (n, h) => { const x = addDays(new Date(), n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    state.events = [
      { title: "Helsestasjon", start: d(1, 10), end: d(1, 11), allDay: false, location: "Bekkestua" },
      { title: "Juleverksted", start: iso(addDays(new Date(), 9)), end: iso(addDays(new Date(), 10)), allDay: true, location: "" },
    ];
  } else {
    const { data, error } = await sb.functions.invoke("kalender", { body: { dager: CONFIG.KALENDER_DAGER } });
    // Google Kalender er valgfritt: uten kobling vises bare det dere legger inn selv.
    state.events = (!error && data?.events) ? data.events : [];
  }
  renderCalendar(); renderHero();
}
const eventDate = (e) => e.allDay ? fromIso(e.start) : new Date(e.start);
const sortKey = (e) => iso(eventDate(e)) + (e.allDay ? "" : "T" + fmtTime(eventDate(e)));

// Egne hendelser (lagt inn i dashbordet) + eventuelle fra Google Kalender.
function allEvents() {
  const own = state.items.filter((i) => i.list === "hendelse" && i.meta?.day >= today()).map((i) => {
    const t = i.meta.time;
    return { id: i.id, title: i.text, allDay: !t, location: "",
      start: t ? new Date(`${i.meta.day}T${t}`).toISOString() : i.meta.day,
      end: t ? new Date(`${i.meta.day}T${t}`).toISOString() : i.meta.day };
  });
  return [...own, ...(state.events || [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function renderCalendar() {
  const el = $("calendar");
  const events = allEvents();
  if (!events.length) { el.innerHTML = `<p class="empty">Ingenting i kalenderen. Legg inn det første som skjer.</p>`; return; }
  const groups = new Map();
  for (const e of events) {
    const key = iso(eventDate(e));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  el.innerHTML = [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([day, evs]) => {
    const d = fromIso(day);
    const label = day === today() ? "I dag" : day === iso(addDays(new Date(), 1)) ? "I morgen" : fmtDay(d, { weekday: "long", day: "numeric", month: "long" });
    return `<div class="cal-day"><h3>${esc(label)}</h3>${evs.map((e) => `
      <div class="cal-event${e.id ? " has-del" : ""}">
        <span class="cal-time">${e.allDay ? "Hele dagen" : fmtTime(new Date(e.start))}</span>
        <span class="cal-title">${esc(e.title)}${e.location ? `<span class="cal-where">${esc(e.location)}</span>` : ""}</span>
        ${e.id ? `<button type="button" class="del" data-del="${e.id}" aria-label="Slett ${esc(e.title)}">×</button>` : ""}
      </div>`).join("")}</div>`;
  }).join("");
}

// ---------- Topp ----------
function renderHero() {
  const now = new Date();
  $("hero-date").textContent = `${fmtDay(now, { weekday: "long", day: "numeric", month: "long" })}, uke ${weekNumber(now)}`;
  const dish = state.dinners[today()];
  const el = $("hero-dinner-text");
  el.textContent = dish || "Ikke planlagt ennå";
  el.classList.toggle("is-empty", !dish);
  const next = allEvents().find((e) => e.allDay ? e.start >= today() : new Date(e.end || e.start) > now);
  if (next) {
    const d = eventDate(next);
    const dayLabel = iso(d) === today() ? "i dag" : iso(d) === iso(addDays(now, 1)) ? "i morgen" : fmtDay(d, { weekday: "long", day: "numeric", month: "long" });
    $("hero-next").textContent = `Neste i kalenderen: ${next.title}, ${dayLabel}${next.allDay ? "" : " kl. " + fmtTime(d)}`;
  } else $("hero-next").textContent = "";
}

// ---------- Middager ----------
function renderDinners() {
  const start = monday(state.weekOffset);
  $("week-label").textContent = `Uke ${weekNumber(start)}`;
  const list = $("dinner-list");
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.day : null;
  if (list.dataset.week === iso(start)) {
    list.querySelectorAll("input").forEach((inp) => { if (inp.dataset.day !== focused) inp.value = state.dinners[inp.dataset.day] || ""; });
    return;
  }
  list.dataset.week = iso(start);
  list.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i), key = iso(d);
    const cls = key === today() ? " is-today" : key < today() ? " is-past" : "";
    const name = fmtDay(d, { weekday: "long" });
    return `<li class="dinner${cls}">
      <label class="dinner-day" for="din-${key}">${esc(name[0].toUpperCase() + name.slice(1))}<small>${esc(fmtDay(d, { day: "numeric", month: "short" }))}</small></label>
      <input id="din-${key}" data-day="${key}" type="text" list="recipe-names" autocomplete="off" maxlength="120" placeholder="Hva blir det?" value="${esc(state.dinners[key] || "")}" enterkeyhint="done">
    </li>`;
  }).join("");
}

// ---------- Lister ----------
const LISTS = {
  handle: { empty: "Handlelista er tom." },
  gjoremal: { empty: "Ingen gjøremål. Nyt det." },
  stress: { empty: "Ingenting som stresser akkurat nå.", doneLabel: "Løst" },
  onske: { empty: "Ingen ønsker ennå.", doneLabel: "Kjøpt" },
};

function sortItems(list, rows) {
  return rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (list === "gjoremal") {
      const da = a.meta?.due || "9999", db = b.meta?.due || "9999";
      if (da !== db) return da < db ? -1 : 1;
    }
    return a.created_at < b.created_at ? -1 : 1;
  });
}

function metaHtml(list, it) {
  const parts = [];
  if (it.who) parts.push(`<span class="tag">${esc(list === "onske" ? "Til " + it.who : it.who)}</span>`);
  if (list === "gjoremal" && it.meta?.due) {
    const late = !it.done && it.meta.due < today();
    parts.push(`<span class="${late ? "late" : ""}">${late ? "Forfalt " : "Frist "}${esc(fmtDay(fromIso(it.meta.due), { day: "numeric", month: "short" }))}</span>`);
  }
  if (list === "onske" && it.meta?.url) parts.push(`<a href="${esc(it.meta.url)}" target="_blank" rel="noopener noreferrer">Åpne lenke</a>`);
  if (list === "handle" && it.meta?.fra) parts.push(`<span>Til ${esc(it.meta.fra)}</span>`);
  if (it.done && LISTS[list].doneLabel) parts.push(`<span>${LISTS[list].doneLabel}</span>`);
  return parts.length ? `<div class="item-meta">${parts.join("")}</div>` : "";
}

function renderList(list) {
  const rows = sortItems(list, state.items.filter((i) => i.list === list));
  const open = rows.filter((i) => !i.done).length;
  $("count-" + list).textContent = open || "";
  document.querySelector(`[data-clear="${list}"]`).hidden = open === rows.length;
  $("list-" + list).innerHTML = rows.length ? rows.map((it) => `
    <li class="item${it.done ? " is-done" : ""}">
      <label class="check-wrap"><input type="checkbox" data-id="${it.id}" ${it.done ? "checked" : ""} aria-label="${esc(it.text)}"></label>
      <div class="item-body"><div class="item-text">${esc(it.text)}</div>${metaHtml(list, it)}</div>
      <button type="button" class="del" data-del="${it.id}" aria-label="Slett ${esc(it.text)}">×</button>
    </li>`).join("") : `<li class="empty">${LISTS[list].empty}</li>`;
}

// ---------- Oppskrifter og lager ----------
const PLACES = { kjoleskap: "Kjøleskap", fryser: "Fryser", skap: "Skap" };
const recipes = () => state.items.filter((i) => i.list === "oppskrift").sort((a, b) => a.text.localeCompare(b.text, "nb"));
const norm = (s) => String(s).toLowerCase().trim();

function renderRecipes() {
  const rows = recipes();
  $("recipe-names").innerHTML = rows.map((r) => `<option value="${esc(r.text)}">`).join("");
  $("list-oppskrift").innerHTML = rows.length ? rows.map((r) => `
    <li class="recipe"><details>
      <summary>${esc(r.text)}</summary>
      <ul>${(r.meta?.ingredients || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="row">
        ${r.meta?.url ? `<a href="${esc(r.meta.url)}" target="_blank" rel="noopener noreferrer">Åpne oppskriften</a>` : "<span style=\"margin-right:auto\"></span>"}
        <button type="button" class="btn btn-quiet" data-edit="${r.id}">Endre</button>
        <button type="button" class="btn btn-quiet" data-del="${r.id}">Slett</button>
      </div>
    </details></li>`).join("") : `<li class="empty">Ingen oppskrifter ennå. Lagre den første, så kan handlelista lages av den.</li>`;
}

function renderPantry() {
  $("pantry").innerHTML = Object.entries(PLACES).map(([key, label]) => {
    const rows = state.items.filter((i) => i.list === key).sort((a, b) => a.text.localeCompare(b.text, "nb"));
    return `<div class="place"><h3>${label}</h3><ul class="items">${rows.length ? rows.map((it) => `
      <li class="item no-check">
        <div class="item-body"><div class="item-text">${esc(it.text)}</div>${key === "fryser" ? `<div class="item-meta"><span>Lagt inn ${esc(fmtDay(new Date(it.created_at), { day: "numeric", month: "short" }))}</span></div>` : ""}</div>
        <button type="button" class="del" data-del="${it.id}" aria-label="Slett ${esc(it.text)}">×</button>
      </li>`).join("") : `<li class="empty">Tomt.</li>`}</ul></div>`;
  }).join("");
}

// «400 g kjøttdeig» → «kjøttdeig», slik at varen kan sammenlignes med det dere har.
const UNIT = /^(g|gram|kg|hg|dl|l|liter|ml|cl|ss|ts|stk|pk|pakke|pakker|boks|bokser|pose|poser|fedd|neve|never|glass|klype|skive|skiver|bunt|beger|flaske|flasker|ca)\.?$/;
export function coreName(s) {
  const w = norm(s).replace(/\(.*?\)/g, " ").replace(/,.*$/, "").split(/\s+/).filter(Boolean);
  while (w.length > 1 && (/^[\d.,/½¼¾–-]+$/.test(w[0]) || UNIT.test(w[0]) || /^\d+[.,]?\d*(g|kg|dl|l|ml|cl)$/.test(w[0]))) w.shift();
  return w.join(" ");
}
const sameItem = (a, b) => a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);

function generateShopping() {
  const start = monday(state.weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i))).filter((d) => d >= today());
  const byName = new Map(recipes().map((r) => [norm(r.text), r]));
  const have = state.items.filter((i) => i.list in PLACES).map((i) => coreName(i.text));
  const onList = state.items.filter((i) => i.list === "handle" && !i.done).map((i) => coreName(i.text));
  const add = [], skipped = [], noRecipe = [];
  let planned = 0;
  for (const day of days) {
    const dish = state.dinners[day];
    if (!dish) continue;
    planned++;
    const r = byName.get(norm(dish));
    if (!r) { noRecipe.push(dish); continue; }
    for (const ing of r.meta?.ingredients || []) {
      const core = coreName(ing);
      if (!core) continue;
      if (have.some((h) => sameItem(core, h))) { if (!skipped.includes(core)) skipped.push(core); continue; }
      if (onList.some((h) => sameItem(core, h))) continue;
      onList.push(core);
      add.push({ id: crypto.randomUUID(), list: "handle", text: ing, done: false, who: null, meta: { fra: r.text }, created_at: new Date().toISOString() });
    }
  }
  const out = $("handle-result");
  out.hidden = false;
  if (!planned) { out.textContent = `Ingen middager er planlagt resten av uke ${weekNumber(start)}. Fyll inn middager først.`; return; }
  const parts = [add.length ? `La til ${add.length} ${add.length === 1 ? "vare" : "varer"}.` : "Ingenting nytt å handle."];
  if (skipped.length) parts.push(`Dere har allerede: ${skipped.join(", ")}.`);
  if (noRecipe.length) parts.push(`Mangler oppskrift: ${noRecipe.join(", ")}.`);
  out.textContent = parts.join(" ");
  if (add.length) addItems(add);
}

function renderAll() {
  renderHero(); renderDinners();
  Object.keys(LISTS).forEach(renderList);
  renderRecipes(); renderPantry(); renderCalendar();
}

// ---------- Hendelser i grensesnittet ----------
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

function safeUrl(raw) {
  try { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
}

function wireUi() {
  const opts = (arr) => arr.map((p) => `<option>${esc(p)}</option>`).join("");
  document.querySelector('form[data-list="gjoremal"] select').innerHTML = `<option value="Begge">Begge</option>` + opts(CONFIG.PERSONER);
  document.querySelector('form[data-list="onske"] select').innerHTML = opts(CONFIG.ONSKER_TIL);

  document.querySelectorAll("form.add[data-list]").forEach((form) => form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const list = form.dataset.list, f = new FormData(form);
    const text = String(f.get("text") || "").trim();
    if (!text) return;
    const meta = {};
    if (f.get("due")) meta.due = f.get("due");
    if (f.get("url")) { const u = safeUrl(String(f.get("url"))); if (u) meta.url = u; }
    const who = list === "stress" ? me : (f.get("who") || null);
    addItem({ id: crypto.randomUUID(), list, text, done: false, who, meta, created_at: new Date().toISOString() });
    form.querySelector('[name="text"]').value = "";
    if (form.elements.due) form.elements.due.value = "";
    if (form.elements.url) form.elements.url.value = "";
  }));

  document.querySelector(".board").addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.matches('input[type="checkbox"][data-id]')) patchItem(t.dataset.id, { done: t.checked });
    if (t.matches("input[data-day]")) {
      const dish = t.value.trim();
      if (dish !== (state.dinners[t.dataset.day] || "")) setDinner(t.dataset.day, dish);
    }
  });
  document.querySelector(".board").addEventListener("click", (ev) => {
    const del = ev.target.closest("[data-del]");
    if (del) removeItems([del.dataset.del]);
    const clear = ev.target.closest("[data-clear]");
    if (clear) removeItems(state.items.filter((i) => i.list === clear.dataset.clear && i.done).map((i) => i.id));
  });
  const newItem = (list, text, meta = {}) => ({ id: crypto.randomUUID(), list, text, done: false, who: null, meta, created_at: new Date().toISOString() });

  $("event-form").elements.day.value = today();
  $("event-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target.elements, text = f.text.value.trim();
    if (!text || !f.day.value) return;
    addItem(newItem("hendelse", text, f.time.value ? { day: f.day.value, time: f.time.value } : { day: f.day.value }));
    f.text.value = ""; f.time.value = "";
  });

  $("pantry-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target.elements, text = f.text.value.trim();
    if (!text) return;
    addItem(newItem(f.place.value, text));
    f.text.value = "";
  });

  const rf = $("recipe-form");
  const resetRecipe = () => { rf.reset(); rf.elements.id.value = ""; $("recipe-save").textContent = "Lagre oppskrift"; $("recipe-cancel").hidden = true; };
  rf.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = rf.elements, text = f.text.value.trim();
    const ingredients = f.ingredients.value.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!text || !ingredients.length) return;
    const meta = { ingredients };
    const u = f.url.value ? safeUrl(f.url.value) : "";
    if (u) meta.url = u;
    if (f.id.value) patchItem(f.id.value, { text, meta }); else addItem(newItem("oppskrift", text, meta));
    resetRecipe();
  });
  $("recipe-cancel").addEventListener("click", resetRecipe);
  $("list-oppskrift").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-edit]"); if (!b) return;
    const r = state.items.find((i) => i.id === b.dataset.edit); if (!r) return;
    rf.elements.id.value = r.id; rf.elements.text.value = r.text;
    rf.elements.ingredients.value = (r.meta?.ingredients || []).join("\n");
    rf.elements.url.value = r.meta?.url || "";
    $("recipe-save").textContent = "Lagre endringer"; $("recipe-cancel").hidden = false;
    rf.scrollIntoView({ block: "start" }); rf.elements.text.focus();
  });
  $("gen-handle").addEventListener("click", generateShopping);

  $("dinner-list").addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.target.blur(); });
  $("week-prev").addEventListener("click", () => { state.weekOffset--; renderDinners(); });
  $("week-next").addEventListener("click", () => { state.weekOffset++; renderDinners(); });
  $("cal-refresh").addEventListener("click", () => { refresh(); loadCalendar(); });
  $("logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
}

// ---------- Oppstart ----------
async function startApp() {
  $("login").hidden = true; $("who").hidden = true; $("app").hidden = false;
  $("demo-banner").hidden = !DEMO;
  $("foot-user").textContent = me ? `Innlogget som ${me}` : "";
  $("logout").hidden = DEMO;
  wireUi();
  await refresh();
  loadCalendar();

  let day = today();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (day !== today()) { day = today(); $("dinner-list").dataset.week = ""; }
    refresh(); loadCalendar();
  });
  if (!DEMO) {
    let timer;
    sb.channel("hjemme")
      .on("postgres_changes", { event: "*", schema: "public" }, () => { clearTimeout(timer); timer = setTimeout(refresh, 200); })
      .subscribe();
  }
}

function askName(user) {
  $("login").hidden = true; $("who").hidden = false;
  $("who-buttons").innerHTML = CONFIG.PERSONER.map((p) => `<button type="button" class="btn btn-primary" data-name="${esc(p)}">${esc(p)}</button>`).join("");
  $("who-buttons").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-name]"); if (!b) return;
    me = b.dataset.name;
    await sb.auth.updateUser({ data: { name: me } });
    startApp();
  }, { once: false });
}

function enter(user) {
  me = user.user_metadata?.name || "";
  if (me) startApp(); else askName(user);
}

async function boot() {
  if (DEMO) { me = CONFIG.PERSONER[0]; startApp(); return; }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (session) { enter(session.user); return; }
  $("login").hidden = false;
  $("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("login-error"); err.hidden = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $("login-email").value.trim(), password: $("login-pass").value });
    if (error) { err.textContent = "Feil e-post eller passord."; err.hidden = false; return; }
    enter(data.user);
  });
}

if (typeof document !== "undefined") boot();
