// The safari at /game. One page, one mechanic: a ring falls in around a
// Pokémon and the throw is scored on how close it was to the circle when the
// ball left your hand. Everything else is dressing on that.
//
// Nothing here is loaded by any other page. It keeps its own state in
// localStorage, so a visitor's collection survives closing the tab without
// ever asking them who they are.

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // Who lives here. The seven are the site's own Pokémon, one per page,
  // which is why there are seven and not a hundred and fifty.
  //
  //   rate   the odds of a catch on a throw of no particular quality
  //   weight how often it turns up relative to the others
  //   speed  how fast its ring falls, so a rare one is also a harder throw
  //   tint   the shiny, as a filter over the same drawing
  //   only   'day' or 'night' for the two that keep hours
  // ---------------------------------------------------------------
  var ROSTER = [
    {
      key: 'mudkip', name: 'Mudkip', art: '/images/mudkip-badge.png',
      weight: 22, rate: 0.62, speed: 0.95,
      tint: 'hue-rotate(108deg) saturate(1.1)',
      where: 'Hale', note: 'One half of the pair that page is named after.'
    },
    {
      key: 'ditto', name: 'Ditto', art: '/images/ditto-badge.png',
      weight: 20, rate: 0.55, speed: 1,
      tint: 'hue-rotate(165deg) saturate(1.25)',
      where: 'Hale', note: 'The other half. Never quite the same shape twice.'
    },
    {
      key: 'bellibolt', name: 'Bellibolt', art: '/images/bellibolt-badge.png',
      weight: 18, rate: 0.5, speed: 1.05,
      tint: 'hue-rotate(180deg) saturate(1.3)',
      where: 'RSVP', note: 'Lights up whenever somebody replies.'
    },
    {
      key: 'lapras', name: 'Lapras', art: '/images/lapras-badge.png',
      weight: 13, rate: 0.42, speed: 1.12,
      tint: 'hue-rotate(125deg) saturate(1.2)',
      where: 'Travel', note: 'Will get you there, in its own time.'
    },
    {
      key: 'solrock', name: 'Solrock', art: '/images/solrock-badge.png',
      weight: 12, rate: 0.46, speed: 1.15, only: 'day',
      tint: 'hue-rotate(-120deg) saturate(1.35)',
      where: 'the front page', note: 'Never comes out once the site is dark.'
    },
    {
      key: 'lunatone', name: 'Lunatone', art: '/images/lunatone-badge.png',
      weight: 12, rate: 0.46, speed: 1.15, only: 'night',
      tint: 'hue-rotate(200deg) saturate(2)',
      where: 'the front page', note: 'Never comes out while the site is in daylight.'
    },
    {
      key: 'chansey', name: 'Chansey', art: '/images/chansey-badge.png',
      weight: 7, rate: 0.3, speed: 1.25,
      tint: 'hue-rotate(205deg) saturate(1.3)',
      where: 'The Day', note: 'Turns up wherever there is fussing to be done.'
    }
  ];

  var SHINY_ODDS = 1 / 40;
  var BALLS_PER_ENCOUNTER = 3;

  // How the ring is scored. Distance is measured in ring scale, where 1 is
  // dead on the circle, so the bands mean the same thing at every size.
  var BANDS = [
    { within: 0.07, word: 'Perfect', multiplier: 2 },
    { within: 0.2, word: 'Great', multiplier: 1.45 },
    { within: 0.42, word: 'Nice', multiplier: 1.1 },
    { within: Infinity, word: 'Wide', multiplier: 0.65 }
  ];

  var RING_FROM = 2;
  var RING_TO = 0.5;
  var RING_PERIOD = 1500;

  // Where the encounter happens inside the stage, as fractions of it. The
  // stylesheet puts the artwork, both rings and the flash on the same point;
  // these are the script's copy of it, and they have to agree. GROUND is where
  // a thrown ball comes to rest, which is only the script's business.
  var TARGET = { x: 0.5, y: 0.46 };
  var GROUND = 0.8;

  var STORE_KEY = 'aleandharry:safari:v1';

  // ---------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------
  var el = {};
  ['stageWrap', 'stage', 'creature', 'creatureArt', 'ring', 'ringTarget', 'flash',
   'ballX', 'ballY', 'ballSpin', 'bursts', 'verdict', 'ballCount', 'gameStatus',
   'dex', 'dexRow', 'dexCaption', 'stats', 'statCaught', 'statSpecies',
   'statStreak', 'statBest', 'resetWrap', 'resetBtn', 'soundToggle'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  if (!el.stage) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The whole sequence is a chain of waits. Under reduced motion the site's
  // stylesheet has already cut every animation to nothing, so the same chain
  // would play as a slideshow of finished states: shorten the waits to match.
  function beat(ms) {
    return reducedMotion.matches ? Math.round(ms * 0.35) : ms;
  }

  // Gaps that exist so a line can be read, rather than so a movement can
  // finish, are left alone by beat(). Reading takes as long as it takes, and
  // scaling these down put the result of a throw on screen for half a second.
  var READ_RESULT = 1100;

  // The ring is the game, so it keeps moving under reduced motion rather than
  // being taken away. It moves more slowly instead, which is gentler and, not
  // incidentally, easier.
  function ringPeriodFor(species) {
    return RING_PERIOD / species.speed * (reducedMotion.matches ? 1.6 : 1);
  }

  // ---------------------------------------------------------------
  // Saved progress. A browser with storage switched off still plays; it
  // just forgets, and says so rather than pretending.
  // ---------------------------------------------------------------
  var store = load();
  var storageWorks = true;

  function blank() {
    return { v: 1, sound: false, total: 0, streak: 0, best: 0, species: {} };
  }

  function load() {
    var fresh = blank();
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return fresh;
      var saved = JSON.parse(raw);
      if (!saved || saved.v !== 1 || typeof saved.species !== 'object') return fresh;
      // Read field by field. A file written by a future version, or edited by
      // hand in the console, must not be able to put the game into a state it
      // cannot render.
      fresh.sound = saved.sound === true;
      fresh.total = count(saved.total);
      fresh.streak = count(saved.streak);
      fresh.best = count(saved.best);
      ROSTER.forEach(function (species) {
        var entry = saved.species[species.key];
        if (!entry) return;
        fresh.species[species.key] = {
          caught: count(entry.caught),
          shiny: count(entry.shiny),
          seen: count(entry.seen),
          first: typeof entry.first === 'number' ? entry.first : null
        };
      });
      return fresh;
    } catch (e) {
      return fresh;
    }
  }

  function count(value) {
    return typeof value === 'number' && isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      if (storageWorks) {
        storageWorks = false;
        var note = document.createElement('span');
        note.className = 'store-note';
        note.textContent = 'This browser is not saving your safari.';
        el.resetWrap.appendChild(note);
      }
    }
  }

  function entryFor(key) {
    if (!store.species[key]) store.species[key] = { caught: 0, shiny: 0, seen: 0, first: null };
    return store.species[key];
  }

  function speciesCaught() {
    return ROSTER.filter(function (s) { return entryFor(s.key).caught > 0; }).length;
  }

  // ---------------------------------------------------------------
  // Sound. Synthesised rather than shipped, so it costs nothing to
  // download and is silent until somebody asks for it. Off by default:
  // a website that starts making noise at you has lost the argument.
  // ---------------------------------------------------------------
  var Sound = {
    on: store.sound === true,
    ctx: null,

    wake: function () {
      if (!this.on) return null;
      try {
        if (!this.ctx) {
          var Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) { this.on = false; return null; }
          this.ctx = new Ctx();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      } catch (e) {
        this.on = false;
        return null;
      }
    },

    // One voice: a tone that may slide, under an envelope that never starts
    // or ends at absolute zero, since an exponential ramp cannot reach it.
    tone: function (o) {
      var ctx = this.wake();
      if (!ctx) return;
      var at = ctx.currentTime + (o.delay || 0);
      var dur = o.dur || 0.14;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.from, at);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(o.gain || 0.06, at + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.03);
    },

    appear: function () { this.tone({ from: 520, to: 784, dur: 0.13, gain: 0.04 }); },
    thrown: function () { this.tone({ from: 300, to: 720, dur: 0.16, type: 'triangle', gain: 0.045 }); },
    absorb: function () { this.tone({ from: 880, to: 170, dur: 0.24, gain: 0.05 }); },
    wobble: function () { this.tone({ from: 1400, dur: 0.05, type: 'square', gain: 0.022 }); },
    escaped: function () { this.tone({ from: 440, to: 180, dur: 0.3, gain: 0.055 }); },
    fled: function () { this.tone({ from: 300, to: 150, dur: 0.35, gain: 0.04 }); },

    caught: function () {
      var self = this;
      [[659, 0], [880, 0.09], [1319, 0.18]].forEach(function (note) {
        self.tone({ from: note[0], dur: 0.3, delay: note[1], type: 'triangle', gain: 0.055 });
      });
    },

    shiny: function () {
      var self = this;
      [[1047, 0], [1568, 0.08], [2093, 0.16], [2637, 0.24]].forEach(function (note) {
        self.tone({ from: note[0], dur: 0.45, delay: note[1], gain: 0.035 });
      });
    }
  };

  // ---------------------------------------------------------------
  // The run of an encounter is a chain of timers, and any of them can be
  // cut short by a reset. Keeping the handles means a half-finished throw
  // can never land on top of the encounter that replaced it.
  // ---------------------------------------------------------------
  var timers = [];

  function after(ms, fn) {
    timers.push(window.setTimeout(fn, ms));
  }

  function clearTimers() {
    timers.forEach(window.clearTimeout);
    timers = [];
  }

  // ---------------------------------------------------------------
  // The ring, driven frame by frame rather than by an animation, because
  // the throw is scored on where it is at the instant of the click and
  // that answer has to come from the same clock the eye is reading.
  // ---------------------------------------------------------------
  var ring = { running: false, scale: RING_FROM, start: 0, period: RING_PERIOD, frame: 0 };

  function ringStart(period) {
    ring.period = period;
    ring.start = performance.now();
    ring.running = true;
    el.ring.classList.remove('is-struck');
    el.ring.classList.add('is-live');
    el.ringTarget.classList.add('is-live');
    ring.frame = window.requestAnimationFrame(ringTick);
  }

  function ringTick(now) {
    if (!ring.running) return;
    var progress = ((now - ring.start) % ring.period) / ring.period;
    ring.scale = RING_FROM + (RING_TO - RING_FROM) * progress;
    // Fade in as it enters and out as it passes through, so the jump back to
    // the outside at the end of a pass is never seen.
    var fade = Math.min(1, progress / 0.09, (1 - progress) / 0.09);
    el.ring.style.transform = 'translate(-50%, -50%) scale(' + ring.scale.toFixed(4) + ')';
    el.ring.style.opacity = fade.toFixed(3);
    ring.frame = window.requestAnimationFrame(ringTick);
  }

  function ringStop() {
    ring.running = false;
    window.cancelAnimationFrame(ring.frame);
  }

  function ringHide() {
    ringStop();
    el.ring.classList.remove('is-live', 'is-struck');
    el.ringTarget.classList.remove('is-live', 'is-struck');
    el.ring.style.opacity = '0';
  }

  // Freeze where it was and let it bloom outwards, so the throw you made is
  // still on screen while you read the word for it.
  function ringStrike() {
    ringStop();
    el.ring.classList.add('is-struck');
    el.ring.style.transform = 'translate(-50%, -50%) scale(' + (ring.scale * 1.3).toFixed(4) + ')';
    el.ring.style.opacity = '0';
    el.ringTarget.classList.remove('is-struck');
    void el.ringTarget.offsetWidth;
    el.ringTarget.classList.add('is-struck');
  }

  function scoreThrow() {
    var distance = Math.abs(ring.scale - 1);
    for (var i = 0; i < BANDS.length; i++) {
      if (distance <= BANDS[i].within) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  // ---------------------------------------------------------------
  // The ball. Three nested elements, one motion each, all of them driven
  // by writing a transform and letting CSS carry it.
  // ---------------------------------------------------------------
  function placeBall(dx, dy, spin, instant) {
    var parts = [
      [el.ballX, 'translateX(' + dx + 'px)'],
      [el.ballY, 'translateY(' + dy + 'px)'],
      [el.ballSpin, 'rotate(' + spin + 'deg)']
    ];
    parts.forEach(function (part) {
      if (instant) part[0].style.transition = 'none';
      part[0].style.transform = part[1];
    });
    if (instant) {
      // Read something back to force the jump to happen under the suppressed
      // transition, before the transitions are handed back.
      void el.ballX.offsetWidth;
      parts.forEach(function (part) { part[0].style.transition = ''; });
    }
  }

  function resetBall() {
    el.ballX.classList.remove('is-caught', 'is-hidden');
    el.ballSpin.classList.remove('is-wobbling');
    placeBall(0, 0, 0, true);
  }

  // Where the ball has to get to, taken from the stage rather than from the
  // artwork: the target is the point the ring closes on, and that point is
  // fixed by the stylesheet whatever shape the Pokémon happens to be.
  function throwVector() {
    var stageBox = el.stage.getBoundingClientRect();
    var ballBox = el.ballX.getBoundingClientRect();
    var from = {
      x: ballBox.left + ballBox.width / 2 - stageBox.left,
      y: ballBox.top + ballBox.height / 2 - stageBox.top
    };
    return {
      dx: stageBox.width * TARGET.x - from.x,
      dy: stageBox.height * TARGET.y - from.y,
      drop: stageBox.height * GROUND - from.y
    };
  }

  function bloom() {
    el.flash.classList.remove('is-firing');
    void el.flash.offsetWidth;
    el.flash.classList.add('is-firing');
  }

  function burst(atX, atY) {
    if (reducedMotion.matches) return;
    for (var i = 0; i < 6; i++) {
      var point = document.createElement('span');
      point.className = 'burst';
      point.style.left = atX + '%';
      point.style.top = atY + '%';
      point.style.setProperty('--angle', (i * 60 + 15) + 'deg');
      point.style.setProperty('--reach', (1.6 + Math.random() * 0.9).toFixed(2) + 'rem');
      point.style.animationDelay = (i * 18) + 'ms';
      el.bursts.appendChild(point);
    }
    after(900, function () { el.bursts.innerHTML = ''; });
  }

  function showVerdict(word) {
    el.verdict.textContent = word;
    el.verdict.classList.remove('is-showing');
    void el.verdict.offsetWidth;
    el.verdict.classList.add('is-showing');
  }

  // ---------------------------------------------------------------
  // Encounters
  // ---------------------------------------------------------------
  var current = null;
  var busy = true;
  var lastKey = null;

  // The page used to say how to play above the stage. It says it here now, on
  // the first encounter a visitor with nothing to their name sees, and then
  // never again: the rule has to be somewhere, but it stops being news the
  // moment you have caught something.
  var taught = store.total > 0;

  function isNight() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function available() {
    var night = isNight();
    return ROSTER.filter(function (s) {
      if (!s.only) return true;
      return s.only === (night ? 'night' : 'day');
    });
  }

  function pick() {
    var pool = available();
    // Two of the same in a row is the one pattern a weighted draw produces
    // that reads as a bug rather than as luck, so it only happens when
    // there is genuinely nothing else about.
    var without = pool.filter(function (s) { return s.key !== lastKey; });
    if (without.length) pool = without;

    var total = pool.reduce(function (sum, s) { return sum + s.weight; }, 0);
    var roll = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function encounter() {
    clearTimers();
    var species = pick();
    lastKey = species.key;
    current = {
      species: species,
      shiny: Math.random() < SHINY_ODDS,
      balls: BALLS_PER_ENCOUNTER
    };

    var seen = entryFor(species.key);
    seen.seen += 1;
    save();

    el.creatureArt.src = species.art;
    el.creature.style.setProperty('--tint', current.shiny ? species.tint : 'none');
    el.creature.classList.toggle('is-shiny', current.shiny);
    el.creature.classList.remove('is-captured', 'is-fleeing', 'is-arriving');
    void el.creature.offsetWidth;
    el.creature.classList.add('is-in', 'is-arriving');

    resetBall();
    renderBalls();
    ringHide();
    el.verdict.classList.remove('is-showing');

    var hint = taught ? '' : ' Throw when the ring meets the circle.';
    taught = true;

    if (current.shiny) {
      say('A <span class="said">shiny ' + species.name +
        '</span> appeared. Those do not come along often.' + hint);
      Sound.shiny();
    } else {
      say('A wild <span class="said">' + species.name + '</span> appeared.' + hint);
      Sound.appear();
    }

    after(beat(480), function () {
      ringStart(ringPeriodFor(species));
      arm();
    });
  }

  function arm() {
    busy = false;
    el.stage.setAttribute('aria-disabled', 'false');
  }

  function hold() {
    busy = true;
    el.stage.setAttribute('aria-disabled', 'true');
  }

  function attemptThrow() {
    if (busy || !current) return;
    hold();

    var band = scoreThrow();
    ringStrike();
    showVerdict(band.word);
    Sound.thrown();

    var chance = Math.min(0.97, Math.max(0.04, current.species.rate * band.multiplier));
    var caught = Math.random() < chance;
    var vector = throwVector();

    placeBall(vector.dx, vector.dy, 720, false);

    after(beat(420), function () {
      bloom();
      Sound.absorb();
      el.creature.classList.remove('is-arriving');
      el.creature.classList.add('is-captured');

      after(beat(240), function () {
        // The throw arcs, the fall does not: gravity gets its own curve for
        // the drop to the ground, and hands the arc back afterwards.
        el.ballY.style.transitionTimingFunction = 'cubic-bezier(0.5, 0, 0.7, 1)';
        el.ballY.style.transitionDuration = beat(300) + 'ms';
        placeBall(vector.dx, vector.drop, 720, false);

        after(beat(320), function () {
          el.ballY.style.transitionTimingFunction = '';
          el.ballY.style.transitionDuration = '';
          runWobbles(caught, chance);
        });
      });
    });
  }

  // Three turns of the ball and then the click if it holds; a run cut short
  // if it does not. How far a losing throw gets is read off the odds, so a
  // near miss looks like one.
  function runWobbles(caught, chance) {
    var turns = caught ? 3 : Math.min(2, Math.floor(chance * 3.4 + Math.random() * 0.8));
    var step = beat(720) + beat(160);
    var i = 0;

    function turn() {
      if (i >= turns) {
        if (caught) settleCaught();
        else settleEscaped();
        return;
      }
      i += 1;
      el.ballSpin.classList.remove('is-wobbling');
      void el.ballSpin.offsetWidth;
      el.ballSpin.classList.add('is-wobbling');
      Sound.wobble();
      after(step, turn);
    }

    after(beat(200), turn);
  }

  function settleCaught() {
    var species = current.species;
    var entry = entryFor(species.key);
    var isNew = entry.caught === 0;

    entry.caught += 1;
    if (current.shiny) entry.shiny += 1;
    if (!entry.first) entry.first = Date.now();
    store.total += 1;
    store.streak += 1;
    if (store.streak > store.best) store.best = store.streak;
    save();

    el.ballX.classList.add('is-caught');
    burst(TARGET.x * 100, GROUND * 100);
    Sound.caught();
    if (current.shiny) after(beat(220), function () { Sound.shiny(); });

    var line = 'Gotcha. <span class="said">' + (current.shiny ? 'Shiny ' : '') + species.name +
      '</span> was caught.';
    if (isNew) line += ' A new entry.';
    else if (store.streak >= 3) line += ' That is ' + store.streak + ' in a row.';
    say(line);

    renderDex(isNew ? species.key : null);
    renderStats();

    after(beat(700), function () {
      el.ballX.classList.add('is-hidden');
      ringHide();
      after(READ_RESULT, encounter);
    });
  }

  function settleEscaped() {
    current.balls -= 1;
    bloom();
    el.ballX.classList.add('is-hidden');
    el.creature.classList.remove('is-captured');
    el.creature.classList.add('is-arriving');

    if (current.balls <= 0) {
      Sound.fled();
      store.streak = 0;
      save();
      say('<span class="said">' + current.species.name + '</span> broke free and got away.');
      renderStats();
      after(beat(420), function () {
        el.creature.classList.remove('is-in', 'is-arriving');
        el.creature.classList.add('is-fleeing');
        ringHide();
        renderBalls();
        after(READ_RESULT, encounter);
      });
      return;
    }

    Sound.escaped();
    say('<span class="said">' + current.species.name + '</span> broke free. ' +
      current.balls + (current.balls === 1 ? ' ball left.' : ' balls left.'));
    renderBalls();

    after(Math.max(beat(520), 700), function () {
      resetBall();
      ringStart(ringPeriodFor(current.species));
      arm();
    });
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function say(html) {
    el.gameStatus.innerHTML = html;
  }

  function renderBalls() {
    var left = current ? current.balls : BALLS_PER_ENCOUNTER;
    el.ballCount.innerHTML = '';
    for (var i = 0; i < BALLS_PER_ENCOUNTER; i++) {
      var pip = document.createElement('span');
      pip.className = 'pip' + (i < left ? '' : ' is-spent');
      el.ballCount.appendChild(pip);
    }
  }

  var selected = null;

  function buildDex() {
    ROSTER.forEach(function (species) {
      var slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'dex-slot';
      slot.dataset.key = species.key;
      slot.setAttribute('aria-pressed', 'false');

      var art = document.createElement('img');
      art.src = species.art;
      art.alt = '';
      slot.appendChild(art);

      var tally = document.createElement('span');
      tally.className = 'dex-count';
      slot.appendChild(tally);

      slot.addEventListener('click', function () {
        selected = selected === species.key ? null : species.key;
        renderDex();
      });
      slot.addEventListener('mouseenter', function () { describe(species.key); });
      slot.addEventListener('focus', function () { describe(species.key); });
      slot.addEventListener('mouseleave', function () { describe(selected); });
      slot.addEventListener('blur', function () { describe(selected); });

      el.dexRow.appendChild(slot);
    });
  }

  function renderDex(newKey) {
    ROSTER.forEach(function (species) {
      var entry = entryFor(species.key);
      var slot = el.dexRow.querySelector('[data-key="' + species.key + '"]');
      var caught = entry.caught > 0;

      slot.classList.toggle('is-locked', !caught);
      slot.classList.toggle('has-shiny', entry.shiny > 0);
      slot.setAttribute('aria-pressed', selected === species.key ? 'true' : 'false');
      slot.querySelector('.dex-count').textContent = caught ? String(entry.caught) : '';
      // Shown as a silhouette until it is caught, so the label has to carry
      // what the picture is withholding.
      slot.setAttribute('aria-label', caught
        ? species.name + ', caught ' + entry.caught + (entry.caught === 1 ? ' time' : ' times') +
          (entry.shiny > 0 ? ', including a shiny' : '')
        : 'Entry ' + (ROSTER.indexOf(species) + 1) + ', not yet caught');
      if (newKey === species.key) {
        slot.classList.remove('is-new');
        void slot.offsetWidth;
        slot.classList.add('is-new');
      }
    });
    describe(selected);
  }

  function describe(key) {
    if (!key) {
      el.dexCaption.innerHTML = summary();
      return;
    }
    var species = ROSTER.filter(function (s) { return s.key === key; })[0];
    var entry = entryFor(key);

    if (entry.caught > 0) {
      // The date is why the first catch is worth keeping a timestamp for: it
      // is what turns a tally into somebody's own record of an afternoon.
      var day = entry.first ? onDay(entry.first) : '';
      var line = '<span class="dex-name">' + species.name + '</span>. Found on ' +
        '<span class="dex-where">' + species.where + '</span>. ' + species.note +
        ' Caught ' + entry.caught + (entry.caught === 1 ? ' time' : ' times') +
        (day ? ', first on ' + day : '') + '.';
      if (entry.shiny > 0) {
        line += ' ' + (entry.shiny === 1 ? 'One of them was shiny.' : entry.shiny + ' of them were shiny.');
      }
      el.dexCaption.innerHTML = line;
      return;
    }

    if (entry.seen > 0) {
      el.dexCaption.innerHTML = '<span class="dex-name">' + species.name + '</span>. Seen ' +
        entry.seen + (entry.seen === 1 ? ' time' : ' times') + ', caught none. Still out there.';
      return;
    }

    el.dexCaption.innerHTML = 'Not yet identified. Nothing has come out of this one while you have been watching.';
  }

  // The site writes dates as 16 June 2019 everywhere else, so the Pokédex
  // does too rather than taking whatever the browser's locale would hand it.
  function onDay(stamp) {
    try {
      return new Date(stamp).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function summary() {
    var done = speciesCaught();
    if (done === 0) return 'Seven places, all of them empty. Hover an entry to read it.';
    if (done < ROSTER.length) {
      return done + ' of ' + ROSTER.length + ' species. ' +
        (ROSTER.length - done) + ' still out there.';
    }
    var shinies = ROSTER.filter(function (s) { return entryFor(s.key).shiny > 0; }).length;
    if (shinies === ROSTER.length) return 'All seven, and every one of them shiny. There is nothing left to find.';
    return 'All seven. That is everybody who lives here.';
  }

  function renderStats() {
    var done = speciesCaught();
    el.statCaught.textContent = String(store.total);
    el.statSpecies.textContent = done + '/' + ROSTER.length;
    el.statStreak.textContent = String(store.streak);
    el.statBest.textContent = String(store.best);
    el.stats.classList.toggle('is-complete', done === ROSTER.length);
  }

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------

  // Pointer rather than click, because a timing game is judged on when the
  // finger went down and click waits for it to come back up. A click with no
  // pointer behind it (detail 0) is the keyboard, which still needs serving.
  el.stage.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    attemptThrow();
  });

  el.stage.addEventListener('click', function (e) {
    if (e.detail === 0) attemptThrow();
  });

  el.stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Space anywhere on the page throws, as long as the key is not already
  // spoken for by whatever has focus.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    if (document.activeElement && document.activeElement !== document.body) return;
    e.preventDefault();
    attemptThrow();
  });

  el.soundToggle.addEventListener('click', function () {
    Sound.on = !Sound.on;
    store.sound = Sound.on;
    save();
    el.soundToggle.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
    el.soundToggle.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off');
    if (Sound.on) Sound.appear();
  });

  // Two presses, in the button itself, and it forgets the question if you
  // walk away from it.
  var confirming = 0;

  el.resetBtn.addEventListener('click', function () {
    if (!confirming) {
      confirming = window.setTimeout(function () {
        confirming = 0;
        el.resetBtn.classList.remove('is-confirming');
        el.resetBtn.textContent = 'Release them all';
      }, 4000);
      el.resetBtn.classList.add('is-confirming');
      el.resetBtn.textContent = 'Release them, really?';
      return;
    }

    window.clearTimeout(confirming);
    confirming = 0;
    el.resetBtn.classList.remove('is-confirming');
    el.resetBtn.textContent = 'Release them all';

    var keepSound = store.sound;
    store = blank();
    store.sound = keepSound;
    save();
    selected = null;
    lastKey = null;

    clearTimers();
    ringHide();
    hold();
    renderDex();
    renderStats();
    el.creature.classList.remove('is-in', 'is-arriving', 'is-captured');
    el.creature.classList.add('is-fleeing');
    say('Released. Every one of them is back where it came from.');
    after(beat(1200), encounter);
  });

  // ---------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------

  // The artwork is swapped in the same frame a Pokémon arrives, so all seven
  // are fetched up front rather than showing a gap the first time each turns
  // up. A failure here is not worth reporting: the browser will simply fetch
  // it again when it is needed.
  ROSTER.forEach(function (species) {
    var pre = new Image();
    pre.src = species.art;
  });

  el.stageWrap.hidden = false;
  el.ballCount.hidden = false;
  el.dex.hidden = false;
  el.stats.hidden = false;
  el.resetWrap.hidden = false;

  el.soundToggle.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
  el.soundToggle.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off');

  buildDex();
  renderDex();
  renderStats();
  renderBalls();
  hold();
  encounter();
})();
