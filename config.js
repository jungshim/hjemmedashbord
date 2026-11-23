// Innstillinger for hjemmedashbordet.
// Så lenge SUPABASE_URL er tom kjører siden i demomodus (data lagres bare i denne nettleseren).
// Lim inn verdiene fra Supabase → Project Settings → API. Anon-nøkkelen er laget for å være offentlig;
// det er innlogging + RLS-reglene i supabase/schema.sql som beskytter dataene.
export const CONFIG = {
  SUPABASE_URL: "https://hsxmfoxfpnjuchipetcb.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeG1mb3hmcG5qdWNoaXBldGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MDA2NTYsImV4cCI6MjExMDk3NjY1Nn0.snZQltBKKs4ZUHIQ4mISp2LZFPuMxZ0aOtNZ8BJ4gSI",

  // Hvem som bruker dashbordet (velges første gang man logger inn).
  PERSONER: ["Arne", "Ildri"],

  // Hvem et ønske kan være til.
  ONSKER_TIL: ["Arne", "Ildri", "Falk", "Hjemmet"],

  // Hvor mange dager frem kalenderen viser.
  KALENDER_DAGER: 30,
};
