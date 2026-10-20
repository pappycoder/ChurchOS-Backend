# USD subscription pricing and payment currencies

> October 20 update: new subscription payments support Flutterwave only.
> Paystack collection settings below are historical and cannot enable new
> subscription checkouts. See [Flutterwave checkout fix](FLUTTERWAVE-SUBSCRIPTION-CHECKOUT-2026-10-20.md).

## Catalog and rounding

| Plan | Monthly USD | Annual USD | Members / staff / locations |
| --- | ---: | ---: | --- |
| Essentials | 10 | 108 | 100 / 2 / 1 |
| Community | 20 | 216 | 300 / 5 / 1 |
| Network | 40 | 432 | 1,500 / 15 / 3 |
| Enterprise | Negotiated | Negotiated | Explicit agreed limits |

Annual prices retain the 10% USD discount. The backend owns the catalog; the web
has matching USD display defaults for availability without a conversion service.
Public pricing, plan details, registration, review and Plan & Billing all share a
persistent currency preference. Conversion is `ceil(USD price × rate)` to the next
whole local currency unit, using decimal arithmetic. Annual totals are converted
once; annual cards show the actual full-year amount. Currency rounding can make
the final local annual discount differ slightly from 10%.

USD, NGN, EUR, GBP, CAD, GHS, KES, ZAR, UGX, XAF and XOF are available for display.
An unsupported charge currency is never silently substituted: checkout separately
shows its available payment currencies and the exact amount the gateway charges.
Existing payment amounts and currencies are retained, including legacy NGN
payments and hosted checkout links. Historical payments are never re-converted.

## Quotes, settlement and access

1. `GET /pricing/subscriptions?currency=NGN` is a public rate-limited endpoint
   returning converted plan prices, without church data or a raw FX feed. It is
   usable with no session and with an expired browser session.
2. `POST /billing/quote` requires administrator billing access and accepts plan,
   cycle, gateway and currency. The server stores an opaque church-bound quote in
   Redis for 15 minutes. It includes the USD amount, conversion rate/date, exact
   rounded charge, expiry and baseline subscription version.
3. New checkout requires that quote ID and matching choices. Under the church
   lock, the baseline and current transition are rechecked. The ledger stores the
   immutable quote snapshot and its ID. A different pending quote from another tab
   causes a conflict, never a silent change to the reviewed price.
4. Once a gateway checkout exists, its stored amount/currency stay fixed even if
   the original quote expires. The administrator reviews the pending amount before
   resuming; another new quote cannot replace it.
5. Providers receive the stored currency explicitly. Paystack uses minor units;
   Flutterwave receives the major-unit amount. Giving and church-owned payment
   integrations keep their existing NGN defaults.
6. Verification and signed webhooks compare the received reference, exact amount
   and currency with the ledger. They do not fetch another FX rate. Duplicate and
   stale successful payments retain the existing idempotency/review rules.

Immediate upgrade proration uses the USD catalog difference for the remaining
period, then converts and rounds once. Renewal preferences, manual renewal,
allowances and expiry behavior are unchanged. No automatic renewal is introduced.

## FX service

The free open ExchangeRate-API endpoint (`https://open.er-api.com/v6/latest/USD`)
is called only from the backend. Validated daily rates are shared in Redis until
the next update (with a minimum one-hour fetch interval); timestamps over 48 hours
old, invalid rates and provider errors cannot create a local-currency quote. USD
prices need no FX request. A Redis read or write failure falls back to validated
provider rates cached in the API process until the same expiry. Concurrent currency
requests share one fetch. Shared-cache data is validated before use; invalid,
future-dated, expired or stale rates are never used. This fallback supports price
conversion during cache outages; Redis is still required to lock all payment quotes.
The UI links attribution on pages using the rates. The public API returns prices
rather than redistributing the raw provider rate dictionary.

Local troubleshooting: `REDIS_URL=redis://localhost:6379` requires a running Redis
service. With Docker available, run `docker compose up -d redis` from the backend
directory. An offline Redis previously prevented every non-USD conversion before
the API even requested rates. Restart the API after updating the conversion code.

Official source: https://www.exchangerate-api.com/docs/free

## Deployment

Apply migration `20261019160000_subscription_usd_pricing`, then deploy API/workers
and web together. It adds `pricing_snapshot` and broadens the ledger currency
constraint; it does not rewrite any historical row or change allowances.

Configure these **platform merchant** currency allowlists only after the payment
provider approves collections in those currencies:

```
SUBSCRIPTION_PAYSTACK_CURRENCIES=NGN
SUBSCRIPTION_FLUTTERWAVE_CURRENCIES=NGN
```

For an approved USD account, use `NGN,USD`. Flutterwave can also list the supported
display currencies approved on that account. Paystack's allowed set is NGN, USD,
GHS, KES and ZAR, with actual availability depending on merchant country/account.
Defaults preserve the current NGN merchant setup and do not claim USD enablement.
Never enable currencies based only on a user's display choice.

Paystack's USD collection/settlement requirements:
https://support.paystack.com/en/articles/2130690
Flutterwave's supported card currencies:
https://flutterwave.com/us/support/general/what-are-the-currencies-accepted-on-flutterwave

No live payment, rate-provider acceptance call, migration or deployment is part of
the automated checks. Production acceptance should cover a real quoted amount in
each enabled merchant currency and confirm that callback settlement matches it.

## Validation

- Backend production build and TypeScript checks passed.
- Backend unit suite: 85 suites / 1,530 tests passed.
- Web unit suite: 14 files / 311 tests passed.
- Local database integration: 16 tests passed, covering checkout concurrency,
  reference/currency/amount reconciliation, callbacks, ACLs and entitlements.
- Browser checks: 19 pricing/currency/billing tests and 17 onboarding/recovery tests
  passed with mocked services. A 390px converted-price payment screen was inspected.
- Targeted lint passed; the existing billing unit-test file retains four `any`
  warnings and no errors.
