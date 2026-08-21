# Dart Party implementation plan

Dart Party is a mobile-first X01 house-tournament app. Friends select an unplayed match, score it locally visit by visit, and save the complete result once at the end. The production architecture is a static web app backed by one Google Spreadsheet and a small Apps Script API.

## Delivery loops

1. Build and approve the pure X01 engine and n01-inspired match scorer.
2. Build and approve match review and permanent results browsing.
3. Build tournament setup and generation for knockout, one group, and two groups.
4. Build the tournament Matches, Standings, Bracket, and Results screens.
5. Add the master Sheet schema and locked, idempotent Apps Script final saves.
6. Add history, correction safeguards, simultaneous-save conflicts, and deployment.

Each loop ends with tests, a mobile layout check, and a separate self-review before publishing.

## Fixed product rules

- X01 presets: 170, 301, 501, and custom.
- Straight in or double in; always double out.
- Visit-total entry, fixed remaining scores/keypad, scrollable history, undo, and inline current-leg editing.
- No live in-match statistics and no shared in-progress state.
- One final save contains the result, legs, and visits.
- Tournament match states are only unplayed and completed.
- Anyone with the link may score or correct in version one; organiser controls can be added later.
- Group matches are never round-locked.
- Standings: match wins, leg difference, two-player head-to-head, then complete recorded average.
- Manual results progress the tournament but are excluded from dart averages.

The detailed reviewed plan is maintained as the controlling planning artifact outside the checkout for this first implementation loop.
