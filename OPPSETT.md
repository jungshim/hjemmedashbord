# Hjemmedashbord – oppsett

Siden er ren HTML/CSS/JavaScript uten byggesteg. Supabase står for innlogging, felles lagring og kalenderhenting.
Åpner du siden uten å ha fylt inn `config.js`, kjører den i demomodus (lagrer bare i nettleseren din).

Menynavnene i Supabase og GitHub kan avvike litt fra det som står her.

## 1. Lag database (Supabase)

1. Opprett gratis konto på supabase.com og lag et nytt prosjekt. Velg en EU-region.
2. Åpne **SQL Editor**, lim inn hele `supabase/schema.sql` og trykk **Run**.
3. Gjør det samme med `supabase/hendelser.sql`. Den legger inn hendelsene du godkjente fra Google Kalender.

## 2. Lag de to brukerne

1. **Authentication → Sign In / Providers**: slå av «Allow new users to sign up». Da kan ingen andre registrere seg.
2. **Authentication → Users → Add user → Create new user**: lag én bruker til Arne og én til Ildri med e-post og passord. Huk av for «Auto Confirm User».

## 3. Koble siden til databasen

1. **Project Settings → API** (eller «API Keys»): kopier **Project URL** og **anon / publishable key**.
2. Lim dem inn i `config.js` som `SUPABASE_URL` og `SUPABASE_ANON_KEY`.

Anon-nøkkelen er laget for å ligge åpent i nettsider. Det er innloggingen og reglene i `schema.sql` som beskytter dataene.
Bruk aldri `service_role`-nøkkelen i `config.js`.

## 4. Legg siden på nett (GitHub Pages)

1. Lag et nytt repo på github.com og last opp alle filene i denne mappen.
2. **Settings → Pages**: velg «Deploy from a branch», branch `main`, mappe `/ (root)`.
3. Etter et minutt ligger siden på `https://<brukernavn>.github.io/<repo>/`.

Gratis GitHub Pages krever at repoet er offentlig. Koden inneholder ingen hemmeligheter, og dataene ligger bak innlogging.
Vil dere ha privat repo, fungerer Cloudflare Pages eller Netlify på samme måte.

## 5. Koble til Google Kalender (valgfritt)

Kalenderen fungerer uten dette: dere legger inn hendelser direkte i dashbordet.
Gjør dette steget bare hvis dere også vil se hendelser fra Google Kalender.

1. I Google Kalender på PC: velg (eller lag) kalenderen for Falk/happenings → **Innstillinger og deling** → **Integrer kalender** → kopier **Hemmelig adresse i iCal-format**.
2. I Supabase: **Edge Functions → Deploy a new function → Via Editor**. Gi den navnet `kalender`, lim inn innholdet i `supabase/functions/kalender/index.ts` og trykk **Deploy**.
3. **Edge Functions → Secrets**: legg til `ICS_URLS` med adressen fra punkt 1. Flere kalendere skilles med komma.

Den hemmelige adressen gir lesetilgang til hele kalenderen. Den skal bare ligge som secret i Supabase, aldri i `config.js` eller i repoet.
Hendelser fra Google vises sammen med de dere legger inn selv, men kan bare endres i Google Kalender.

## 6. På mobilen

Åpne siden, logg inn, velg navn, og bruk «Legg til på Hjem-skjerm» i nettleseren. Da ligger den som et ikon.

## Slik virker handlelista

1. Lagre oppskrifter under «Oppskrifter» med én ingrediens per linje, for eksempel `400 g kjøttdeig`.
2. Skriv oppskriftens navn i middagsplanen (navnet foreslås mens du skriver).
3. Hold «Hva vi har» oppdatert med det som ligger i kjøleskap, fryser og skap.
4. Trykk «Lag handleliste fra ukas middager». Ingredienser dere har, eller som alt står på lista, hoppes over.

Sammenligningen går på varenavn, ikke mengde. Står «kjøttdeig» i fryseren, regnes den som dekket uansett hvor mye oppskriften trenger.

## Tilpasse

- Navn og hvem ønsker kan være til: `config.js`.
- Farger og skrift: toppen av `styles.css`.
