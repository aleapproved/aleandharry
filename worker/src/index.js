const ALLOWED_ORIGIN = "https://aleandharry.com";
const AIRTABLE_BASE_ID = "appzg1GJnurC95pqv";
const AIRTABLE_TABLE_ID = "tblN2FjbFfsoTGJkH";
const MAX_PARTY_SIZE = 20;

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

function validate(payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const attending = payload.attending;
  const partySize = Number(payload.partySize);

  if (!name || name.length > 200) {
    return { error: "Please enter a name." };
  }
  if (attending !== "Yes" && attending !== "No") {
    return { error: "Please specify whether you're attending." };
  }
  if (attending === "No") {
    return { name, attending, partySize: 0 };
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
    return { error: "Party size must be a whole number between 1 and " + MAX_PARTY_SIZE + "." };
  }
  return { name, attending, partySize };
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
                Attending: result.attending,
                "Party Size": result.partySize,
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
