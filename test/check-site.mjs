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

  // redirect: manual, because following redirects would let a link written as
  // /travel.html look healthy here while costing every visitor a round trip:
  // the host publishes /travel and 308s the .html form to it.
  for (const asset of [...referenced].sort()) {
    const res = await fetch(base + asset, { redirect: 'manual' });
    check('asset resolves without redirecting', res.status === 200,
      `${asset} returned ${res.status}${res.headers.get('location') ? ` to ${res.headers.get('location')}` : ''}`);
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
      const titlePositions = {};
      const ruleCentres = new Set();

      for (const name of PAGES) {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}/${name}.html`);

        const m = await page.evaluate(() => {
          const el = (s) => document.querySelector(s);
          const toggle = el('.theme-toggle').getBoundingClientRect();
          // Only the homepage and the 404 still carry a rule; interior pages
          // open on their title alone.
          const rule = el('.rule')?.getBoundingClientRect();
          const title = el('h1.page-title')?.getBoundingClientRect();
          const root = document.documentElement;
          return {
            headerHeight: +el('.site-header').getBoundingClientRect().height.toFixed(2),
            navTop: +el('.site-header nav a').getBoundingClientRect().top.toFixed(2),
            title: title ? +title.top.toFixed(2) : null,
            hasMark: !!el('.page-mark'),
            ruleCentre: rule ? +(rule.left + rule.width / 2).toFixed(2) : null,
            paper: getComputedStyle(document.body).getPropertyValue('--paper').trim(),
            themeColor: el('meta[name="theme-color"]').content,
            declaredPaper: root.dataset[root.dataset.theme === 'dark' ? 'paperDark' : 'paper'],
            email: el('.site-footer a[href^="mailto:"]')?.getAttribute('href'),
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
        if (m.ruleCentre !== null) ruleCentres.add(m.ruleCentre);
        titlePositions[name] = { top: m.title, hasMark: m.hasMark };

        // The browser chrome is painted from <html>'s two papers before the
        // stylesheet loads, so a page whose palette moved on without them
        // flashes the wrong colour behind the address bar.
        check('theme-color matches the page palette', m.themeColor === m.paper,
          `${at}/${name}: chrome ${m.themeColor}, page ${m.paper}`);
        check('theme-color matches what <html> declares', m.themeColor === m.declaredPaper,
          `${at}/${name}: meta ${m.themeColor}, html ${m.declaredPaper}`);
        check('every page offers a way to reach us',
          m.email === 'mailto:rsvp@aleandharry.com', `${at}/${name}: ${m.email}`);

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
      // Interior pages open with an optional mark and then their title, and
      // nothing else. Pages carrying a mark sit lower by exactly the mark's
      // height, so compare like with like: the title must land on the same
      // pixel within each group, or those pages look misaligned against
      // each other when you move between them.
      for (const withMark of [true, false]) {
        const group = ['our-story', 'the-day', 'travel', 'rsvp']
          .filter((n) => titlePositions[n].hasMark === withMark);
        if (group.length < 2) continue;
        const tops = group.map((n) => titlePositions[n].top);
        check(
          `title aligns across interior pages ${withMark ? 'with' : 'without'} a mark`,
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
  // Photos enlarge on a click. The parts worth pinning down are the ones
  // that are easy to lose: the keyboard route in, the full-size file rather
  // than the phone-sized one, and every way back out.
  // ---------------------------------------------------------------
  section('Lightbox');
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto(`${base}/our-story.html`);
    const at = `${width}px`;

    const photos = page.locator('.moment img');
    const count = await photos.count();
    check('every photo is clickable', count > 0
      && (await page.locator('.moment .zoom > img').count()) === count, `${at}: ${count} photos`);

    const widthBefore = await page.evaluate(() => document.body.clientWidth);
    await page.locator('.moment .zoom').first().click();
    const open = await page.evaluate(() => {
      const d = document.querySelector('.lightbox');
      return { open: d.open, src: d.querySelector('.lightbox-image').getAttribute('src') };
    });
    check('clicking a photo opens the lightbox', open.open, at);
    // A -640 or -960 candidate here means the enlarged view is an upscale
    // of the thumbnail the column happened to be served.
    check('lightbox shows the full-size file', /firstdatemap\.png$/.test(open.src), `${at}: ${open.src}`);

    // The page behind must not scroll away under the overlay, and holding it
    // still must not narrow it either, or everything shifts on open.
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(100);
    check('page does not scroll behind the lightbox',
      await page.evaluate(() => window.scrollY) === scrollBefore, at);
    check('locking the page does not change its width',
      await page.evaluate(() => document.body.clientWidth) === widthBefore, at);

    // Fitted, a landscape photo on a phone is barely wider than it was in the
    // column, so clicking it has to go to the file's own pixels.
    const fitted = await page.evaluate(() => document.querySelector('.lightbox-image').clientWidth);
    await page.locator('.lightbox-image').click();
    const zoomed = await page.evaluate(() => document.querySelector('.lightbox-image').clientWidth);
    check('clicking the photo zooms it past the screen', zoomed > fitted && zoomed > width,
      `${at}: ${fitted}px fitted, ${zoomed}px zoomed`);
    check('the zoomed photo stays open', await page.evaluate(() => document.querySelector('.lightbox').open), at);
    await page.locator('.lightbox-image').click({ position: { x: 5, y: 5 } });
    check('clicking again returns it to the screen',
      await page.evaluate(() => document.querySelector('.lightbox-image').clientWidth) === fitted, at);

    // The surface around the photo is a way out, which is most of the screen
    // on a phone and the only thing a thumb reliably lands on.
    await page.locator('.lightbox-stage').click({ position: { x: 2, y: 2 } });
    check('clicking beside the photo closes the lightbox',
      await page.evaluate(() => !document.querySelector('.lightbox').open), at);

    await page.locator('.moment .zoom').first().click();
    await page.keyboard.press('Escape');
    check('escape closes the lightbox',
      await page.evaluate(() => !document.querySelector('.lightbox').open), at);
    check('focus returns to the photo that was opened',
      await page.evaluate(() => document.activeElement?.classList.contains('zoom')), at);

    // Keyboard: the wrapper is a real button, so Enter opens it.
    await page.keyboard.press('Enter');
    check('enter opens the lightbox', await page.evaluate(() => document.querySelector('.lightbox').open), at);
    await page.locator('.lightbox-close').click();
    check('the close button closes the lightbox',
      await page.evaluate(() => !document.querySelector('.lightbox').open), at);

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
