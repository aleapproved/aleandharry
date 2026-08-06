/* Every photo on Hale opens full size in a modal dialog, on a click or a tap.
   The markup stays a plain <figure><img>, so a visitor without JavaScript
   still sees all of them at page size; this only adds the way in. */
(function () {
  var photos = document.querySelectorAll('.moment img');
  if (!photos.length || !window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) return;

  var dialog = document.createElement('dialog');
  dialog.className = 'lightbox';

  // The stage is what scrolls once a photo is zoomed past the screen, and it
  // is also the whole of the surface around the photo, which closes.
  var stage = document.createElement('div');
  stage.className = 'lightbox-stage';

  var full = document.createElement('img');
  full.className = 'lightbox-image';
  full.alt = '';

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';

  stage.append(full);
  dialog.append(stage, close);
  document.body.append(dialog);

  /* A real button around each photo rather than a click handler on the image:
     the keyboard reaches it, it takes focus, and a screen reader announces
     that the photo does something. The button itself has no appearance. */
  photos.forEach(function (photo) {
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'zoom';
    // Names the button, which suppresses the image's own alt inside it, so
    // the description is said once rather than twice.
    trigger.setAttribute('aria-label', 'Enlarge: ' + photo.alt);

    photo.replaceWith(trigger);
    trigger.append(photo);

    trigger.addEventListener('click', function () {
      // src, not currentSrc: srcset serves the page whatever fits the column,
      // and enlarging is the one moment the full-size file is worth fetching.
      full.src = photo.src;
      full.alt = photo.alt;
      dialog.showModal();
      // A modal dialog does not stop the page behind it scrolling, so a wheel
      // or a swipe over the overlay carries the page off to somewhere else
      // while the photo sits still. The reserved gutter means holding the
      // scrollbar back costs no width.
      document.documentElement.classList.add('is-locked');
      setCursor();
      if (full.complete) return;
      full.addEventListener('load', setCursor, { once: true });
    });
  });

  /* Fitted to the screen, a wide photo on a phone is barely larger than it was
     in the column, so a click on the photo itself goes to its full pixel size
     and the stage pans. Anywhere else on the overlay closes. */
  function zoomable() {
    return full.naturalWidth > full.clientWidth + 1;
  }

  function setCursor() {
    full.style.cursor = dialog.classList.contains('is-zoomed') ? 'zoom-out'
      : zoomable() ? 'zoom-in' : 'zoom-out';
  }

  stage.addEventListener('click', function (event) {
    if (event.target !== full) {
      dialog.close();
      return;
    }
    if (!dialog.classList.contains('is-zoomed') && !zoomable()) {
      dialog.close();
      return;
    }

    // Keep whatever was clicked under the pointer rather than jumping to the
    // middle of a photo that is now several screens wide.
    var rect = full.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width;
    var y = (event.clientY - rect.top) / rect.height;
    dialog.classList.toggle('is-zoomed');
    stage.scrollLeft = x * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = y * stage.scrollHeight - stage.clientHeight / 2;
    setCursor();
  });

  close.addEventListener('click', function () {
    dialog.close();
  });

  // close, not the click handlers: escape lands here too.
  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('is-locked');
    dialog.classList.remove('is-zoomed');
  });
})();
