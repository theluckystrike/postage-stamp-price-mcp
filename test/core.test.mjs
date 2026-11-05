// Fixture: test/fixtures/Notice123-2026-11-06.html.gz is https://pe.usps.com/text/dmm300/Notice123.htm downloaded 2026-11-06
// ("Notice 123 • Effective October 04, 2026"). Expected prices are read off that page: stamped letter 1 oz $0.82, 2 oz $1.11,
// 3 oz $1.40, 3.5 oz $1.69; postcard $0.65; nonmachinable surcharge $0.49; international letter 1 oz $1.75; flat rate boxes
// $14.65, $25.80, $36.10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { parseNotice123, getStampPrice, calculateLetterPostage, getFlatRatePrices, destOf, InputError, UpstreamError, UTM, NOTICE_123 } from '../dist/core.js';

const html = gunzipSync(readFileSync(new URL('./fixtures/Notice123-2026-11-06.html.gz', import.meta.url))).toString('utf8');
const f = async (u) => { assert.equal(u, NOTICE_123); return html; };

test('parse: effective 2026-10-04, stamped letters 0.82 / 1.11 / 1.40 / 1.69, metered 0.78', () => {
  const p = parseNotice123(html);
  assert.equal(p.effective, '2026-10-04');
  assert.deepEqual(p.stamped_letter, { 1: 0.82, 2: 1.11, 3: 1.4, 3.5: 1.69 });
  assert.equal(p.metered_letter['1'], 0.78);
  assert.equal(p.postcard, 0.65); assert.equal(p.nonmachinable_surcharge, 0.49);
});
test('parse: large envelopes 1.69 to 5.24 over 13 oz', () => {
  const p = parseNotice123(html);
  assert.equal(Object.keys(p.large_envelope).length, 13); assert.equal(p.large_envelope['1'], 1.69); assert.equal(p.large_envelope['13'], 5.24);
});
test('parse: international letters 1.75 at 1 oz everywhere; 2 oz Canada 2.35, Mexico 2.60, other 3.50; postcards 1.75', () => {
  const p = parseNotice123(html);
  assert.deepEqual(p.intl_letter.canada, { 1: 1.75, 2: 2.35, 3: 2.95, 3.5: 3.5 });
  assert.deepEqual(p.intl_letter.mexico, { 1: 1.75, 2: 2.6, 3: 3.5, 3.5: 4.15 });
  assert.deepEqual(p.intl_letter.other, { 1: 1.75, 2: 3.5, 3: 5.25, 3.5: 5.75 });
  assert.deepEqual(p.intl_postcard, { canada: 1.75, mexico: 1.75, other: 1.75 });
});
test('parse: flat rate envelope 13.90, boxes 14.65 / 25.80 / 36.10, APO 34.65, Express envelope 38.25', () => {
  const p = parseNotice123(html);
  assert.equal(p.flat_rate.priority_mail_flat_rate_envelope, 13.9);
  assert.equal(p.flat_rate.priority_mail_small_flat_rate_box, 14.65); assert.equal(p.flat_rate.priority_mail_medium_flat_rate_box, 25.8);
  assert.equal(p.flat_rate.priority_mail_large_flat_rate_box, 36.1); assert.equal(p.flat_rate.priority_mail_apo_fpo_dpo_large_flat_rate_box, 34.65);
  assert.equal(p.flat_rate.priority_mail_express_flat_rate_envelope, 38.25);
});
test('parse: a page without Notice 123 or with a missing cell is an upstream error', () => {
  assert.throws(() => parseNotice123('<html>Access Denied</html>'), UpstreamError);
  assert.throws(() => parseNotice123(html.replace("data-content='DFXL0XXXXR00020'", "data-content='XXXXXXXXXXXXXXX'")), UpstreamError);
});
test('stamp price: $0.82, extra ounce $0.29', async () => {
  const r = await getStampPrice(f);
  assert.equal(r.forever_stamp_price, 0.82); assert.equal(r.additional_ounce, 0.29); assert.equal(r.international_letter_1_oz, 1.75);
  assert.match(r.summary, /October 4, 2026/); assert.ok(r.more.includes(UTM));
});
test('postage: 40 square 1.2 oz cards = 1.11 + 0.49 = 1.60 each, $64.00, 2 Forever stamps each', async () => {
  const r = await calculateLetterPostage(f, { weight_oz: 1.2, quantity: 40, nonmachinable: true });
  assert.equal(r.price_each, 1.6); assert.equal(r.total, 64); assert.equal(r.forever_stamps_needed_each, 2); assert.equal(r.weight_bracket_oz, '2');
});
test('postage: 1 oz letter to Germany $1.75 (one Global Forever), 2 oz to Mexico $2.60, 5 oz letter refused', async () => {
  const de = await calculateLetterPostage(f, { destination: 'Germany' });
  assert.equal(de.price_each, 1.75); assert.match(de.summary, /Global Forever/);
  assert.equal((await calculateLetterPostage(f, { destination: 'Mexico', weight_oz: 2 })).price_each, 2.6);
  await assert.rejects(calculateLetterPostage(f, { weight_oz: 5 }), InputError);
  assert.equal((await calculateLetterPostage(f, { type: 'large_envelope', weight_oz: 5 })).price_each, 2.85);
});
test('postage: 25 postcards $16.25; destOf', async () => {
  assert.equal((await calculateLetterPostage(f, { type: 'postcard', quantity: 25 })).total, 16.25);
  assert.equal(destOf('USA'), 'us'); assert.equal(destOf('Japan'), 'other'); assert.equal(destOf('canada'), 'canada');
});
test('flat rate prices list 10 products', async () => {
  const r = await getFlatRatePrices(f);
  assert.equal(r.flat_rate.length, 10); assert.match(r.summary, /Medium Flat Rate Box \$25\.80/);
});
test('stdio: initialize, tools/list and a tools/call over JSON-RPC', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  try {
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal((await got(1)).result.serverInfo.name, 'postage-stamp-price-mcp');
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/list' });
    assert.deepEqual((await got(2)).result.tools.map((t) => t.name), ['get_stamp_price', 'calculate_letter_postage', 'get_flat_rate_prices']);
    send({ id: 3, method: 'tools/call', params: { name: 'calculate_letter_postage', arguments: { quantity: 0 } } });
    const r3 = await got(3);
    assert.equal(r3.result?.isError ?? Boolean(r3.error), true);
  } finally { child.kill(); }
});
