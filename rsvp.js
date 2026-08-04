var RSVP_ENDPOINT = 'https://aleandharry-rsvp.alessandrogillies.workers.dev';

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('rsvpForm');
  if (!form) return;

  var partyField = form.querySelector('.field-party');
  var partyInput = document.getElementById('partySize');
  var status = document.getElementById('rsvpStatus');
  var submitButton = form.querySelector('.rsvp-submit');

  form.querySelectorAll('input[name="attending"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var attendingYes = form.querySelector('input[name="attending"]:checked').value === 'Yes';
      partyField.classList.toggle('is-hidden', !attendingYes);
      partyInput.required = attendingYes;
    });
  });

  function showStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
    status.classList.remove('is-hidden');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var attendingInput = form.querySelector('input[name="attending"]:checked');
    if (!attendingInput) {
      showStatus("Please let us know if you're attending.", 'error');
      return;
    }

    var payload = {
      name: document.getElementById('name').value.trim(),
      attending: attendingInput.value,
      partySize: attendingInput.value === 'Yes' ? Number(partyInput.value) : 0,
      company: document.getElementById('company').value,
    };

    submitButton.disabled = true;
    showStatus('Sending…', 'pending');

    fetch(RSVP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.data && result.data.error ? result.data.error : 'Something went wrong.');
        }
        form.reset();
        partyField.classList.add('is-hidden');
        form.classList.add('is-hidden');
        showStatus("Thank you — we've got your RSVP.", 'success');
      })
      .catch(function (err) {
        showStatus(err.message || 'Something went wrong. Please try again.', 'error');
      })
      .finally(function () {
        submitButton.disabled = false;
      });
  });
});
