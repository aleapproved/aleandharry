# aleandharry.com

A static site served by GitHub Pages from `main`. No build step: the files in
the repo root are what gets served.

## Running it locally

```bash
npm install          # once
npm start            # http://localhost:8000
```

Every asset is referenced from the site root (`/styles.css`, `/images/…`), so
opening the HTML files directly with `file://` renders them unstyled. Use the
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
placeholders, since nothing is booked yet, styled with `.tbc` so every
unconfirmed fact hedges in the same voice.

Interior pages open with their mark, then their name as the only heading, and
nothing between that and the content. Every page ends with the same footer
carrying `rsvp@aleandharry.com`, which is the one address guests are given.

The date is **provisional**: Friday, 16 June 2028, nine years to the day from
the first date. It appears on the homepage and The Day, both captioned as
not yet booked.

The homepage countdown ticks every second. Its target lives in one place,
the `data-target` attribute on `#countdown` in `index.html`, currently
`2028-06-16T00:00:00+01:00`. It carries an explicit offset so every guest
counts down to the same instant rather than their own local midnight; edit
that string when there's a start time. Visitors who ask for reduced motion
get a static day count instead of a ticking one.

## Colour

Each page is themed to its Pokémon, in both colour schemes: a pastel paper, a
matching accent, and inks tinted the same way. Hale carries both of us, so it
takes Ditto's lilac as the paper and Mudkip's blue as the accent. Home and the
404 keep the original Solrock cream by day and Lunatone purple by night.

A page names its palette with `data-accent` on `<body>`; `styles.css` defines
each one as a block of `-l` and `-d` pairs, and three small blocks after them
pick between the two. Adding a page means adding one block.

The browser chrome is painted from `meta[name=theme-color]` before the
stylesheet loads, so the two papers are also declared on `<html>` as
`data-paper` and `data-paper-dark`, which is where both the pre-paint script
and `theme-toggle.js` read them from. Change a page's paper and you must change
it in both places; the checks compare them.

**No em dashes**, in prose or in commit messages. A comma, a colon or a full
stop, whichever the sentence actually wants.

## Type

Inter, matching alessandrogillies.com, self-hosted at
`fonts/InterVariable.woff2` and preloaded on every page. It is subset to Latin
and Latin Extended (141KB rather than the full 352KB) with the weight and
optical-size axes intact. Regenerate a subset with:

```bash
python3 -m fontTools.subset InterVariable.woff2 \
  --unicodes="U+0000-00FF,U+0100-017F,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD" \
  --layout-features='*' --flavor=woff2 --output-file=fonts/InterVariable.woff2
```

**No italics anywhere.** Colour, weight and size carry those distinctions
instead. Only the upright font ships, so an italic would be synthesised and
look wrong as well as reading poorly.

## Artwork

`tools/make-badge.py` cuts a character out of its original white-background
artwork. Do not cut them by matching colour, which punches holes through the
drawing that only show up in dark mode. Regenerate with:

```bash
python3 tools/make-badge.py "images/mudkip (1).jpg" images/mudkip-badge.png --height 264
python3 tools/make-badge.py images/solrock.jpg images/solrock-icon.png --canvas 108 108 --content-scale 0.885
```

Artwork that already has an alpha channel is used as-is; only white-background
art gets flooded. The source images in `images/` are inputs to this tool,
so don't delete them.

Photos on Hale ship at three widths (`-640`, `-960`, full) wired through
`srcset`, so a phone doesn't download a desktop-sized file. If you add a photo,
add the variants too: the asset check follows `srcset` and will fail on a
missing candidate.

## Checks

```bash
npm test
```

Renders every page across five widths in both colour schemes and asserts the
things that are easy to break by accident:

- referenced assets all resolve, and no page throws
- the header is the same height on every page, and the nav sits on the same
  line whether or not the page has the current-page underline
- the title lands on the same pixel across pages of the same shape
- each page's `theme-color` matches both its paper and what `<html>` declares
- every page carries the contact address in its footer
- the theme toggle stays circular, and no page scrolls sideways
- the header stays pinned when the page scrolls
- dark mode resolves to the same accent via the OS setting and via the toggle
- the RSVP confirmation is visible once the form is hidden on success
- the guest-only fields reveal and hide with the attending choice
- badge cutouts have no interior holes

## The RSVP worker

`worker/` holds a Cloudflare Worker that validates a submission and appends it
to Airtable. It writes `Name`, `Email`, `Attending`, `Party Size`,
`Guest Names`, `Dietary Requirements` and `Message`. Airtable rejects the
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
