# Vercel-oppsett for Mattis

Vercel-prosjektet heter `mattis` og ligger i teamet
`jacobohansens-projects`. Supabase-prosjektet er den dedikerte Mattis-instansen
med ref `ccpyhexgpiqdmtwvzjdd`.

## 1. Koble GitHub-repositoriet

1. Åpne Vercel-prosjektet **mattis**.
2. Gå til **Settings → Git** og koble til `JacoboHansen/Mattis`.
3. Sett **Root Directory** til `apps/web`.
4. Behold **Framework Preset: Next.js** og standardkommandoen `next build`.

Etter dette lager `main` produksjonsdeploy og andre brancher egne previews.

## 2. Legg inn miljøvariabler

Gå til **Settings → Environment Variables** og legg inn disse for både
**Production** og **Preview**:

| Variabel                   | Verdi                                      |
| -------------------------- | ------------------------------------------ |
| `SUPABASE_URL`             | `https://ccpyhexgpiqdmtwvzjdd.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase-nøkkelen av typen `publishable`   |
| `MATTIS_ALLOWED_EMAILS`    | Den inviterte testadressen                 |
| `MATTIS_TUTOR_MODEL`       | `openai/gpt-5.6-luna`                      |

Ikke bruk en `secret`- eller `service_role`-nøkkel. Etter endringene velger du
**Redeploy** på siste deploy.

## Visuell testing av økten

Preview-deployments og lokal utvikling har en syntetisk inngang på
`/__test/session`. Den rendrer den faste Nora-økten uten Supabase-cookie, brukerdata eller
databasekall, slik at agent- og visuell testing kan starte direkte på URL-en.

Denne inngangen er begrenset i appens proxy til `NODE_ENV=development` eller
`VERCEL_ENV=preview`. På production kaller siden `notFound()`, og uten gyldig auth-cookie
blir forespørselen fortsatt sendt til innlogging. Dette er en app-level testinngang, ikke en
Vercel Deployment Protection-bypass: behold Vercel Authentication/Password Protection aktivert
for preview-deployments, eller opprett en eksplisitt, begrenset Deployment Protection Exception
for den aktuelle preview-hostnamen når automatisert testing trenger tilgang.

## 3. Aktiver sekssifret e-postkode

1. Åpne Mattis-prosjektet i Supabase.
2. Gå til **Authentication → Email Templates → Magic Link**.
3. Sett emnet til `Din kode til Mattis`.
4. Lim inn innholdet fra `supabase/templates/magic-link.html`.
5. Kontroller at malen inneholder `{{ .Token }}` og lagre.

Hvis testadressen ikke mottar e-post, må **Custom SMTP** konfigureres i
Supabase. Standardutsenderen er begrenset og er ikke egnet til en pilot.

## 4. Test hele flyten

1. Åpne Vercel-adressen i et privat nettleservindu.
2. Skriv inn den inviterte testadressen og be om kode.
3. Skriv inn den sekssifrede koden.
4. Fullfør Nora-onboarding og kontroller at startsiden åpnes.
5. Logg ut fra **Data og personvern**, og logg inn igjen.

Før ekte elevdata brukes må blant annet custom SMTP, sletteflyt, samtykke eller
foresattflyt og automatiske retensjonsjobber være ferdigstilt og kontrollert.
