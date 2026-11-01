// All reading and writing to the database goes through this file.
// It talks to Supabase's built in REST API with plain fetch calls, so there is
// nothing to install. To swap the backend later, only this file needs to change.
//
// Tables (see supabase/schema.sql):
//   tests      { id, name, messages: [string], closed, created_at }
//   responses  { id, test_id, choices: { "i-j": winnerIndex | null }, simulated, created_at }
//
// Permissions are enforced by the database, not here. Without a login (the participant page)
// you can read tests and add responses. With a login (the admin page, see auth.js) you can do
// everything. The admin page's token is sent automatically when auth.js is loaded and signed in.

const db = {
  configured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CONFIG.SUPABASE_URL) && !/YOUR/.test(CONFIG.SUPABASE_ANON_KEY);
  },

  // returnRows: whether to ask Supabase for the affected rows back. Reading rows back needs read
  // permission, which participants do not have on responses, so inserts there pass false.
  async request(method, path, body, returnRows = true) {
    const userToken = typeof auth !== "undefined" ? await auth.token() : null;
    const res = await fetch(CONFIG.SUPABASE_URL + "/rest/v1/" + path, {
      method,
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + (userToken || CONFIG.SUPABASE_ANON_KEY),
        "Content-Type": "application/json",
        Prefer: returnRows ? "return=representation" : "return=minimal"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      if (res.status === 401 && userToken) { auth.save(null); location.reload(); }   // session no longer valid: back to sign in
      if (res.status === 401 || res.status === 403 || /row-level security/.test(detail)) detail = "You do not have permission to do that. " + detail;
      throw new Error("Database request failed (" + res.status + "). " + detail);
    }
    return res.status === 204 || res.status === 201 && !returnRows ? null : res.json();
  },

  /* tests */
  listTests() { return this.request("GET", "tests?select=*&order=created_at.desc"); },
  async getTest(id) { const rows = await this.request("GET", "tests?select=*&id=eq." + encodeURIComponent(id)); return rows[0] || null; },
  async createTest(name, messages) { const rows = await this.request("POST", "tests", { name, messages }); return rows[0]; },
  updateTest(id, fields) { return this.request("PATCH", "tests?id=eq." + encodeURIComponent(id), fields); },
  deleteTest(id) { return this.request("DELETE", "tests?id=eq." + encodeURIComponent(id)); },

  /* responses */
  listResponses(testId) { return this.request("GET", "responses?select=*&order=created_at.asc&test_id=eq." + encodeURIComponent(testId)); },
  countResponses() { return this.request("GET", "responses?select=test_id"); },   // one tiny row per response, tallied by the caller
  addResponses(rows) { return this.request("POST", "responses", rows, false); },  // rows: [{ test_id, choices, simulated }]
  deleteSimulated(testId) { return this.request("DELETE", "responses?simulated=eq.true&test_id=eq." + encodeURIComponent(testId)); }
};
