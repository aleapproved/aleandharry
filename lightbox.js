/* Every photo on Hale opens as large as the screen will take it, on a click or
   a tap. The markup stays a plain <figure><img>, so a visitor without
   JavaScript still sees all of them at page size; this only adds the way in.

   The photo is always fitted whole to the screen. An earlier version let a
   second click go to the file's own pixels and pan, which put scrollbars
   around a cropped photo, and that is not what enlarging a photo means. */
(function () {
  var photos = document.querySelectorAll('.moment img');
  if (!photos.length || !window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) return;

  var dialog = document.createElement('dialog');
  dialog.className = 'lightbox';

  var full = document.createElement('img');
  full.className = 'lightbox-image';
  full.alt = '';

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';

  dialog.append(full, close);
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
    });
  });

  // Anywhere on the overlay closes, the photo and the close button included.
  // Escape is native.
  dialog.addEventListener('click', function () {
    dialog.close();
  });

  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('is-locked');
  });
})();
