# Activate the six-digit login code

Supabase sends a magic link unless the hosted Magic Link template includes the
token variable. This repository cannot change that dashboard setting through a
database migration.

1. Open the `Mattis` project (`ccpyhexgpiqdmtwvzjdd`) in Supabase.
2. Go to **Authentication → Email Templates → Magic Link**.
3. Set the subject to `Din kode til Mattis`.
4. Replace the template body with `magic-link.html` from this directory.
5. Save, then request a code from the Mattis login screen.

The important variable is `{{ .Token }}`. Keep email confirmation enabled and
anonymous sign-in disabled.

The Supabase default trial mailer can be restricted and is not intended for
production. If the invited plus-address does not receive the test code, add a
custom SMTP provider in **Project Settings → Authentication → SMTP Settings**
before retrying.
