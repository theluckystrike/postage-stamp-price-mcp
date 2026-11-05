# postage-stamp-price-mcp

How much is a stamp, for AI assistants. Ask what a Forever stamp costs, what it takes to mail 40 square holiday cards, or what a letter to Germany costs, and get the current USPS price with its effective date.

This is a Model Context Protocol (MCP) server. It reads USPS Notice 123, the official retail price list on Postal Explorer, at call time. Prices are matched by the USPS SKU on each price cell. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_stamp_price` | The current Forever stamp price (1 oz First-Class Mail letter), 2, 3 and 3.5 oz prices, metered prices, postcard, 1 oz large envelope, nonmachinable surcharge and the 1 oz international letter (Global Forever) price, with the effective date. |
| `calculate_letter_postage` | Postage for a letter, postcard or large envelope by weight, to the US, Canada, Mexico or another country, with the nonmachinable surcharge, a total for a quantity and the number of Forever stamps per piece. |
| `get_flat_rate_prices` | Retail Priority Mail and Priority Mail Express flat rate envelope and box prices. |

Every result has structured JSON, a one-paragraph summary, `as_of`, `source` and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=postage-stamp-price-mcp)).

## What it knows that your model does not

- The price in force today. USPS changes prices once or twice a year, so a remembered stamp price is often wrong.
- The effective date of the price list, so the answer can say when the price started.
- Surcharges and weight steps, so "two stamps or one?" has an exact answer.

## Install

### Hosted (Claude.ai custom connector, ChatGPT developer mode)

Paste this URL. No token, no sign-up. It works now.

```
https://postage-stamp-price-mcp.lipmichal.workers.dev/mcp
```

### Claude Code

```
claude mcp add --transport http stamp-price https://postage-stamp-price-mcp.lipmichal.workers.dev/mcp
```

### Claude Desktop

Claude Desktop adds remote servers under Settings, Connectors, Add custom connector. Paste the URL above.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stamp-price": { "url": "https://postage-stamp-price-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "stamp-price": { "type": "http", "url": "https://postage-stamp-price-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio (after npm release)

The npm package is not published yet. After it is, run it locally with Node 20 or newer:

```
claude mcp add stamp-price -- npx -y postage-stamp-price-mcp
```

## Example prompts

- "How much is a stamp right now?"
- "How much postage do I need for 40 square Christmas cards that weigh 1.2 oz?"
- "How much does it cost to mail a letter to Germany?"
- "How much is a medium flat rate box?"
- "How much is a postcard stamp?"

## Data sources

Full list with fetch dates in [DATA_SOURCES.md](DATA_SOURCES.md).

- [USPS Notice 123 Price List](https://pe.usps.com/text/dmm300/Notice123.htm), read at call time.

## Limitations

- Retail prices at the Post Office. Commercial, metered and Click-N-Ship prices can be lower; metered letter prices are included.
- Packages (Ground Advantage, Priority Mail by zone) are not covered beyond flat rate. Use https://postcalc.usps.com/ for those.
- International large envelopes are not covered yet.
- The hosted server caches the price list for up to 6 hours.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=postage-stamp-price-mcp).

Part of the Zovo MCP collection: https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

## License

MIT
