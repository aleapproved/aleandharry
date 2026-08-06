import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['index', 'our-story', 'rsvp', '404'];
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
      const rulePositions = {};

      for (const name of PAGES) {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}/${name}.html`);

        const m = await page.evaluate(() => {
          const el = (s) => document.querySelector(s);
          const toggle = el('.theme-toggle').getBoundingClientRect();
          const root = document.documentElement;
          return {
            headerHeight: +el('.site-header').getBoundingClientRect().height.toFixed(2),
            navTop: +el('.site-header nav a').getBoundingClientRect().top.toFixed(2),
            rule: +el('.rule').getBoundingClientRect().top.toFixed(2),
            toggleW: +toggle.width.toFixed(2),
            toggleH: +toggle.height.toFixed(2),
            overflow: root.scrollWidth - root.clientWidth,
            position: getComputedStyle(el('.site-header')).position,
          };
        });

        headerHeights.add(m.headerHeight);
        navTops.add(m.navTop);
        rulePositions[name] = m.rule;

        check('no page errors', errors.length === 0, `${at}/${name}: ${errors[0]}`);
        // A shrunk toggle stops being a circle — the mobile-overflow tell.
        check('toggle is circular', m.toggleW === m.toggleH, `${at}/${name}: ${m.toggleW}x${m.toggleH}`);
        check('no horizontal overflow', m.overflow === 0, `${at}/${name}: ${m.overflow}px`);
        check('header is sticky', m.position === 'sticky', `${at}/${name}: ${m.position}`);
      }

      check('header height matches across pages', headerHeights.size === 1, `${at}: ${[...headerHeights].join(', ')}`);
      // The current-page underline must occupy space on every link, or the
      // nav sits a pixel or two higher on the pages that have one.
      check('nav sits on the same line across pages', navTops.size === 1, `${at}: ${[...navTops].join(', ')}`);
      // Both interior pages open with a mark, an eyebrow, a title and a rule —
      // the rule has to land on the same pixel or the pages look misaligned.
      check(
        'rule aligns across interior pages',
        rulePositions['our-story'] === rulePositions['rsvp'],
        `${at}: our-story ${rulePositions['our-story']} vs rsvp ${rulePositions['rsvp']}`
      );

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

    check('party size hidden until attending is chosen',
      await page.locator('.field-party').isHidden());
    await page.click('label[for="attendingYes"]');
    check('party size shown after choosing yes',
      await page.locator('.field-party').isVisible());
    await page.click('label[for="attendingNo"]');
    check('party size hidden again after choosing no',
      await page.locator('.field-party').isHidden());

    // Submitting with no name must be caught here, not at the worker.
    await page.click('.rsvp-submit');
    check('empty name is rejected client-side',
      await page.locator('#rsvpStatus').isVisible());
    check('empty name focuses the field',
      await page.evaluate(() => document.activeElement.id) === 'name');

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
