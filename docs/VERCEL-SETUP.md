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

| Variabel | Verdi |
| --- | --- |
| `SUPABASE_URL` | `https://ccpyhexgpiqdmtwvzjdd.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase-nøkkelen av typen `publishable` |
| `MATTIS_ALLOWED_EMAILS` | `jacob.oskar.hansen+nora@gmail.com` |

Ikke bruk en `secret`- eller `service_role`-nøkkel. Etter endringene velger du
**Redeploy** på siste deploy.

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
2. Be om kode til den ferdig utfylte testadressen.
3. Skriv inn den sekssifrede koden.
4. Fullfør Nora-onboarding og kontroller at startsiden åpnes.
5. Logg ut fra **Data og personvern**, og logg inn igjen.

Før ekte elevdata brukes må blant annet custom SMTP, sletteflyt, samtykke eller
foresattflyt og automatiske retensjonsjobber være ferdigstilt og kontrollert.
