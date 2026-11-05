// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, calculateLetterPostage, getFlatRatePrices, getStampPrice } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const TOOL_INFO = [
  { name: 'get_stamp_price', blurb: 'How much is a stamp right now: the Forever stamp price, extra ounce, postcard, large envelope, nonmachinable surcharge and international (Global Forever) price, with the effective date.' },
  { name: 'calculate_letter_postage', blurb: 'Postage for a letter, postcard or large envelope by weight, in the US or abroad, for one piece or a stack of holiday cards, and how many Forever stamps it takes.' },
  { name: 'get_flat_rate_prices', blurb: 'Retail Priority Mail and Priority Mail Express flat rate envelope and box prices.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream USPS error'}: ${msg}` }] };
}
const wrap = <A>(f: (a: A) => unknown) => async (a: A) => { try { return ok((await f(a)) as any); } catch (e) { return fail(e); } };

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Current USPS retail postage prices read at call time from USPS Notice 123, the official price list on pe.usps.com. A model\'s remembered stamp price is often out of date because USPS changes prices once or twice a year. ' +
      'Use get_stamp_price for "how much is a stamp" and give the effective date.',
  });

  server.registerTool('get_stamp_price', {
    title: 'Get stamp price',
    description:
      'The current USPS Forever stamp price (First-Class Mail 1 oz stamped letter), the 2, 3 and 3.5 oz prices, metered letter prices, postcard, 1 oz large envelope, the nonmachinable surcharge and the 1 oz international letter (Global Forever) price, ' +
      'read at call time from USPS Notice 123 with its effective date.',
    inputSchema: {},
    annotations: { title: 'How much is a stamp', ...RO },
  }, wrap(() => getStampPrice(fetchText)));

  server.registerTool('calculate_letter_postage', {
    title: 'Calculate letter postage',
    description:
      'Retail postage for one letter, postcard or large envelope (flat) by weight, to the US, Canada, Mexico or any other country, with the nonmachinable surcharge for square or rigid cards, the total for a quantity, and the number of Forever stamps per piece. ' +
      'Letters up to 3.5 oz, US large envelopes up to 13 oz.',
    inputSchema: {
      weight_oz: z.number().gt(0).max(16).optional().describe('Weight in ounces. Default 1.'),
      type: z.enum(['letter', 'postcard', 'large_envelope']).optional().describe('Default "letter".'),
      destination: z.string().max(60).optional().describe('"US" (default), "Canada", "Mexico" or another country name.'),
      nonmachinable: z.boolean().optional().describe('True for square, rigid, lumpy or vertical letters and cards (adds the surcharge).'),
      quantity: z.number().int().min(1).max(10000).optional().describe('Number of identical pieces, for example 40 holiday cards. Default 1.'),
    },
    annotations: { title: 'Letter postage', ...RO },
  }, wrap((a: any) => calculateLetterPostage(fetchText, a)));

  server.registerTool('get_flat_rate_prices', {
    title: 'Get flat rate box prices',
    description: 'Current USPS retail prices for Priority Mail Flat Rate envelopes and Small, Medium, Large and APO/FPO/DPO Flat Rate Boxes, and Priority Mail Express Flat Rate envelopes, from Notice 123.',
    inputSchema: {},
    annotations: { title: 'Flat rate prices', ...RO },
  }, wrap(() => getFlatRatePrices(fetchText)));

  return server;
}
