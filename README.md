# aleandharry.com

A static site served by GitHub Pages from `main`. No build step — the files in
the repo root are what gets served.

## Running it locally

```bash
npm install          # once
npm start            # http://localhost:8000
```

Every asset is referenced from the site root (`/styles.css`, `/images/…`), so
opening the HTML files directly with `file://` renders them unstyled — use the
server. It mirrors GitHub Pages, including serving `404.html` for unknown paths.

Two things to know while poking around:

- **The theme toggle sticks.** The choice is kept in `localStorage` and applied
  before first paint, so it overrides your OS setting on every later visit. Run
  `localStorage.removeItem('theme')` in the console to get back to a fresh
  visitor's view.
- **The RSVP form won't submit locally.** The worker only accepts requests from
  `https://aleandharry.com`, so a POST from localhost fails CORS preflight. See
  below for exercising it for real.

## Pages

`index` (names, provisional date, countdown), `our-story`, `the-day`,
`travel`, `rsvp`, `404`. The Day and Travel are deliberately full of
placeholders — nothing is booked yet — styled with `.tbc` so every
unconfirmed fact hedges in the same voice.

The date is **provisional**: Friday 16 June 2028, nine years to the day from
the first date. It appears on the homepage and The Day, both captioned as
not yet booked.

The homepage countdown ticks every second. Its target lives in one place —
the `data-target` attribute on `#countdown` in `index.html`, currently
`2028-06-16T00:00:00+01:00`. It carries an explicit offset so every guest
counts down to the same instant rather than their own local midnight; edit
that string when there's a start time. Visitors who ask for reduced motion
get a static day count instead of a ticking one.

## Artwork

`tools/make-badge.py` cuts a character out of its original white-background
artwork. Do not cut them by matching colour — that punches holes through the
drawing that only show up in dark mode. Regenerate with:

```bash
python3 tools/make-badge.py "images/mudkip (1).jpg" images/mudkip-badge.png --height 264
python3 tools/make-badge.py images/solrock.jpg images/solrock-icon.png --canvas 108 108 --content-scale 0.885
```

The source JPEGs in `images/` are inputs to this tool — don't delete them.

## Checks

```bash
npm test
```

Renders every page across five widths in both colour schemes and asserts the
things that are easy to break by accident:

- referenced assets all resolve, and no page throws
- the header is the same height on every page, and the nav sits on the same
  line whether or not the page has the current-page underline
- the rule under the title lands on the same pixel across pages of the same shape
- the theme toggle stays circular, and no page scrolls sideways
- the header stays pinned when the page scrolls
- dark mode resolves to the same accent via the OS setting and via the toggle
- the RSVP confirmation is visible once the form is hidden on success
- the guest-only fields reveal and hide with the attending choice
- badge cutouts have no interior holes

## The RSVP worker

`worker/` holds a Cloudflare Worker that validates a submission and appends it
to Airtable. It writes `Name`, `Email`, `Attending`, `Party Size`,
`Guest Names`, `Dietary Requirements` and `Message` — Airtable rejects the
whole record if a field doesn't exist, so add the column before sending a new
one. To run it against the real base:

```bash
cd worker
echo 'AIRTABLE_RUNTIME_TOKEN=…' > .dev.vars   # gitignored
npx wrangler dev
```

Then point `RSVP_ENDPOINT` in `rsvp.js` at `http://localhost:8787` and
`ALLOWED_ORIGIN` in `worker/src/index.js` at `http://localhost:8000`, reverting
both before committing. Note that this writes real rows to Airtable.

Deploy with `npx wrangler deploy` from `worker/`.
