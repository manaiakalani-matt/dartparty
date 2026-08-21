# Dart Party

A phone-first X01 darts tournament app for house parties. Dart Party keeps the tournament table simple while allowing several boards to play matches at the same time.

## Current prototype

- 170, 301, 501, or a custom X01 starting score
- Straight in or double in; always double out
- Straight knockout, one group plus knockout, or two groups plus knockout
- Round-robin schedules, byes, knockout progression, stage-specific match lengths, and live standings
- Full visit-by-visit scorer with bust and checkout handling, undo, and inline visit editing
- Manual result entry and detailed match results
- Live Google Sheets persistence through the deployed Apps Script API
- Concurrent boards with first-save-wins conflict protection and explicit replacement

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

## Persistence

One master Google Sheet stores every tournament, match result, visit history, and replacement audit record. A match remains on the scoring device until the player taps **Save result**. Each final save is locked and written to its own match row, so multiple boards can finish simultaneously without overwriting each other.

If two devices save the same match, the first result wins. The second device sees the saved score and can either keep it or explicitly replace it. Replacements use version checks and are blocked after a dependent knockout match has been completed.
