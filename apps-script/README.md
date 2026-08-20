# Google Sheets service

This folder contains the Apps Script backend for one master Dart Party spreadsheet. It is deliberately separate from the React build until the API URL is deployed.

## What it stores

- `Tournaments`: one immutable tournament definition plus its active/completed summary
- `Matches`: one independently writable row per match, including its result, version, and optional full visit detail
- `Audit`: previous and replacement values whenever an organiser explicitly replaces a result

Each save obtains a script lock and changes only one match row. This is what lets several boards finish at almost the same time without overwriting one another.

## Later deployment steps

1. Create one blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Copy `Code.gs` and `appsscript.json` into the bound project.
4. Run `setupDartParty` once and approve access.
5. Deploy as a web app, executing as the owner and allowing anyone with the URL.
6. Put the resulting `/exec` URL into the Dart Party frontend configuration.

Do not do these steps yet; the frontend adapter and deployment verification come next.
