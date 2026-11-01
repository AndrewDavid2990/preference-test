// The client summary: a one page, branded, printable write up of a test's results.
// It opens in a new tab with "Save as PDF" (the browser's print) and "Download" (a
// self contained HTML file that opens anywhere, no login needed). All numbers come
// from analysis.groupStats, the same maths as the results tabs.

const summary = {
  logo: "",   // the logo file's contents, fetched once so it can be inlined in the summary

  // Build the whole page as a string. Everything is inlined so the downloaded file stands alone.
  build(test, parts, hiddenCount, filters) {
    filters = filters || [];
    const segQs = test.segments || [];
    const n = test.messages.length, st = analysis.groupStats(n, parts);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const pct = x => Math.round(x * 100) + "%";
    const msg = i => esc(test.messages[i]);
    const simCount = parts.filter(p => p.simulated).length;
    const date = new Date().toLocaleDateString([], { dateStyle: "long" });
    const logo = this.logo;

    /* verdict in plain language */
    const top = st.top, winner = msg(top);
    const condorcet = !st.losses.length;
    const tt = st.topTwo;
    let headline, detail;
    if (condorcet && tt.verdict === "clear") {
      headline = "Clear winner";
      detail = `"${winner}" beat every other message head to head and is clearly ahead of the runner up (${tt.k} of ${tt.m} participants preferred it, p = ${tt.p.toFixed(3)}).`;
    } else if (condorcet && tt.verdict === "likely") {
      headline = "Likely winner";
      detail = `"${winner}" beat every other message head to head. The gap to the runner up is likely real but not conclusive (${tt.k} of ${tt.m} participants preferred it, p = ${tt.p.toFixed(2)}). More participants would settle it.`;
    } else if (condorcet) {
      headline = "Top two are close";
      detail = `"${winner}" edges every other message head to head, but against the runner up it is a coin flip (${tt.k} of ${tt.m}, p = ${tt.p.toFixed(2)}). Treat the top two as tied, or test them again with more people.`;
    } else {
      headline = "No outright winner";
      detail = `"${winner}" has the most wins overall but loses or ties head to head against ${st.losses.map(j => `"${msg(j)}" (${pct(st.M[top][j] / st.N[top][j])} preferred the leader)`).join(", ")}. The ranking is contested at the top.`;
    }

    /* ranking table */
    const rankRows = st.order.map((i, pos) => {
      const s = st.strength[i];
      return `<tr>
        <td class="pos">${pos + 1}</td>
        <td class="msg">${msg(i)}${st.spread[i].split ? ' <span class="tag">divisive</span>' : ""}</td>
        <td class="num">${pct(st.rate(i))}<div class="meter"><div style="width:${pct(st.rate(i))}"></div></div></td>
        <td class="num">${pct(s.value)}${s.banded ? `<div class="band">${pct(s.lo)} to ${pct(s.hi)}</div>` : ""}</td>
      </tr>`;
    }).join("");

    /* head to head grid */
    const grid = `<table class="grid"><tr><th></th>${st.order.map((_, pos) => `<th>#${pos + 1}</th>`).join("")}</tr>` +
      st.order.map((i, pos) => `<tr><th class="rowhead">#${pos + 1} ${msg(i)}</th>` + st.order.map(j => {
        if (i === j) return '<td class="self"></td>';
        const r = st.N[i][j] ? st.M[i][j] / st.N[i][j] : 0.5, a = Math.abs(r - 0.5) * 2;
        const style = r >= 0.5 ? `background:color-mix(in srgb, #d93637 ${Math.round(a * 55)}%, #fff)` : "background:#f5f4f1;color:#9b9893";
        return `<td style="${style}">${st.N[i][j] ? pct(r) : ""}</td>`;
      }).join("") + "</tr>").join("") + "</table>";

    /* by segment: for each unfiltered segment question, the top three messages per answer */
    let bySegment = "";
    segQs.forEach((sq, qi) => {
      if (filters[qi]) return;
      const segs = sq.options.filter(o => parts.some(p => (p.segments || [])[qi] === o));
      if (segs.length < 2) return;
      const rows = segs.map(o => {
        const group = parts.filter(p => (p.segments || [])[qi] === o), gs = analysis.groupStats(n, group);
        return `<tr><td class="seg">${esc(o)}<div class="band">${group.length} participant${group.length === 1 ? "" : "s"}</div></td>` +
          [0, 1, 2].map(k => gs.order[k] === undefined ? "<td></td>" : `<td>${msg(gs.order[k])}<div class="band">${pct(gs.rate(gs.order[k]))} win rate</div></td>`).join("") + "</tr>";
      }).join("");
      bySegment += `<h2>By segment: ${esc(sq.question)}</h2><p class="method">Top three messages within each group${segs.some(o => parts.filter(p => (p.segments || [])[qi] === o).length < 5) ? ". Small groups are indicative only" : ""}.</p>
        <table class="rank segs"><tr><th>Answer</th><th>#1</th><th>#2</th><th>#3</th></tr>${rows}</table>`;
    });

    /* what participants said */
    let comments = "";
    const said = parts.filter(p => p.comment);
    if (said.length) {
      comments = `<h2>In their words</h2><p class="method">Answers to "${esc(test.comment_prompt)}". Each person's own top choice is shown first.</p><ul class="quotes">` +
        said.map(p => { const top = analysis.groupStats(n, [p]).order[0]; return `<li><span class="band">${msg(top)}${(p.segments || []).filter(Boolean).length ? " · " + esc(p.segments.filter(Boolean).join(", ")) : ""}</span><br>${esc(p.comment)}</li>`; }).join("") + "</ul>";
    }

    /* things to watch */
    const notes = [];
    const divisive = st.order.filter(i => st.spread[i].split);
    if (divisive.length) notes.push(`<li><strong>Divisive:</strong> ${divisive.map(i => `"${msg(i)}"`).join(", ")} ${divisive.length > 1 ? "were" : "was"} ranked near the top by some participants and near the bottom by others. Average scores hide that. Worth asking who loved it and who did not.</li>`);
    if (st.skipped) notes.push(`<li><strong>Skips:</strong> ${st.skipped} pair${st.skipped === 1 ? " was" : "s were"} skipped as "no preference". Skipped pairs are left out of the numbers.</li>`);
    const rushed = parts.filter(p => analysis.junk(n, p).rushed).length;
    if (rushed) notes.push(`<li><strong>Rushed:</strong> ${rushed} included participant${rushed === 1 ? "" : "s"} averaged under 1.5 seconds per pair, which is too fast to have read both messages. Consider excluding them.</li>`);
    if (hiddenCount) notes.push(`<li><strong>Excluded:</strong> ${hiddenCount} participant${hiddenCount === 1 ? "" : "s"} ${hiddenCount === 1 ? "was" : "were"} excluded for inconsistent answers (the pattern of random clicking).</li>`);
    if (simCount) notes.push(`<li><strong>Simulated data:</strong> ${simCount} of these participants are simulated. Remove them before sharing this with a client.</li>`);
    if (st.P < 10) notes.push(`<li><strong>Small sample:</strong> ${st.P} participant${st.P === 1 ? "" : "s"} is enough to spot a strong favourite but not to separate close messages. Treat gaps under about 10 points as noise.</li>`);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(test.name)}: preference test summary</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Montserrat:wght@700;800&display=swap">
<style>
  :root { --ink: #0d0d0d; --body: #3d3d3a; --muted: #9b9893; --line: #e8e6e1; --panel: #f5f4f1; --red: #d93637; --red-soft: #f6bfbf; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--body); font-family: "Poppins", sans-serif; font-size: 14px; line-height: 1.55; }
  .page { max-width: 760px; margin: 0 auto; padding: 44px 40px 60px; }
  .toolbar { display: flex; gap: 8px; justify-content: flex-end; max-width: 760px; margin: 0 auto; padding: 14px 40px 0; }
  .toolbar button { font: inherit; font-weight: 600; font-size: 13px; padding: 9px 14px; border-radius: 3px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; }
  .toolbar button.primary { background: var(--ink); color: #f5f4f1; border-color: var(--ink); }
  .logo { height: 18px; width: auto; display: block; margin-bottom: 36px; }
  .logo svg { height: 18px; width: auto; display: block; }
  .eyebrow { font-size: 14px; color: var(--muted); }
  th { font-size: 12px; font-weight: 500; color: var(--muted); }
  .tag { font-size: 12px; color: var(--muted); }
  .label { font-size: 12px; font-weight: 600; color: var(--muted); }
  h1, h2 { font-family: "Gotham", "Gotham Bold", "Montserrat", sans-serif; color: var(--ink); margin: 0; }
  h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; margin: 6px 0 8px; }
  h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin: 34px 0 10px; }
  .meta { color: var(--muted); margin: 0 0 22px; }
  .brief { background: var(--panel); padding: 14px 18px; margin: 0 0 8px; }
  .brief p { margin: 0 0 4px; } .brief p:last-child { margin: 0; }
  .verdict { border-top: 6px solid var(--ink); background: var(--panel); padding: 20px 22px; margin: 26px 0 0; }
  .verdict.soft { border-top-color: var(--line); }
  .verdict h2 { margin: 0 0 6px; font-size: 22px; }
  .verdict p { margin: 0; color: var(--ink); font-size: 15px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .rank { border: 1.5px solid var(--ink); }
  .rank th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .rank td { padding: 11px 12px; border-top: 1px solid var(--line); vertical-align: top; color: var(--ink); }
  .rank tr:first-child td { border-top: 0; }
  .rank .pos { font-family: "Montserrat", sans-serif; font-weight: 700; color: var(--muted); width: 36px; }
  .rank tr:first-child .pos { color: var(--ink); }
  .rank .msg { font-weight: 500; }
  .rank .num { width: 150px; font-weight: 600; white-space: nowrap; }
  .meter { height: 6px; background: var(--line); margin-top: 6px; width: 120px; } .meter div { height: 100%; background: var(--red); }
  .band { font-size: 12px; font-weight: 400; color: var(--muted); }
  .tag { margin-left: 6px; }
  .segs td { font-size: 13px; } .segs .seg { font-weight: 600; width: 160px; }
  .quotes { list-style: none; padding: 0; } .quotes li { padding: 10px 14px; border-left: 3px solid var(--line); margin-bottom: 10px; color: var(--ink); white-space: pre-wrap; }
  .grid { border: 1.5px solid var(--ink); width: auto; }
  .grid th, .grid td { padding: 7px 9px; border: 1px solid var(--line); text-align: center; white-space: nowrap; font-weight: 600; color: var(--ink); }
  .grid th.rowhead { text-align: left; max-width: 260px; white-space: normal; font-weight: 500; font-size: 12px; }
  .grid td.self { background: var(--line); }
  ul { padding-left: 18px; margin: 0; } li { margin-bottom: 8px; }
  .method { color: var(--muted); font-size: 12.5px; }
  .method p { margin: 0 0 8px; }
  .foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  @media print { .toolbar { display: none; } .page { padding: 0; max-width: none; } body { font-size: 12.5px; } h2 { page-break-after: avoid; } table, .verdict { page-break-inside: avoid; } }
  @page { margin: 18mm; }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()" class="primary">Save as PDF</button><button id="dl">Download</button></div>
<div class="page">
  <div class="logo">${logo}</div>
  <div class="eyebrow">Preference test summary</div>
  <h1>${esc(test.name)}</h1>
  <p class="meta">${st.P} participant${st.P === 1 ? "" : "s"}${filters.filter(Boolean).length ? " in " + filters.filter(Boolean).map(f => `"${esc(f === "(none)" ? "No answer" : f)}"`).join(" and ") : ""} · ${n} messages · ${n * (n - 1) / 2} pairs each · ${date}</p>
  ${test.scenario || test.question ? `<div class="brief">${test.scenario ? `<p><span class="label">Scenario</span><br>${esc(test.scenario)}</p>` : ""}<p><span class="label">Question</span><br>${esc(test.question || "Which message do you prefer?")}</p></div>` : ""}

  <div class="verdict${headline === "Clear winner" || headline === "Likely winner" ? "" : " soft"}">
    <h2>${headline}</h2>
    <p>${detail}</p>
  </div>

  <h2>Ranking</h2>
  <table class="rank">
    <tr><th>#</th><th>Message</th><th>Win rate</th><th>Strength</th></tr>
    ${rankRows}
  </table>
  <p class="method" style="margin-top:8px"><strong>Win rate</strong> is how often the message won the pairs it appeared in. <strong>Strength</strong> is the chance it beats an average message in this set, from a Bradley-Terry model${st.P >= 5 ? "; the small range is a 90% confidence band from resampling participants. Overlapping bands mean those messages are not clearly separated" : ""}.</p>

  <h2>Head to head</h2>
  <p class="method">Share of participants who picked the row message over the column message. Deeper red means the row won that matchup more often.</p>
  ${grid}

  ${bySegment}

  ${comments}

  ${notes.length ? `<h2>Things to watch</h2><ul>${notes.join("")}</ul>` : ""}

  <h2>How the test worked</h2>
  <div class="method">
    <p>Each participant saw every possible pair of the ${n} messages (${n * (n - 1) / 2} pairs) one at a time, in a random order with random left and right placement, and picked the one they preferred. Because everyone judged every pair, each person has a complete personal ranking and no message got an easier draw than another.</p>
    <p>The ranking counts total wins. "Clear winner" means the top message beat every other message head to head and its lead over the runner up is statistically unlikely to be chance (an exact binomial test, p under 0.05). "Divisive" marks a message that at least 30% of participants ranked in their top two and at least 30% ranked in their bottom two.</p>
  </div>

  <p class="foot">Prepared with Tested's preference test tool, ${date}.</p>
</div>
<script>
  // Download: save a copy of this page without the toolbar. In the downloaded copy there is
  // no button, so this does nothing there.
  var dl = document.getElementById("dl");
  if (dl) dl.addEventListener("click", function () {
    var copy = document.documentElement.cloneNode(true);
    copy.querySelector(".toolbar").remove();
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["<!DOCTYPE html>" + copy.outerHTML], { type: "text/html" }));
    a.download = ${JSON.stringify(test.name.replace(/[^\w]+/g, "-").toLowerCase() + "-summary.html")}; a.click(); URL.revokeObjectURL(a.href);
  });
</script>
</body>
</html>`;
  },

  // Open the summary in a new tab. The page is handed to the browser as a file (a blob URL)
  // rather than written into a blank tab, so the tab keeps this site's identity and its own
  // Download button is allowed to work. Must be called directly from a click so pop up
  // blockers allow the new tab.
  open(test, parts, hiddenCount, filters) {
    const html = this.build(test, parts, hiddenCount, filters);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) throw new Error("The browser blocked the new tab. Allow pop ups for this site and try again.");
  }
};

// Fetch the logo once, early, so it is ready by the time someone clicks the button.
fetch("tested.svg").then(r => r.text()).then(t => { summary.logo = t; }).catch(() => {});
