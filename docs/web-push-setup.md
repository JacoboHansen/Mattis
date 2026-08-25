# Web Push i produksjon

Mattis bruker Vercel Cron til å se etter planlagte økter hvert minutt. Selve
push-abonnementet lagres konto-eid i Supabase, mens varslet bare sier at en
matteøkt snart begynner.

## Konfigurer Vercel

Kjør dette lokalt fra repo-roten for å lage et nytt VAPID-par:

```bash
node scripts/generate-vapid-keys.mjs
```

Legg deretter verdiene inn som Production Environment Variables i Vercel:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` – den offentlige nøkkelen fra skriptet
- `VAPID_PRIVATE_KEY` – den private nøkkelen fra skriptet
- `VAPID_SUBJECT` – for eksempel `mailto:hei@dittdomene.no`
- `CRON_SECRET` – en tilfeldig hemmelig verdi som beskytter cron-ruten
- `SUPABASE_SECRET_KEY` – den nye `sb_secret_...`-nøkkelen fra Supabase-prosjektet

Den private nøkkelen, cron-hemmeligheten og Supabase secret key skal aldri
ligge i GitHub eller i `NEXT_PUBLIC_`-variabler.

Etter at variablene er lagret, redeployer du produksjon. `vercel.json` registrerer
da `/api/cron/push-reminders` som en jobb hvert minutt på Vercel Pro.
