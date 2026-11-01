// Admin login, using Supabase's built in email and password auth through plain fetch.
// Only index.html loads this file. The participant page never needs a login.
//
// How it works in one paragraph: signing in returns an access token (valid about an hour)
// and a refresh token. Both are kept in this browser's localStorage. db.js asks auth.token()
// before every request; if the access token is about to expire, auth.token() quietly swaps
// the refresh token for a new pair. Signing out clears both and tells Supabase to forget them.

const auth = {
  storageKey: "pt-session",
  session: null,   // { access_token, refresh_token, expires_at (unix seconds), user: { email } }

  load() {
    try { this.session = JSON.parse(localStorage.getItem(this.storageKey)); } catch (e) { this.session = null; }
    return this.session;
  },
  save(s) {
    this.session = s;
    try { s ? localStorage.setItem(this.storageKey, JSON.stringify(s)) : localStorage.removeItem(this.storageKey); } catch (e) {}
  },
  signedIn() { return !!(this.session && this.session.refresh_token); },
  email() { return this.session && this.session.user ? this.session.user.email : ""; },

  async call(path, body, token) {
    const res = await fetch(CONFIG.SUPABASE_URL + "/auth/v1/" + path, {
      method: "POST",
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json", Authorization: "Bearer " + (token || CONFIG.SUPABASE_ANON_KEY) },
      body: JSON.stringify(body || {})
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.error_description || data.msg || data.message || data.error)) || "Sign in failed (" + res.status + ").");
    return data;
  },

  async signIn(email, password) {
    const s = await this.call("token?grant_type=password", { email, password });
    this.save(s);
  },

  async signOut() {
    const s = this.session; this.save(null);
    if (s && s.access_token) { try { await this.call("logout", {}, s.access_token); } catch (e) {} }
  },

  // The access token to use right now, refreshing first if it expires within a minute.
  // Returns null when nobody is signed in. Several requests made at the same time share
  // one refresh, because a refresh token can only be used once.
  refreshing: null,
  async token() {
    const s = this.session; if (!s) return null;
    const now = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - now > 60) return s.access_token;
    if (!this.refreshing) {
      this.refreshing = this.call("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
        .then(fresh => { this.save(fresh); return fresh.access_token; })
        .catch(() => { this.save(null); return null; })   // refresh token rejected: treat as signed out
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
};
