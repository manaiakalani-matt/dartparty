# Dart Party

A phone-first X01 darts tournament app for house parties. Dart Party keeps the tournament table simple while allowing several boards to play matches at the same time.

## Current prototype

- 170, 301, 501, or a custom X01 starting score
- Straight in or double in; always double out
- Straight knockout, one group plus knockout, or two groups plus knockout
- Round-robin schedules, byes, knockout progression, stage-specific match lengths, and live standings
- Full visit-by-visit scorer with bust and checkout handling, undo, and inline visit editing
- Manual result entry and detailed match results
- Local browser persistence while the Google Sheets service is being built

The product and implementation plan is in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## Persistence roadmap

The current UI stores completed tournaments in `localStorage` for end-to-end testing. The production persistence layer will use one master Google Sheet and a deployed Apps Script web service. A match remains local until the player taps **Save result**. The server will use first-save-wins conflict protection and return the already-saved result before offering an explicit replacement.
