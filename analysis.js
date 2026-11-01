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

  /* ---------- simulation ---------- */

  gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },

  // Fake participants for exercising the group views. Message index 1 is made
  // polarizing, about 1 in 12 participants click at random, and 2% of pairs are skipped.
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
      const choices = {};
      this.allPairs(n).forEach(([i, j]) => {
        if (Math.random() < 0.02) { choices[this.key(i, j)] = null; return; }
        const pi = random ? 0.5 : 1 / (1 + Math.exp(-(s[i] - s[j]) * 1.6));
        choices[this.key(i, j)] = Math.random() < pi ? i : j;
      });
      out.push(choices);
    }
    return { choices: out, latent };
  }
};
