// Pure math for the preference test. No DOM, no network. Every function takes
// what it needs as arguments so it can be used by both pages and tested on its own.
//
// Vocabulary:
//   n         number of messages in the test (messages are referred to by index 0..n-1)
//   choices   one participant's answers: { "i-j": winnerIndex | null }, with i < j in the key
//   parts     array of participants, each { choices }

const analysis = {
  key(i, j) { return i < j ? i + "-" + j : j + "-" + i; },

  allPairs(n) { const p = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) p.push([i, j]); return p; },

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },

  // Random pair order, and a random left/right side for each pair.
  randomPairOrder(n) { return this.shuffle(this.allPairs(n).map(([i, j]) => Math.random() < 0.5 ? [i, j] : [j, i])); },

  /* ---------- per participant ---------- */

  // Wins (w) and pairs rated (p) per message.
  winsOf(n, choices) {
    const w = Array(n).fill(0), p = Array(n).fill(0);
    this.allPairs(n).forEach(([i, j]) => { const k = choices[this.key(i, j)]; if (k === null || k === undefined) return; w[k]++; p[i]++; p[j]++; });
    return { w, p };
  },

  // Rank per message, 1 = best. Ties share the average of the positions they cover.
  ranksOf(n, choices) {
    const { w } = this.winsOf(n, choices);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => w[b] - w[a]);
    const r = [];
    let pos = 0;
    while (pos < order.length) {
      let end = pos; while (end + 1 < order.length && w[order[end + 1]] === w[order[pos]]) end++;
      const avg = (pos + end) / 2 + 1;
      for (let q = pos; q <= end; q++) r[order[q]] = avg;
      pos = end + 1;
    }
    return r;
  },

  // Intransitive triples (A>B, B>C, C>A). Lots of them means random clicking.
  cyclesOf(n, choices) {
    let cycles = 0, triples = 0;
    const beats = (x, y) => choices[this.key(x, y)] === x;
    const decided = (x, y) => choices[this.key(x, y)] !== null && choices[this.key(x, y)] !== undefined;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
      if (!(decided(a, b) && decided(b, c) && decided(a, c))) continue;
      triples++;
      if ((beats(a, b) && beats(b, c) && beats(c, a)) || (beats(b, a) && beats(c, b) && beats(a, c))) cycles++;
    }
    return { cycles, triples };
  },

  cycleRate(n, choices) { const { cycles, triples } = this.cyclesOf(n, choices); return triples ? cycles / triples : 0; },

  // Median seconds per pair from a response's times object ({ "i-j": milliseconds }). null when not recorded.
  medianSeconds(times) {
    const v = Object.values(times || {}).filter(x => typeof x === "number" && x > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return (v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2) / 1000;
  },

  // Junk signals for one participant. Flagged when more than 15% of triples are cycles or the
  // median time per pair is under 1.5 seconds (too fast to have read two messages).
  RUSHED_SECONDS: 1.5,
  junk(n, pt) {
    const rate = this.cycleRate(n, pt.choices), median = this.medianSeconds(pt.times);
    const rushed = median !== null && median < this.RUSHED_SECONDS;
    return { rate, median, rushed, flagged: rate > 0.15 || rushed };
  },

  /* ---------- group ---------- */

  // M[i][j] = times i beat j. N[i][j] = times i and j were compared (skips excluded).
  h2hMatrix(n, parts) {
    const M = Array.from({ length: n }, () => Array(n).fill(0)), N = Array.from({ length: n }, () => Array(n).fill(0));
    parts.forEach(pt => this.allPairs(n).forEach(([i, j]) => {
      const k = pt.choices[this.key(i, j)]; if (k === null || k === undefined) return;
      N[i][j]++; N[j][i]++; if (k === i) M[i][j]++; else M[j][i]++;
    }));
    return { M, N };
  },

  // Bradley-Terry strengths, iterative MM fit, normalized to geometric mean 1.
  // p_i / (p_i + 1) is then the chance of beating an average message.
  bradleyTerry(M, N) {
    const n = M.length; let p = Array(n).fill(1);
    const W = M.map(r => r.reduce((a, b) => a + b, 0));
    for (let it = 0; it < 200; it++) {
      const np = p.map((_, i) => {
        let d = 0; for (let j = 0; j < n; j++) if (j !== i) d += N[i][j] / (p[i] + p[j]);
        return d ? Math.max(W[i], 0.25) / d : p[i];
      });
      const gm = Math.exp(np.reduce((a, b) => a + Math.log(b), 0) / n);
      p = np.map(x => x / gm);
    }
    return p;
  },

  // Two sided exact binomial test: chance of a split at least this lopsided if the true rate were 50%.
  binomTwoSided(k, n) {
    const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
    const pm = x => C(n, x) * Math.pow(0.5, n);
    const pk = pm(k); let s = 0;
    for (let x = 0; x <= n; x++) if (pm(x) <= pk + 1e-12) s += pm(x);
    return Math.min(1, s);
  },

  // Everything the group views and the client summary need, computed once from the included
  // participants. Bootstrap bands are only computed with 5 or more participants.
  groupStats(n, parts) {
    const P = parts.length;
    const { M, N } = this.h2hMatrix(n, parts);
    const W = M.map(r => r.reduce((a, b) => a + b, 0)), Tot = N.map(r => r.reduce((a, b) => a + b, 0));
    const rate = i => Tot[i] ? W[i] / Tot[i] : 0;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rate(b) - rate(a));

    // Bradley-Terry strength, as chance of beating an average message, with a 90% band
    const p = this.bradleyTerry(M, N);
    const boots = Array.from({ length: n }, () => []);
    if (P >= 5) for (let b = 0; b < 150; b++) {
      const resample = Array.from({ length: P }, () => parts[Math.floor(Math.random() * P)]);
      const { M: m2, N: n2 } = this.h2hMatrix(n, resample);
      this.bradleyTerry(m2, n2).forEach((v, i) => boots[i].push(v / (v + 1)));
    }
    const strength = p.map((v, i) => {
      const val = v / (v + 1); let lo = val, hi = val;
      if (boots[i].length) { const s = boots[i].slice().sort((a, b) => a - b); lo = s[Math.floor(s.length * 0.05)]; hi = s[Math.floor(s.length * 0.95)]; }
      return { value: val, lo, hi, banded: boots[i].length > 0 };
    });

    // winner checks
    const top = order[0], second = order[1];
    const losses = order.slice(1).filter(j => N[top][j] && M[top][j] / N[top][j] <= 0.5);
    const k = second === undefined ? 0 : M[top][second], m = second === undefined ? 0 : N[top][second];
    const pv = m ? this.binomTwoSided(k, m) : 1;
    const topTwo = { k, m, p: pv, verdict: pv < 0.05 && k > m - k ? "clear" : pv < 0.1 && k > m - k ? "likely" : "tie" };

    // polarization: where each message landed in every personal ranking
    const allRanks = parts.map(pt => this.ranksOf(n, pt.choices));
    const spread = Array.from({ length: n }, (_, i) => {
      const rs = allRanks.map(r => r[i]);
      const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
      const sd = rs.length ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length) : 0;
      const counts = Array(n).fill(0); rs.forEach(r => counts[Math.min(n - 1, Math.round(r) - 1)]++);
      const topShare = rs.length ? rs.filter(r => r <= 2).length / rs.length : 0, botShare = rs.length ? rs.filter(r => r >= n - 1).length / rs.length : 0;
      return { mean, sd, counts, split: n >= 4 && topShare >= 0.3 && botShare >= 0.3 };
    });

    const skipped = parts.reduce((s, pt) => s + Object.values(pt.choices).filter(v => v === null).length, 0);
    return { P, M, N, W, Tot, rate, order, strength, top, second, losses, topTwo, spread, skipped };
  },

  /* ---------- simulation ---------- */

  gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },

  // Fake participants for exercising the group views. Message index 1 is made
  // polarizing, about 1 in 12 participants click at random (and fast), and 2% of pairs are skipped.
  // Returns { choices: [{ choices, times }], latent }.
  // Pass the same `latent` object back in to keep the hidden "true" strengths stable across calls.
  simulate(n, count, latent) {
    if (!latent || latent.length !== n) {
      latent = Array.from({ length: n }, () => this.gauss() * 1.1);
      latent.split = n >= 4 ? 1 : -1;
    }
    const out = [];
    for (let p = 0; p < count; p++) {
      const random = Math.random() < 0.08;
      const side = Math.random() < 0.5 ? 1 : -1;
      const s = latent.map((v, i) => v + this.gauss() * 0.5 + (i === latent.split ? side * 1.8 : 0));
      const choices = {}, times = {};
      this.allPairs(n).forEach(([i, j]) => {
        times[this.key(i, j)] = Math.round(random ? 400 + Math.random() * 700 : 1500 + Math.exp(this.gauss() * 0.5 + 7.3));
        if (Math.random() < 0.02) { choices[this.key(i, j)] = null; return; }
        const pi = random ? 0.5 : 1 / (1 + Math.exp(-(s[i] - s[j]) * 1.6));
        choices[this.key(i, j)] = Math.random() < pi ? i : j;
      });
      out.push({ choices, times });
    }
    return { choices: out, latent };
  }
};
