// Edge Function «kalender»: henter Google Kalender via hemmelig iCal-adresse
// og returnerer kommende hendelser til innloggede brukere.
//
// Secret som må settes i Supabase (Edge Functions → Secrets):
//   ICS_URLS = én eller flere hemmelige iCal-adresser, adskilt med komma.
import { createClient } from "npm:@supabase/supabase-js@2";
import ICAL from "npm:ical.js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Hendelse = { title: string; start: string; end: string; allDay: boolean; location: string };

// deno-lint-ignore no-explicit-any
const ut = (t: any) => (t.isDate ? t.toString().slice(0, 10) : t.toJSDate().toISOString());

export function hentHendelser(icsText: string, fra: Date, til: Date): Hendelse[] {
  const vcal = new ICAL.Component(ICAL.parse(icsText));
  for (const tz of vcal.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  // deno-lint-ignore no-explicit-any
  const hoved = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  const unntak: any[] = [];
  for (const comp of vcal.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(comp);
    if (ev.isRecurrenceException()) unntak.push(ev); else hoved.set(ev.uid, ev);
  }
  for (const ex of unntak) {
    const m = hoved.get(ex.uid);
    if (m) m.relateException(ex); else hoved.set(ex.uid + ex.recurrenceId, ex);
  }

  const ut_: Hendelse[] = [];
  // deno-lint-ignore no-explicit-any
  const leggTil = (item: any, start: any, slutt: any) => {
    const s = start.toJSDate(), e = slutt.toJSDate();
    if (e <= fra || s >= til) return;
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    ut_.push({
      title: item.summary || "(uten tittel)",
      start: ut(start), end: ut(slutt), allDay: !!start.isDate,
      location: item.location || "",
    });
  };

  for (const ev of hoved.values()) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) { leggTil(ev, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    for (let i = 0, neste = it.next(); neste && i < 5000; i++, neste = it.next()) {
      if (neste.toJSDate() >= til) break;
      const d = ev.getOccurrenceDetails(neste);
      leggTil(d.item, d.startDate, d.endDate);
    }
  }
  return ut_.sort((a, b) => a.start.localeCompare(b.start));
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    // Bare innloggede brukere av dashbordet får se kalenderen.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Ikke innlogget." }, 401);

    const urls = (Deno.env.get("ICS_URLS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return json({ error: "Kalenderen er ikke koblet til ennå. Se steg 5 i OPPSETT.md." });

    let dager = 30;
    try { const b = await req.json(); if (Number(b?.dager) > 0) dager = Math.min(Number(b.dager), 120); } catch { /* standardverdi */ }
    const fra = new Date(); fra.setUTCHours(0, 0, 0, 0);
    const til = new Date(fra.getTime() + dager * 864e5);

    try {
      const tekster = await Promise.all(urls.map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      }));
      const events = tekster.flatMap((t) => hentHendelser(t, fra, til))
        .sort((a, b) => a.start.localeCompare(b.start));
      return json({ events });
    } catch (_e) {
      return json({ error: "Kunne ikke hente kalenderen. Sjekk at iCal-adressen i ICS_URLS er riktig." });
    }
  });
}
