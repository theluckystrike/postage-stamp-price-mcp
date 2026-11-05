# Data sources

All sources below were fetched on 2026-11-06 while building version 1.0.0.

| Data | URL | Notes |
|---|---|---|
| Retail price list | https://pe.usps.com/text/dmm300/Notice123.htm | "Notice 123 • Effective October 04, 2026". Stamped letter 1 oz $0.82, 2 oz 1.11, 3 oz 1.40, 3.5 oz 1.69; metered 1 oz $0.78; postcard $0.65; large envelope 1 oz $1.69; nonmachinable surcharge $0.49; First-Class Mail International letter 1 oz $1.75; flat rate envelope $13.90, small box $14.65, medium $25.80, large $36.10. Read at call time, cached 6 hours. |
| Cross-check | https://www.usps.com/ship/first-class-mail.htm | "Forever stamps cost $0.82 (the current 1 oz price)", postcards $0.65, large envelopes $1.69, square envelopes $1.31. |
| Cross-check | https://www.usps.com/business/prices.htm | Letter stamps from $0.82, postcard stamps from $0.65, Global Forever from $1.75, Priority Mail Flat Rate Envelope $13.90, Priority Mail Express Flat Rate Envelope $38.25. |

The test fixture in `test/fixtures/` is Notice 123 downloaded on 2026-11-06 (gzip).
