# aleandharry.com

A static site on Cloudflare Pages, published from `main`. No build step: the
files in the repo root are the site. The deploy stages them into `_site` first
so that the checks, the badge tooling and the worker's source stay in the repo
rather than turning up under aleandharry.com.

## Running it locally

```bash
npm install          # once
npm start            # http://localhost:8000
```

Every asset is referenced from the site root (`/styles.css`, `/images/…`), so
opening the HTML files directly with `file://` renders them unstyled. Use the
server. It mirrors the host, including serving `404.html` for unknown paths.

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
missing candidate. Resize with:

```bash
magick images/photo.jpg -resize 640x -strip -interlace JPEG -quality 82 images/photo-640.jpg
```

`lightbox.js` enlarges any photo inside a `.moment` on a click. The header
stays where it is and stays sharp; the photo grows into the space below it,
over a thin wash of the page's own paper and a light blur, so it reads as the
photo growing rather than as a viewer opening over the top. It is never
cropped and never scrolls. A click anywhere, escape, or the close button puts
it back.

The script wraps each image in a button at load, so the markup stays a plain
`figure` and a visitor without JavaScript still sees every photo at page size.
It measures the header into `--header-h` on open, since the header is two rows
on a phone. A phone gains least from all this, its photos already spanning the
column, so the margin around the enlarged photo narrows to almost nothing
there. Touch also gets a press and a bounce, which needs the empty
`touchstart` listener in the script: iOS will not fire `:active` without one.

Add it to a page with `<script src="/lightbox.js" defer></script>`; it does
nothing on a page with no photos.

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
- photos enlarge whole, keep the header visible, and close every way out
- badge cutouts have no interior holes

## Deploying

Pushing to `main` runs `.github/workflows/pages.yml`, which runs the checks
above and then, only if they pass, stages the site and uploads it with
`wrangler pages deploy`. A pull request gets the checks and stops there. It
needs one repo secret, `CLOUDFLARE_API_TOKEN`, with Cloudflare Pages edit
rights; the account ID is in the workflow, since on its own it authorises
nothing.

The deploy stamps a content hash into the URL of the stylesheet and each
script as it stages them, so the pages ask for `/styles.css?v=1a2b3c4d5e`.
Pages revalidate on every load but assets are cached for four hours, and
without this a deploy that changed both left visitors running new markup
against old CSS for the rest of the afternoon. It cost an afternoon once:
photos wrapped in buttons the cached stylesheet knew nothing about rendered
as grey boxes. The files keep their plain names in the repo, so nothing about
working locally changes, and the deploy fails if a page slips through still
asking for an unstamped name.

The deploy stays here rather than moving to Cloudflare Pages' own Git
integration, which would publish the moment you push and cannot be made to
wait for a check. Gating it there would mean running the checks in the Pages
build container, which has no root and so cannot install Chromium's system
dependencies.

DNS for aleandharry.com is on Cloudflare. The apex and `www` resolve to the
Pages project; the Fastmail `MX` records are untouched by any of this and must
stay that way. If a deploy ever needs backing out in a hurry, the site is
static and every previous deployment stays addressable in the Pages dashboard,
so rolling back is a promotion rather than a revert.

## The RSVP worker

`worker/` holds a Cloudflare Worker that validates a submission and appends it
to Airtable. It writes `Name`, `Email`, `Attending`, `Party Size`,
`Guest Names`, `Dietary Requirements` and `Message`. Airtable rejects the
whole record if a field doesn't exist, so add the column before sending a new
one.

It is routed at `aleandharry.com/api/rsvp`, so the form posts to its own origin
and no CORS preflight happens in the browser at all. Worker routes are matched
ahead of Pages, so that one path is the worker and every other path is the site.

Declaring that route also switches the `workers.dev` URL off, which is what we
want: one public endpoint writing to Airtable rather than two. The CORS handling
in the worker stays, because the local flow below runs the site on port 8000 and
the worker on 8787, which is cross-origin.

To run it against the real base:

```bash
cd worker
echo 'AIRTABLE_RUNTIME_TOKEN=…' > .dev.vars   # gitignored
npx wrangler dev
```

Then point `RSVP_ENDPOINT` in `rsvp.js` at `http://localhost:8787` and
`ALLOWED_ORIGIN` in `worker/src/index.js` at `http://localhost:8000`, reverting
both before committing. Note that this writes real rows to Airtable.

Deploy with `npx wrangler deploy` from `worker/`.
