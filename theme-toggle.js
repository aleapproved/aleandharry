function syncThemeColorMeta(theme) {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1b1830' : '#f7ecdd');
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
