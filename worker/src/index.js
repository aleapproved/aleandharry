const ALLOWED_ORIGIN = "https://aleandharry.com";
const AIRTABLE_BASE_ID = "appzg1GJnurC95pqv";
const AIRTABLE_TABLE_ID = "tblN2FjbFfsoTGJkH";
const MAX_PARTY_SIZE = 20;
const MAX_LENGTHS = { name: 200, email: 200, guestNames: 2000, dietary: 1000, message: 2000 };

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function text(value, field) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.slice(0, MAX_LENGTHS[field]);
}

function validate(payload) {
  const name = text(payload.name, "name");
  const email = text(payload.email, "email");
  const attending = payload.attending;
  const partySize = Number(payload.partySize);
  const message = text(payload.message, "message");

  if (!name) {
    return { error: "Please enter a name." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter an email address we can reach you on." };
  }
  if (attending !== "Yes" && attending !== "No") {
    return { error: "Please specify whether you're attending." };
  }
  // Someone who isn't coming has no party, no seats and no dietary needs, so
  // those fields are dropped rather than stored as stale text.
  if (attending === "No") {
    return { name, email, attending, partySize: 0, guestNames: "", dietary: "", message };
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
    return { error: "Party size must be a whole number between 1 and " + MAX_PARTY_SIZE + "." };
  }
  return {
    name,
    email,
    attending,
    partySize,
    guestNames: text(payload.guestNames, "guestNames"),
    dietary: text(payload.dietary, "dietary"),
    message,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return jsonResponse(400, { error: "Invalid request body." });
    }

    // Honeypot: a hidden field real guests never fill in, bots often do.
    if (payload.company) {
      return jsonResponse(200, { ok: true });
    }

    const result = validate(payload);
    if (result.error) {
      return jsonResponse(400, { error: result.error });
    }

    const airtableResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_RUNTIME_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                Name: result.name,
                Email: result.email,
                Attending: result.attending,
                "Party Size": result.partySize,
                "Guest Names": result.guestNames,
                "Dietary Requirements": result.dietary,
                Message: result.message,
              },
            },
          ],
        }),
      }
    );

    if (!airtableResponse.ok) {
      return jsonResponse(502, { error: "Something went wrong saving your RSVP. Please try again." });
    }

    return jsonResponse(200, { ok: true });
  },
};
