// Each page is a different colour, so the browser chrome cannot be hardcoded
// here: the two papers come off <html>, alongside the pre-paint script's.
function syncThemeColorMeta(theme) {
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? root.dataset.paperDark : root.dataset.paper);
}

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    syncThemeColorMeta(next);
  });
});
