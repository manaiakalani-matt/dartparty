# Google Sheets service

This folder contains the deployed Apps Script backend for the one master Dart Party spreadsheet.

## What it stores

- `Tournaments`: one immutable tournament definition plus its active/completed summary
- `Matches`: one independently writable row per match, including its result, version, and optional full visit detail
- `Audit`: previous and replacement values whenever an organiser explicitly replaces a result

Each save obtains a script lock and changes only one match row. This is what lets several boards finish at almost the same time without overwriting one another.

## Deployment steps

1. Create one blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Copy `Code.gs` and `appsscript.json` into the bound project.
4. Run `setupDartParty` once and approve access.
5. Deploy as a web app, executing as the owner and allowing anyone with the URL.
6. Put the resulting `/exec` URL into `DART_PARTY_API_URL` in `src/services/tournamentApi.ts`.

The live project uses `@OnlyCurrentDoc`, so the script is limited to the spreadsheet it is bound to.
