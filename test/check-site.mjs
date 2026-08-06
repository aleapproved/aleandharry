import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['index', 'our-story', 'the-day', 'travel', 'rsvp', '404'];
const WIDTHS = [1280, 768, 390, 360, 320];

let failures = 0;

function check(name, condition, detail = '') {
  if (condition) return;
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(name) {
  console.log(`\n${name}`);
}

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();

try {
  // ---------------------------------------------------------------
  // Every asset the pages reference actually exists. Catches a typo'd
  // path or an image renamed without updating the markup.
  // ---------------------------------------------------------------
  section('Assets resolve');
  const referenced = new Set();
  for (const page of PAGES) {
    const html = await readFile(new URL(`../${page}.html`, import.meta.url), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) referenced.add(m[1]);
    // srcset lists extra files the src attribute never mentions.
    for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
      for (const candidate of m[1].split(',')) referenced.add(candidate.trim().split(/\s+/)[0]);
    }
  }
  const manifest = JSON.parse(await readFile(new URL('../site.webmanifest', import.meta.url), 'utf8'));
  for (const icon of manifest.icons) referenced.add(icon.src);

  for (const asset of [...referenced].sort()) {
    const res = await fetch(base + asset);
    check('asset', res.status === 200, `${asset} returned ${res.status}`);
  }
  console.log(`  ${referenced.size} references checked`);

  // ---------------------------------------------------------------
  // Layout invariants, across every page, width and colour scheme.
  // ---------------------------------------------------------------
  section('Layout invariants');
  for (const colorScheme of ['light', 'dark']) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ colorScheme, viewport: { width, height: 800 } });
      const page = await context.newPage();
      const at = `${colorScheme}/${width}px`;

      const headerHeights = new Set();
      const navTops = new Set();
      const contentWidths = new Set();
      const rulePositions = {};
      const ruleCentres = new Set();

      for (const name of PAGES) {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}/${name}.html`);

        const m = await page.evaluate(() => {
          const el = (s) => document.querySelector(s);
          const toggle = el('.theme-toggle').getBoundingClientRect();
          const rule = el('.rule').getBoundingClientRect();
          const root = document.documentElement;
          return {
            headerHeight: +el('.site-header').getBoundingClientRect().height.toFixed(2),
            navTop: +el('.site-header nav a').getBoundingClientRect().top.toFixed(2),
            rule: +rule.top.toFixed(2),
            hasMark: !!el('.page-mark'),
            ruleCentre: +(rule.left + rule.width / 2).toFixed(2),
            // body, not documentElement: clientWidth on the root includes the
            // reserved gutter, so it cannot see the width the content gets.
            contentWidth: document.body.clientWidth,
            gutter: getComputedStyle(root).scrollbarGutter,
            toggleW: +toggle.width.toFixed(2),
            toggleH: +toggle.height.toFixed(2),
            scrollsSideways: root.scrollWidth > root.clientWidth,
            position: getComputedStyle(el('.site-header')).position,
          };
        });

        headerHeights.add(m.headerHeight);
        navTops.add(m.navTop);
        contentWidths.add(m.contentWidth);
        ruleCentres.add(m.ruleCentre);
        rulePositions[name] = { top: m.rule, hasMark: m.hasMark };

        // Without a reserved gutter, pages that scroll are narrower than
        // pages that don't wherever scrollbars take up space, which pulls
        // their centred content sideways. Headless uses overlay scrollbars
        // and cannot show the shift, so assert the guarantee directly.
        check('scrollbar gutter is reserved', m.gutter === 'stable', `${at}/${name}: ${m.gutter}`);

        check('no page errors', errors.length === 0, `${at}/${name}: ${errors[0]}`);
        // A shrunk toggle stops being a circle — the mobile-overflow tell.
        check('toggle is circular', m.toggleW === m.toggleH, `${at}/${name}: ${m.toggleW}x${m.toggleH}`);
        check('does not scroll sideways', !m.scrollsSideways, `${at}/${name}`);
        check('header is sticky', m.position === 'sticky', `${at}/${name}: ${m.position}`);
      }

      check('header height matches across pages', headerHeights.size === 1, `${at}: ${[...headerHeights].join(', ')}`);
      // The current-page underline must occupy space on every link, or the
      // nav sits a pixel or two higher on the pages that have one.
      check('nav sits on the same line across pages', navTops.size === 1, `${at}: ${[...navTops].join(', ')}`);
      // Interior pages open with an optional mark, an eyebrow, a title and a
      // rule. Pages carrying a mark sit lower by exactly the mark's height, so
      // compare like with like: the rule must land on the same pixel within
      // each group, or those pages look misaligned against each other.
      for (const withMark of [true, false]) {
        const group = ['our-story', 'the-day', 'travel', 'rsvp']
          .filter((n) => rulePositions[n].hasMark === withMark);
        if (group.length < 2) continue;
        const tops = group.map((n) => rulePositions[n].top);
        check(
          `rule aligns across interior pages ${withMark ? 'with' : 'without'} a mark`,
          new Set(tops).size === 1,
          `${at}: ${group.map((n, i) => `${n} ${tops[i]}`).join(', ')}`
        );
      }
      check('content width matches across pages', contentWidths.size === 1, `${at}: ${[...contentWidths].join(', ')}`);
      check('rule is centred on the same pixel across pages', ruleCentres.size === 1, `${at}: ${[...ruleCentres].join(', ')}`);

      await context.close();
    }
  }
  console.log(`  ${PAGES.length * WIDTHS.length * 2} page renders checked`);

  // ---------------------------------------------------------------
  // The sticky header keeps its place once the page scrolls.
  // ---------------------------------------------------------------
  section('Sticky header');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 420 } });
    await page.goto(`${base}/our-story.html`);
    await page.evaluate(() => window.scrollTo(0, 300));
    const top = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().top);
    const scrolled = await page.evaluate(() => window.scrollY);
    check('page actually scrolled', scrolled > 100, `scrollY ${scrolled}`);
    check('header pinned to top', top === 0, `top ${top}`);
    await page.close();
  }

  // ---------------------------------------------------------------
  // Cutting a character out of its white artwork by matching colour
  // punches holes wherever the drawing contains a light or a
  // compression-speckled pixel. They are invisible on the cream page and
  // show as a dark rash in dark mode — Bellibolt's pupils looked like
  // they had a border. Anti-aliasing along the silhouette is legitimate,
  // so only count half-transparent pixels well inside the shape.
  // ---------------------------------------------------------------
  section('Cutout quality');
  {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html`);
    for (const file of ['mudkip-badge.png', 'ditto-badge.png', 'bellibolt-badge.png',
                        'chansey-badge.png', 'lapras-badge.png',
                        'solrock-icon.png', 'lunatone-icon.png']) {
      const holes = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
        const alpha = (x, y) => data[(y * width + x) * 4 + 3];

        let count = 0;
        const R = 3;
        for (let y = R; y < height - R; y++) {
          for (let x = R; x < width - R; x++) {
            const a = alpha(x, y);
            if (a === 0 || a >= 250) continue;
            let nearEdge = false;
            for (let dy = -R; dy <= R && !nearEdge; dy++) {
              for (let dx = -R; dx <= R; dx++) {
                if (alpha(x + dx, y + dy) === 0) { nearEdge = true; break; }
              }
            }
            if (!nearEdge) count++;
          }
        }
        return count;
      }, `/images/${file}`);
      check('cutout has no interior holes', holes < 150, `${file}: ${holes} half-transparent pixels inside the shape`);
    }
    await page.close();
  }

  // ---------------------------------------------------------------
  // Dark mode must look the same however you arrive at it: the OS
  // setting and the toggle used to resolve to different accents.
  // ---------------------------------------------------------------
  section('Theme');
  {
    const accent = (page) =>
      page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());

    const osDark = await browser.newContext({ colorScheme: 'dark' });
    const a = await osDark.newPage();
    await a.goto(`${base}/index.html`);
    const fromOS = await accent(a);
    await osDark.close();

    const osLight = await browser.newContext({ colorScheme: 'light' });
    const b = await osLight.newPage();
    await b.goto(`${base}/index.html`);
    await b.click('#themeToggle');
    const fromToggle = await accent(b);

    check('dark accent is the same via OS and via toggle', fromOS === fromToggle, `${fromOS} vs ${fromToggle}`);
    check('toggle produced dark mode', await b.evaluate(() => document.documentElement.dataset.theme) === 'dark');

    // The choice has to survive navigation, which is what localStorage is for.
    await b.goto(`${base}/our-story.html`);
    check('theme persists across pages', await b.evaluate(() => document.documentElement.dataset.theme) === 'dark');
    await osLight.close();
  }

  // ---------------------------------------------------------------
  // The RSVP confirmation. This lived inside the form, so hiding the
  // form on success hid the thank-you along with it.
  // ---------------------------------------------------------------
  section('RSVP');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.goto(`${base}/rsvp.html`);

    const partyCount = await page.locator('.field-party').count();
    check('guest-only fields exist', partyCount === 3, `found ${partyCount}`);
    check('guest-only fields hidden until attending is chosen',
      await page.locator('.field-party').first().isHidden());
    await page.click('label[for="attendingYes"]');
    for (const id of ['partySize', 'guestNames', 'dietary']) {
      check(`${id} shown after choosing yes`, await page.locator('#' + id).isVisible());
    }
    await page.click('label[for="attendingNo"]');
    check('guest-only fields hidden again after choosing no',
      await page.locator('.field-party').first().isHidden());
    check('message stays visible for people who cannot come',
      await page.locator('#message').isVisible());

    // Submitting must be caught here, not at the worker.
    await page.click('.rsvp-submit');
    check('empty name is rejected client-side',
      await page.locator('#rsvpStatus').isVisible());
    check('empty name focuses the field',
      await page.evaluate(() => document.activeElement.id) === 'name');

    await page.fill('#name', 'Test Guest');
    await page.fill('#email', 'not-an-email');
    await page.click('.rsvp-submit');
    check('bad email is rejected client-side',
      (await page.locator('#rsvpStatus').textContent()).includes('email'));
    check('bad email focuses the field',
      await page.evaluate(() => document.activeElement.id) === 'email');

    // Drive the success state directly — the real submit needs the worker.
    await page.evaluate(() => {
      document.getElementById('rsvpForm').classList.add('is-hidden');
      const status = document.getElementById('rsvpStatus');
      status.textContent = 'Thank you.';
      status.dataset.state = 'success';
      status.classList.remove('is-hidden');
    });
    check('confirmation is visible once the form is hidden',
      await page.locator('#rsvpStatus').isVisible());
    await page.close();
  }

  // ---------------------------------------------------------------
  section('404 handling');
  {
    const res = await fetch(`${base}/no-such-page`);
    check('unknown path serves the 404 page', res.status === 404);
    check('404 page has its own title', (await res.text()).includes('Page not found'));
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
