// End to end check of both pages against a faked Supabase, so nothing touches the real database.
// Run from the repo root:  node test/smoke.js
// Needs Node and Playwright (npm i playwright, then npx playwright install chromium).
// Screenshots land in test/shots/ (desktop and phone) for a quick look.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

/* ---------- tiny static server for the pages ---------- */
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain' });
  res.end(fs.readFileSync(p));
}).listen(8765);

/* ---------- fake Supabase: REST with the same access rules as the real one, plus auth ---------- */
const tables = { tests: [], responses: [] };
let seq = 0; const uuid = () => '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
const ADMIN = { email: 'admin@example.com', password: 'secret-pass' };
let tokenSerial = 0, refreshes = 0, pwChanges = [];
const session = () => ({ access_token: 'tok' + (++tokenSerial), refresh_token: 'ref' + tokenSerial, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: ADMIN.email } });
function filterRows(rows, params) {
  let out = rows.filter(r => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    const [op, val] = v.split('.'); if (op !== 'eq') throw new Error('fake db: unsupported filter ' + v);
    return String(r[k]) === val;
  }));
  const order = params.get('order'); if (order) { const [col, dir] = order.split('.'); out.sort((a, b) => (a[col] < b[col] ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
  return out;
}
async function fakeRest(route, req) {
  const u = new URL(req.url()); const table = u.pathname.split('/').pop(); const params = u.searchParams; const method = req.method();
  if (u.pathname.endsWith('/rpc/finish_response')) {   // the one function participants may call
    const b = JSON.parse(req.postData()); const r = tables.responses.find(x => x.id === b.p_id);
    if (r && r.comment === '' && r.segments.length === 0 && r.email === '') { r.comment = String(b.p_comment || '').slice(0, 2000); r.segments = b.p_segments || []; r.email = String(b.p_email || ''); }
    return route.fulfill({ status: 204, body: '' });
  }
  const isAdmin = /Bearer tok/.test(req.headers()['authorization']); const wantRows = /representation/.test(req.headers()['prefer'] || '');
  const deny = () => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"new row violates row-level security policy"}' });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  // the real rules: anon may read tests and add responses, admin may do anything
  if (!isAdmin && !((method === 'GET' && table === 'tests') || (method === 'POST' && table === 'responses'))) {
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });   // selects just come back empty
    if (method === 'POST') return deny();
    return route.fulfill({ status: 204, body: '' });   // updates and deletes silently do nothing
  }
  if (!isAdmin && method === 'POST' && wantRows) return deny();   // returning rows needs read permission
  let result;
  if (method === 'GET') { const sel = params.get('select'); result = filterRows(tables[table], params).map(r => { if (sel && sel !== '*') { const o = {}; sel.split(',').forEach(k => o[k] = r[k]); return o; } return r; }); }
  else if (method === 'POST') { const rows = [].concat(body).map(b => ({ ...{ id: uuid() }, closed: false, simulated: false, scenario: '', question: 'Which message do you prefer?', segment_question: '', segment_options: [], ask_email: 'off', segments: [], email: '', comment: '', comment_prompt: 'Your top rated message was {top choice}. What made you choose that message?', times: {}, created_at: new Date(Date.now() + seq * 1000).toISOString(), ...b })); tables[table].push(...rows); result = rows; }
  else if (method === 'PATCH') { result = filterRows(tables[table], params); result.forEach(r => Object.assign(r, body)); }
  else if (method === 'DELETE') { const del = filterRows(tables[table], params); tables[table] = tables[table].filter(r => !del.includes(r)); if (table === 'tests') tables.responses = tables.responses.filter(r => !del.some(t => t.id === r.test_id)); result = del; }
  if (!wantRows && method !== 'GET') return route.fulfill({ status: method === 'POST' ? 201 : 204, body: '' });
  await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(result) });
}
async function fakeAuth(route, req) {
  const u = new URL(req.url()); const body = req.postData() ? JSON.parse(req.postData()) : {};
  const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (u.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
  if (u.pathname.endsWith('/user') && req.method() === 'PUT') { pwChanges.push(body.password); return json(200, {}); }
  const grant = u.searchParams.get('grant_type');
  if (grant === 'password') return body.email === ADMIN.email && body.password === ADMIN.password ? json(200, session()) : json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
  if (grant === 'refresh_token') { refreshes++; return json(200, session()); }
  json(404, {});
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  ctx.on('page', pg => { pg.on('pageerror', e => errors.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); });
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'const CONFIG={SUPABASE_URL:"https://fake-project.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_fake"};' }));
  await ctx.route('https://fake-project.supabase.co/rest/v1/**', fakeRest);
  await ctx.route('https://fake-project.supabase.co/auth/v1/**', fakeAuth);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const base = 'http://localhost:8765/';
  const page = await ctx.newPage();
  const check = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); console.log('ok: ' + msg); };
  const lead = () => page.locator('#groupLead').textContent();

  /* sign in */
  await page.goto(base); await page.waitForSelector('#login.active'); check(true, 'sign in screen first');
  await page.fill('#loginEmail', ADMIN.email); await page.fill('#loginPassword', 'wrong'); await page.click('#loginBtn');
  await page.waitForSelector('#alert.on'); check((await page.locator('#alert').textContent()) === 'Wrong email or password.', 'wrong password message');
  await page.fill('#loginPassword', ADMIN.password); await page.click('#loginBtn'); await page.waitForSelector('#list.active');
  check((await page.locator('#whoEmail').textContent()) === ADMIN.email, 'signed in');
  check(await page.locator('#testList .empty').count() === 1, 'empty tests list');

  /* create a test with scenario and question */
  await page.click('a:has-text("New test")'); await page.waitForSelector('#setup.active');
  check(await page.locator('#createBtn').isDisabled(), 'create disabled with no messages');
  await page.click('#sampleBtn');
  await page.fill('#testScenario', 'Imagine you are looking for help improving conversions on your website.');
  await page.fill('#testQuestion', 'Which headline would make you more likely to book a call?');
  check((await page.locator('label[for="testName"]').textContent()) === 'Name' && (await page.locator('.hint.under').first().textContent()).includes('Only you see'), 'plain labels, name is private');
  await page.click('#addSeg'); await page.fill('#segList .segblock:nth-child(1) input', 'Which best describes you?'); await page.fill('#segList .segblock:nth-child(1) textarea', 'Founder\nMarketer\n\nSales');
  await page.click('#addSeg'); await page.fill('#segList .segblock:nth-child(2) input', 'Company size'); await page.fill('#segList .segblock:nth-child(2) textarea', 'Under 50\n50 or more');
  await page.click('#addSeg'); await page.fill('#segList .segblock:nth-child(3) textarea', 'only one');   // too few answers: dropped
  check((await page.locator('#commentPrompt').inputValue()).includes('{top choice}'), 'closing question prefilled');
  await page.check('input[name="askEmail"][value="optional"]');
  check((await page.locator('#pairHint').textContent()).startsWith('28'), 'sample fills 8 messages, 28 comparisons');
  await page.click('#createBtn'); await page.waitForSelector('#group.active');
  const test = tables.tests[0];
  check(test.scenario.startsWith('Imagine') && test.question.startsWith('Which headline'), 'scenario and question saved');
  check(test.segments.length === 2 && test.segments[0].options.join() === 'Founder,Marketer,Sales' && test.segments[1].question === 'Company size' && test.ask_email === 'optional', 'two segment questions saved, the incomplete one dropped');
  check(test.comment_prompt.startsWith('Your top rated'), 'closing question saved');
  check((await page.locator('#briefQuestion').textContent()).includes('Segment: Which best') && (await page.locator('#segmentFilters select').count()) === 2, 'results page shows both segment questions with a filter each');

  /* edit before any responses: everything is open, including messages */
  await page.click('#editBrief'); await page.waitForSelector('#setup.active');
  check((await page.locator('#setupTitle').textContent()) === 'Edit test' && await page.locator('#msgLocked').isHidden() && (await page.locator('#msgList input').count()) === 8, 'editor opens with messages unlocked');
  await page.fill('#testName', 'Sample headline test v2'); await page.locator('#msgList input').nth(7).fill('A brand new eighth message');
  await page.click('#createBtn'); await page.waitForSelector('#group.active');
  check(tables.tests[0].name === 'Sample headline test v2' && tables.tests[0].messages[7] === 'A brand new eighth message' && tables.tests[0].segments.length === 2, 'edits saved, segments kept');
  check((await page.locator('#testTitle').textContent()) === 'Sample headline test v2', 'results page shows the new name');
  await page.click('#editClosing'); await page.fill('#closingInput', 'Why did {top choice} win for you?'); await page.click('#closingForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('closingText').textContent.includes('Why did'));
  check(tables.tests[0].comment_prompt === 'Why did {top choice} win for you?', 'closing question edited on an existing test');
  await page.click('#editClosing'); await page.click('#cancelClosing'); check(await page.locator('#closingForm').isHidden(), 'edit can be cancelled');
  check((await page.locator('#briefQuestion').textContent()).includes('book a call'), 'results page shows the question');
  check((await page.locator('#gRank .empty').count()) === 1, 'empty results state');
  const shareUrl = await page.inputValue('#shareUrl'); check(shareUrl === base + 'survey.html?t=' + test.id, 'share url');
  check((await page.locator('#previewLink').getAttribute('href')) === shareUrl + '&preview', 'preview link');

  /* simulate and look at every tab */
  await page.click('#simBtn'); await page.waitForFunction(() => document.getElementById('groupLead').textContent.startsWith('15 participants'));
  for (const v of ['v-rank', 'v-h2h', 'v-bt', 'v-winner', 'v-spread', 'v-consist']) {
    await page.click('.tab[data-v="' + v + '"]');
    check(await page.locator('#' + v).isVisible() && (await page.locator('#' + v).innerText()).length > 50, 'tab ' + v + ' renders');
    await page.screenshot({ path: path.join(SHOTS, 'admin-' + v + '.png'), fullPage: true });
  }
  check(await page.locator('#consist li').count() === 15, 'consistency lists 15');
  await page.click('#editLink'); await page.waitForSelector('#setup.active');
  check(await page.locator('#msgLocked').isVisible() && (await page.locator('#msgLocked').textContent()).includes('simulated') && await page.locator('#msgList input').first().isDisabled() && await page.locator('#msgTools').isHidden(), 'messages lock once responses exist');
  await page.fill('#testScenario', 'Edited scenario after responses.\n\nSecond paragraph.'); await page.click('#createBtn'); await page.waitForSelector('#group.active');
  check(tables.tests[0].scenario === 'Edited scenario after responses.\n\nSecond paragraph.' && tables.tests[0].messages[7] === 'A brand new eighth message', 'other fields still editable, messages untouched');
  await page.click('#dupBtn'); await page.waitForSelector('#setup.active');
  const copy = tables.tests[tables.tests.length - 1];
  check(tables.tests.length === 2 && copy.name === 'Sample headline test v2 (copy)' && copy.messages.join() === tables.tests[0].messages.join() && copy.segments.length === 2 && copy.ask_email === 'optional' && page.url().includes('?edit=' + copy.id) && await page.locator('#msgLocked').isHidden(), 'duplicate from results opens an unlocked copy');
  await page.goto(base); await page.waitForSelector('#testList li');
  check(await page.locator('#testList .dup').count() === 2, 'tests list has a duplicate button per test');
  await page.locator('#testList .dup').last().click(); await page.waitForSelector('#setup.active');
  check(tables.tests.length === 3 && tables.tests[2].name.endsWith('(copy)'), 'duplicate from the list');
  await page.goto(base + '?test=' + tables.tests[0].id); await page.waitForSelector('#group.active'); await page.waitForFunction(() => document.getElementById('groupLead').textContent.startsWith('15 participants'));
  await page.click('.tab[data-v="v-consist"]');
  check(tables.responses.every(r => ['Founder', 'Marketer', 'Sales'].includes(r.segments[0]) && ['Under 50', '50 or more'].includes(r.segments[1])), 'simulated participants answer every segment question');
  check(tables.responses.every(r => Object.keys(r.times).length === 28), 'simulated participants carry timings');
  check((await page.locator('#consist li .small').first().textContent()).includes('s per pair'), 'consistency shows seconds per pair');
  const rushedRows = await page.locator('#consist li .flag', { hasText: 'Rushed' }).count();
  const rushedData = tables.responses.filter(r => { const v = Object.values(r.times).sort((a, b) => a - b); return v[14] < 1500; }).length;
  check(rushedRows === rushedData, 'rushed flag matches the data (' + rushedRows + ' rushed)');
  await page.selectOption('#segmentFilters select:nth-child(1)', 'Founder'); await page.selectOption('#segmentFilters select:nth-child(2)', 'Under 50');
  const both = tables.responses.filter(r => r.segments[0] === 'Founder' && r.segments[1] === 'Under 50').length;
  check((await lead()).startsWith(both + ' participant') && (await lead()).includes('in "Founder" and "Under 50"'), 'two filters combine: ' + await lead());
  await page.selectOption('#segmentFilters select:nth-child(1)', ''); await page.selectOption('#segmentFilters select:nth-child(2)', '');

  /* client summary opens in a new tab, reads right, downloads */
  const [sum] = await Promise.all([ctx.waitForEvent('page'), page.click('#summaryBtn')]);
  await sum.waitForSelector('.verdict'); await sum.waitForTimeout(300);
  const verdict = await sum.locator('.verdict h2').textContent();
  check(['Clear winner', 'Likely winner', 'Top two are close', 'No outright winner'].includes(verdict), 'summary verdict: ' + verdict);
  check(await sum.locator('table.rank:not(.segs):not(.power) tr').count() === 9, 'summary ranking has 8 rows');
  check(await sum.locator('table.grid td').count() === 64, 'summary head to head grid');
  check((await sum.locator('h1').textContent()) === 'Sample headline test v2' && (await sum.locator('.brief').textContent()).includes('book a call'), 'summary title, scenario and question');
  check((await sum.locator('body').innerText()).includes('simulated'), 'summary warns about simulated data');
  check(await sum.locator('.logo svg').count() === 1, 'summary carries the logo inline');
  check(await sum.locator('table.segs').count() === 2, 'summary has a by segment table per question');
  check(await sum.locator('table.power td.seg').count() === 5 && (await sum.locator('body').innerText()).includes('How many participants it takes'), 'summary has the sample size guidance');
  await sum.screenshot({ path: path.join(SHOTS, 'summary.png'), fullPage: true });
  const [sdl] = await Promise.all([sum.waitForEvent('download'), sum.click('#dl')]);
  const shtml = fs.readFileSync(await sdl.path(), 'utf8');
  check(sdl.suggestedFilename() === 'sample-headline-test-v2-summary.html' && !/class="toolbar"/.test(shtml) && /Ranking/.test(shtml), 'summary downloads as standalone html');
  await sum.close();
  await page.click('#consist li:first-child .acts button:first-child'); check((await lead()).includes('1 hidden'), 'hide one participant');
  await page.reload(); await page.waitForSelector('#group.active'); await page.waitForFunction(() => document.getElementById('groupLead').textContent.includes('1 hidden'));
  check(true, 'hidden state and login survive reload');
  await page.click('.tab[data-v="v-consist"]'); await page.click('#includeAll');
  page.once('dialog', d => d.accept()); await page.click('#consist li:first-child .acts button:last-child');
  await page.waitForFunction(() => document.getElementById('groupLead').textContent.startsWith('14 participants'));
  check(tables.responses.length === 14, 'delete one participant');

  /* preview: nothing saved */
  const pv = await ctx.newPage(); await pv.goto(shareUrl + '&preview'); await pv.waitForSelector('#intro.active');
  check(await pv.locator('#previewBar').isVisible(), 'preview banner');
  check((await pv.locator('#introScenario').textContent()).includes('\n\nSecond paragraph') && await pv.evaluate(() => getComputedStyle(document.getElementById('introScenario')).whiteSpace === 'pre-line'), 'scenario shown on intro with its paragraph breaks');
  check((await pv.locator('#intro h1').textContent()) === 'You have been invited to a quick survey' && !(await pv.locator('#intro').innerText()).includes('Sample headline'), 'generic welcome, test name hidden');
  await pv.click('#beginBtn'); await pv.waitForSelector('#survey.active');
  check((await pv.locator('#question').textContent()).startsWith('Which headline'), 'custom question above pairs');
  for (let i = 0; i < 28; i++) { await pv.click('#optA'); await pv.waitForTimeout(220); }
  await pv.waitForSelector('#final.active');
  check(/^Why did ".+" win for you\?$/.test(await pv.locator('#commentPrompt').textContent()), 'closing question with top choice filled in: ' + await pv.locator('#commentPrompt').textContent());
  check(await pv.locator('#finalSkip').isHidden() && (await pv.locator('#segBlocks .choices').count()) === 2, 'final screen has both segment questions, no skip when required');
  await pv.check('input[name="segment0"][value="Marketer"]'); await pv.click('#finalSend'); check(await pv.locator('#finalError').isVisible(), 'every segment question must be answered');
  await pv.screenshot({ path: path.join(SHOTS, 'final.png'), fullPage: true });
  await pv.check('input[name="segment1"][value="50 or more"]'); await pv.click('#finalSend'); await pv.waitForSelector('#results.active');
  check(tables.responses.length === 14, 'preview saved nothing');
  check(await pv.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pt-progress') || k.startsWith('pt-done')).length) === 0, 'preview left no browser state');
  check(await pv.locator('#againBtn').isVisible(), 'preview offers run again');
  await pv.close();

  /* real participant, on a phone */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('page', pg => pg.on('pageerror', e => errors.push('phone pageerror: ' + e.message)));
  await phone.route('**/config.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'const CONFIG={SUPABASE_URL:"https://fake-project.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_fake"};' }));
  await phone.route('https://fake-project.supabase.co/rest/v1/**', fakeRest);
  await phone.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const sp = await phone.newPage();
  await sp.goto(shareUrl); await sp.waitForSelector('#intro.active');
  check((await sp.locator('#introCount').textContent()) === '28 pairs, about 2 minutes.', 'time estimate: ' + await sp.locator('#introCount').textContent());
  await sp.screenshot({ path: path.join(SHOTS, 'phone-intro.png'), fullPage: true });
  await sp.tap('#beginBtn'); await sp.waitForSelector('#survey.active');
  const firstPair = await sp.locator('#optA .txt').textContent();
  check((await sp.locator('#backBtn').textContent()) === 'Back to the instructions', 'first pair offers a way back to the instructions');
  await sp.tap('#backBtn'); await sp.waitForSelector('#intro.active'); check((await sp.locator('#beginBtn').textContent()) === 'Continue', 'instructions shown again with Continue');
  await sp.tap('#beginBtn'); await sp.waitForSelector('#survey.active');
  check((await sp.locator('#optA .txt').textContent()) === firstPair && (await sp.locator('#progText').textContent()) === 'Pair 1 of 28', 'continue returns to the same first pair');
  check(await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll on phone');
  await sp.screenshot({ path: path.join(SHOTS, 'phone-survey.png'), fullPage: true });
  for (let i = 0; i < 5; i++) { await sp.tap(i % 2 ? '#optA' : '#optB'); await sp.waitForTimeout(220); }
  await sp.tap('#backBtn'); check((await sp.locator('#progText').textContent()) === 'Pair 5 of 28' && await sp.locator('#optB.picked').count() === 1, 'back shows the previous pair with the earlier pick');
  await sp.tap('#optA'); await sp.waitForTimeout(220); check((await sp.locator('#progText').textContent()) === 'Pair 6 of 28', 'changed answer moves on again');
  await sp.tap('#skipBtn'); await sp.waitForTimeout(220);
  await sp.reload(); await sp.waitForSelector('#survey.active');
  check((await sp.locator('#progText').textContent()) === 'Pair 7 of 28', 'progress survives reload');
  for (let i = 6; i < 28; i++) { await sp.tap(i % 2 ? '#optA' : '#optB'); await sp.waitForTimeout(220); }
  await sp.waitForSelector('#final.active');
  check(tables.responses.filter(r => !r.simulated).length === 1, 'response saved before the final screen');
  await sp.screenshot({ path: path.join(SHOTS, 'phone-final.png'), fullPage: true });
  await sp.fill('#commentText', 'It felt the most concrete.'); await sp.check('input[name="segment0"][value="Sales"]'); await sp.check('input[name="segment1"][value="Under 50"]'); await sp.fill('#email', 'pat@example.com');
  await sp.tap('#finalSend'); await sp.waitForSelector('#results.active');
  check(tables.responses.find(r => !r.simulated).comment === 'It felt the most concrete.', 'comment attached to the saved response');
  check(Object.keys(tables.responses.find(r => !r.simulated).choices).length === 28, '28 choices recorded');
  const realResp = tables.responses.find(r => !r.simulated); check(realResp.segments.join() === 'Sales,Under 50' && realResp.email === 'pat@example.com', 'segment answers and email saved with the response');
  check(Object.keys(realResp.times).length === 28 && Object.values(realResp.times).every(t => t > 0 && t < 60000), 'a time was recorded for every pair');
  check(!(await sp.locator('#againBtn').isVisible()), 'no retake for real participants');
  await sp.screenshot({ path: path.join(SHOTS, 'phone-done.png'), fullPage: true });
  await sp.reload(); await sp.waitForSelector('#results.active');
  check((await sp.locator('#resultsLead').textContent()).startsWith('You already completed'), 'done flag blocks retake');
  await phone.close();

  /* admin: refresh, export, remove simulated, close, delete */
  await page.click('#refreshBtn'); await page.waitForFunction(() => document.getElementById('groupLead').textContent.startsWith('15 participants'));
  await page.click('.tab[data-v="v-comments"]'); check(await page.locator('#comments li').count() === 1 && (await page.locator('#comments .said').textContent()) === 'It felt the most concrete.', 'comments tab lists the comment');
  await page.screenshot({ path: path.join(SHOTS, 'admin-v-comments.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'); check(csv.split('\n').length === 1 + 15 * 28 && csv.includes('"Sales","Under 50","pat@example.com","It felt the most concrete."') && csv.split('\n')[0].startsWith('participant,submitted,"Which best describes you?","Company size",email,comment'), 'csv has a column per segment question, email, comment and seconds');
  await page.click('#unsimBtn'); await page.waitForFunction(() => document.getElementById('groupLead').textContent.startsWith('1 participant,'));
  check(await page.locator('#unsimBtn').isDisabled(), 'remove simulated');
  await page.click('#closeBtn'); await page.waitForFunction(() => document.getElementById('statusPill').textContent === 'Closed');
  const closedCheck = await ctx.newPage(); await closedCheck.goto(shareUrl); await closedCheck.waitForSelector('#message.active');
  check((await closedCheck.locator('#msgTitle').textContent()) === 'This test is closed', 'closed test blocks participants');
  await closedCheck.goto(shareUrl + '&preview'); await closedCheck.waitForSelector('#intro.active'); check(true, 'preview still works when closed');
  await closedCheck.close();

  /* password change, sign out */
  await page.goto(base + '?password'); await page.waitForSelector('#password.active');
  await page.fill('#newPassword', 'newsecret123'); await page.fill('#newPassword2', 'newsecret123'); await page.click('#passwordBtn');
  await page.waitForFunction(() => document.getElementById('passwordHint').textContent === 'Saved.'); check(pwChanges[0] === 'newsecret123', 'password change sent');
  await page.goto(base + '?test=' + tables.tests[0].id); await page.waitForSelector('#group.active');
  page.once('dialog', d => d.accept()); await page.click('#deleteBtn'); await page.waitForSelector('#list.active');
  check(tables.tests.length === 2 && tables.responses.length === 0 && tables.tests.every(t => t.name.endsWith('(copy)')), 'delete test cascades, copies untouched');
  await page.click('#signOutBtn'); await page.waitForSelector('#login.active'); check(true, 'signed out');

  /* dark mode look */
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto(base + '?new'); await page.waitForSelector('#login.active');
  await page.screenshot({ path: path.join(SHOTS, 'login-dark.png'), fullPage: true });

  const real = errors.filter(e => !/Wrong email or password|status of 400/.test(e));   // the deliberate wrong password logs itself
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'no console or page errors');
  await browser.close(); server.close();
  if (real.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
