document.addEventListener('DOMContentLoaded', function () {
  var el = document.getElementById('countdown');
  if (!el) return;

  // The target carries its own offset, so everyone counts down to the same
  // instant rather than to their own local midnight. June is BST, so +01:00.
  // Change this one string when there's a real start time.
  var target = new Date(el.dataset.target);
  if (isNaN(target)) return;

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  var timer = null;

  function render() {
    var ms = target - new Date();

    if (ms <= 0) {
      el.textContent = 'Today';
      if (timer) clearInterval(timer);
      return;
    }

    var seconds = Math.floor(ms / 1000);
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var clock = pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds % 60) + 's';

    el.textContent = days > 0
      ? days.toLocaleString() + (days === 1 ? ' day, ' : ' days, ') + clock
      : clock;
  }

  render();

  // A number changing every second is exactly the kind of restless detail
  // reduced-motion asks us to stop, so those visitors get the days only.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timer = setInterval(render, 1000);
  } else {
    var days = Math.max(0, Math.ceil((target - new Date()) / 86400000));
    el.textContent = days.toLocaleString() + (days === 1 ? ' day to go' : ' days to go');
  }
});
