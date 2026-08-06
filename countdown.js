document.addEventListener('DOMContentLoaded', function () {
  var el = document.getElementById('countdown');
  if (!el) return;

  var target = new Date(el.dataset.target + 'T00:00:00');

  function render() {
    // Count whole days from today's midnight, so the number matches what a
    // calendar would say rather than shifting with the time of day.
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.round((target - today) / 86400000);

    if (days > 1) {
      el.textContent = days.toLocaleString() + ' days to go';
    } else if (days === 1) {
      el.textContent = 'Tomorrow';
    } else if (days === 0) {
      el.textContent = 'Today';
    } else {
      el.textContent = '';
    }
  }

  render();
  // A tab left open overnight should not keep yesterday's number.
  setInterval(render, 60000);
});
