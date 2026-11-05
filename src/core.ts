// Pure core for postage-stamp-price-mcp. The only I/O is a keyless read of USPS Notice 123 (the official retail price
// list on Postal Explorer), done through an injected fetchText. Prices are found by the USPS SKU attached to each price
// cell, which is stable across price changes, and only small slices of the 1.5 MB page are scanned.
import type { FetchText } from './types.js';

export const REPO = 'postage-stamp-price-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const NOTICE_123 = 'https://pe.usps.com/text/dmm300/Notice123.htm';
export const more = () => `${SITE}/servers/?${UTM}`;

export class InputError extends Error {}
export class UpstreamError extends Error {}

export interface Prices {
  effective: string;
  stamped_letter: Record<string, number>; // weight not over (oz) -> price
  metered_letter: Record<string, number>;
  large_envelope: Record<string, number>;
  postcard: number;
  nonmachinable_surcharge: number;
  intl_letter: Record<'canada' | 'mexico' | 'other', Record<string, number>>;
  intl_postcard: Record<'canada' | 'mexico' | 'other', number>;
  intl_nonmachinable_surcharge: number;
  flat_rate: Record<string, number>;
}

export const FLAT_RATE_SKU: Record<string, [string, string]> = {
  priority_mail_flat_rate_envelope: ['DPFE0XXXXR00700', 'Priority Mail Flat Rate Envelope'],
  priority_mail_legal_flat_rate_envelope: ['DPFE1XXXXR00700', 'Priority Mail Legal Flat Rate Envelope'],
  priority_mail_padded_flat_rate_envelope: ['DPFE2XXXXR00700', 'Priority Mail Padded Flat Rate Envelope'],
  priority_mail_small_flat_rate_box: ['DPFB2XXXXR00700', 'Priority Mail Small Flat Rate Box'],
  priority_mail_medium_flat_rate_box: ['DPFB1XXXXR00700', 'Priority Mail Medium Flat Rate Box'],
  priority_mail_large_flat_rate_box: ['DPFB0XXXXR00700', 'Priority Mail Large Flat Rate Box'],
  priority_mail_apo_fpo_dpo_large_flat_rate_box: ['DPFB3XXXXR00700', 'Priority Mail APO/FPO/DPO Large Flat Rate Box'],
  priority_mail_express_flat_rate_envelope: ['DEFE0XXXXR00700', 'Priority Mail Express Flat Rate Envelope'],
  priority_mail_express_legal_flat_rate_envelope: ['DEFE1XXXXR00700', 'Priority Mail Express Legal Flat Rate Envelope'],
  priority_mail_express_padded_flat_rate_envelope: ['DEFE2XXXXR00700', 'Priority Mail Express Padded Flat Rate Envelope'],
};

const LETTER_OZ = ['1', '2', '3', '3.5'];
const FLAT_OZ = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
const ozCode = (oz: string) => String(Math.round(Number(oz) * 10)).padStart(3, '0');

function skuMap(slice: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of slice.matchAll(/data-content='([A-Z0-9]{15})'>\$?([0-9]+(?:\.[0-9]+)?)</g)) if (!m.has(x[1])) m.set(x[1], Number(x[2]));
  return m;
}
function around(html: string, needle: string, before: number, after: number): string {
  const i = html.indexOf(needle);
  if (i < 0) throw new UpstreamError(`USPS Notice 123 no longer has the price cell ${needle.replace(/.*'(\w+)'.*/, '$1')}`);
  return html.slice(Math.max(0, i - before), i + after);
}
const must = (m: Map<string, number>, sku: string) => {
  const v = m.get(sku);
  if (v === undefined) throw new UpstreamError(`USPS Notice 123 has no price for SKU ${sku}`);
  return v;
};

/** The retail international postcard table: Canada, Mexico, All other countries, in that order. */
function intlPostcards(html: string): Prices['intl_postcard'] {
  const seg = around(html, "data-content='IFXC0XXXXR01035'", 400, 1200);
  const tbl = seg.slice(0, seg.indexOf('</table>') > 0 ? seg.indexOf('</table>') : seg.length);
  const v = [...tbl.matchAll(/>\$?([0-9]+\.[0-9]{2})<\/span>/g)].map((m) => Number(m[1]));
  if (!/Canada[\s\S]*Mexico[\s\S]*All other countries/.test(tbl) || v.length < 3) throw new UpstreamError('the Notice 123 international postcard table was not recognised');
  return { canada: v[0], mexico: v[1], other: v[2] };
}

/** Parse USPS Notice 123 (pe.usps.com). Throws UpstreamError when a needed price cell is missing. */
export function parseNotice123(html: string): Prices {
  const eff = /Notice 123\s*(?:•|&bull;|&#8226;)?\s*Effective\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(html.slice(0, 60000));
  if (!eff) throw new UpstreamError('the page is not USPS Notice 123 (no effective date)');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const mo = months.indexOf(eff[1]) + 1;
  if (!mo) throw new UpstreamError('the Notice 123 effective date was not recognised');
  const effective = `${eff[3]}-${String(mo).padStart(2, '0')}-${eff[2].padStart(2, '0')}`;

  const dom = skuMap(around(html, "data-content='DFXL0XXXXR00010'", 200, 12000));
  const flat = skuMap(around(html, "data-content='DPFE0XXXXR00700'", 3000, 6000));
  const intl = skuMap(around(html, "data-content='IFXL0XXXXR01010'", 200, 4000));

  const table = (m: Map<string, number>, prefix: string, ozs: string[]) => Object.fromEntries(ozs.map((oz) => [oz, must(m, `${prefix}${ozCode(oz)}`)]));
  const intlTable = (g: string) => Object.fromEntries(LETTER_OZ.map((oz) => [oz, must(intl, `IFXL0XXXXR${g}${ozCode(oz)}`)]));
  return {
    effective,
    stamped_letter: table(dom, 'DFXL0XXXXR00', LETTER_OZ),
    metered_letter: table(dom, 'DFLL0XXXXR00', LETTER_OZ),
    large_envelope: table(dom, 'DFXF0XXXXR00', FLAT_OZ),
    postcard: must(dom, 'DFXC0XXXXR00035'),
    nonmachinable_surcharge: must(dom, 'DX1F0XXLXRX0000'),
    intl_letter: { canada: intlTable('01'), mexico: intlTable('02'), other: intlTable('03') },
    intl_postcard: intlPostcards(html),
    intl_nonmachinable_surcharge: must(intl, 'IX1F0XXLXRX0000'),
    flat_rate: Object.fromEntries(Object.entries(FLAT_RATE_SKU).map(([k, [sku]]) => [k, must(flat, sku)])),
  };
}

export async function loadPrices(fetchText: FetchText): Promise<Prices> {
  return parseNotice123(await fetchText(NOTICE_123, { cacheTtl: 21600, timeoutMs: 15000, accept: 'text/html,*/*' }));
}

// ---------------------------------------------------------------- tools

const usd = (n: number) => `$${n.toFixed(2)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pretty = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const NOTE_INTL = 'International letter prices are the same for every country outside Canada and Mexico at these weights (USPS price groups 3 to 9).';

export async function getStampPrice(fetchText: FetchText) {
  const p = await loadPrices(fetchText);
  const forever = p.stamped_letter['1'];
  const extra = r2(p.stamped_letter['2'] - p.stamped_letter['1']);
  return {
    summary:
      `A Forever stamp (First-Class Mail, 1 oz letter) costs ${usd(forever)} under the USPS price list effective ${pretty(p.effective)}. ` +
      `Each extra ounce adds ${usd(extra)} (2 oz ${usd(p.stamped_letter['2'])}, 3 oz ${usd(p.stamped_letter['3'])}, 3.5 oz ${usd(p.stamped_letter['3.5'])}). ` +
      `A postcard stamp is ${usd(p.postcard)}, a 1 oz large envelope ${usd(p.large_envelope['1'])}, and an international 1 oz letter or Global Forever stamp ${usd(p.intl_letter.other['1'])}. ` +
      `Square or rigid letters add a ${usd(p.nonmachinable_surcharge)} nonmachinable surcharge.`,
    effective_date: p.effective,
    forever_stamp_price: forever,
    additional_ounce: extra,
    stamped_letter_by_weight_oz: p.stamped_letter,
    metered_letter_by_weight_oz: p.metered_letter,
    postcard: p.postcard,
    large_envelope_1_oz: p.large_envelope['1'],
    nonmachinable_surcharge: p.nonmachinable_surcharge,
    international_letter_1_oz: p.intl_letter.other['1'],
    international_postcard: p.intl_postcard.other,
    note: 'A Forever stamp is always worth the current 1 oz First-Class Mail letter price, even if it was bought at a lower price. USPS usually changes prices in January and July.',
    as_of: new Date().toISOString(),
    source: NOTICE_123,
    more: more(),
  };
}

type Kind = 'letter' | 'postcard' | 'large_envelope';
type Dest = 'us' | 'canada' | 'mexico' | 'other';

export function destOf(s?: string): Dest {
  const v = (s ?? 'us').trim().toLowerCase();
  if (['us', 'usa', 'united states', 'domestic', 'u.s.', ''].includes(v)) return 'us';
  if (v === 'canada') return 'canada';
  if (v === 'mexico') return 'mexico';
  if (/^(international|other|world|abroad)$/.test(v) || v.length > 1) return 'other';
  throw new InputError('destination is "US", "Canada", "Mexico" or another country name.');
}

export async function calculateLetterPostage(fetchText: FetchText, a: { weight_oz?: number; type?: Kind; destination?: string; nonmachinable?: boolean; quantity?: number }) {
  const p = await loadPrices(fetchText);
  const type: Kind = a.type ?? 'letter';
  const w = a.weight_oz ?? 1;
  const qty = a.quantity ?? 1;
  if (!(w > 0)) throw new InputError('weight_oz must be more than 0.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new InputError('quantity is a whole number from 1 to 10,000.');
  const dest = destOf(a.destination);
  let price: number, bracket: string, label: string;
  const pick = (t: Record<string, number>, max: string, what: string) => {
    const k = Object.keys(t).map(Number).sort((x, y) => x - y).find((oz) => w <= oz);
    if (k === undefined) throw new InputError(`${what} can weigh up to ${max} oz. Heavier pieces go as a ${type === 'letter' ? 'large envelope (flat)' : 'package'}.`);
    return [t[String(k)], String(k)] as const;
  };
  if (type === 'postcard') {
    if (w > 1) throw new InputError('A postcard is a single card; use type "letter" for anything heavier.');
    price = dest === 'us' ? p.postcard : p.intl_postcard[dest]; bracket = 'postcard'; label = dest === 'us' ? 'First-Class Mail postcard' : 'First-Class Mail International postcard';
  } else if (type === 'large_envelope') {
    if (dest !== 'us') throw new InputError('International large envelope prices are not covered yet; use the USPS price calculator https://postcalc.usps.com/.');
    [price, bracket] = pick(p.large_envelope, '13', 'A First-Class Mail large envelope'); label = 'First-Class Mail large envelope (flat)';
  } else {
    [price, bracket] = pick(dest === 'us' ? p.stamped_letter : p.intl_letter[dest], '3.5', 'A letter');
    label = dest === 'us' ? 'First-Class Mail stamped letter' : 'First-Class Mail International letter';
  }
  const surcharge = a.nonmachinable && type === 'letter' ? (dest === 'us' ? p.nonmachinable_surcharge : p.intl_nonmachinable_surcharge) : 0;
  const each = r2(price + surcharge);
  const forever = p.stamped_letter['1'];
  const stamps = Math.ceil(each / forever - 1e-9);
  const where = dest === 'us' ? 'in the US' : dest === 'other' ? `to ${a.destination}` : `to ${dest[0].toUpperCase()}${dest.slice(1)}`;
  return {
    summary:
      `${type === 'postcard' ? `A ${label}` : `A ${w} oz ${label}`} ${where} costs ${usd(each)}${surcharge ? ` (${usd(price)} plus the ${usd(surcharge)} nonmachinable surcharge)` : ''}` +
      `${qty > 1 ? `, so ${qty} of them cost ${usd(r2(each * qty))}` : ''}. ` +
      `With Forever stamps only (${usd(forever)} each) that is ${stamps} stamp${stamps > 1 ? 's' : ''} per piece${stamps * forever > each + 1e-9 ? `, overpaying ${usd(r2(stamps * forever - each))}` : ''}.` +
      (dest !== 'us' && each === p.intl_letter.other['1'] ? ` One Global Forever stamp (${usd(p.intl_letter.other['1'])}) covers it exactly.` : '') +
      ` Prices effective ${pretty(p.effective)}.`,
    type, destination: dest, weight_oz: w, weight_bracket_oz: bracket, price_each: each, base_price: price, nonmachinable_surcharge: surcharge,
    quantity: qty, total: r2(each * qty), forever_stamp_price: forever, forever_stamps_needed_each: stamps,
    note: dest === 'other' || dest === 'canada' || dest === 'mexico' ? NOTE_INTL : 'Letters over 3.5 oz or more than 1/4 inch thick go at large envelope prices. Square, rigid or lumpy letters pay the nonmachinable surcharge.',
    effective_date: p.effective, as_of: new Date().toISOString(), source: NOTICE_123, more: more(),
  };
}

export async function getFlatRatePrices(fetchText: FetchText) {
  const p = await loadPrices(fetchText);
  const rows = Object.entries(FLAT_RATE_SKU).map(([k, [, name]]) => ({ product: k, name, retail_price: p.flat_rate[k] }));
  const g = (k: string) => usd(p.flat_rate[k]);
  return {
    summary:
      `USPS retail flat rate prices effective ${pretty(p.effective)}: Priority Mail Flat Rate Envelope ${g('priority_mail_flat_rate_envelope')}, Small Flat Rate Box ${g('priority_mail_small_flat_rate_box')}, ` +
      `Medium Flat Rate Box ${g('priority_mail_medium_flat_rate_box')}, Large Flat Rate Box ${g('priority_mail_large_flat_rate_box')} (${g('priority_mail_apo_fpo_dpo_large_flat_rate_box')} to APO/FPO/DPO), ` +
      `Priority Mail Express Flat Rate Envelope ${g('priority_mail_express_flat_rate_envelope')}.`,
    effective_date: p.effective,
    flat_rate: rows,
    note: 'Retail prices at a Post Office. Click-N-Ship and commercial prices are often lower. Flat rate items ship anywhere in the US up to 70 lbs.',
    as_of: new Date().toISOString(),
    source: NOTICE_123,
    more: more(),
  };
}
