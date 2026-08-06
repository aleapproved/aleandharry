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

## Checks

```bash
npm test
```

Renders every page across five widths in both colour schemes and asserts the
things that are easy to break by accident:

- referenced assets all resolve, and no page throws
- the header is the same height on every page, and the nav sits on the same
  line whether or not the page has the current-page underline
- the rule under the title lands on the same pixel on Our Story and RSVP
- the theme toggle stays circular, and no page scrolls sideways
- the header stays pinned when the page scrolls
- dark mode resolves to the same accent via the OS setting and via the toggle
- the RSVP confirmation is visible once the form is hidden on success

## The RSVP worker

`worker/` holds a Cloudflare Worker that validates a submission and appends it
to Airtable. To run it against the real base:

```bash
cd worker
echo 'AIRTABLE_RUNTIME_TOKEN=…' > .dev.vars   # gitignored
npx wrangler dev
```

Then point `RSVP_ENDPOINT` in `rsvp.js` at `http://localhost:8787` and
`ALLOWED_ORIGIN` in `worker/src/index.js` at `http://localhost:8000`, reverting
both before committing. Note that this writes real rows to Airtable.

Deploy with `npx wrangler deploy` from `worker/`.
