# Business model (BDT)

> **How to read this document.** The product facts (plans, limits, what is enforced) come from the code. The **financial figures are a model built on assumptions**, not forecasts or measurements: nothing here has been validated with real customers, and the capacity of one server has not been load-tested. Every assumption is listed in §9 and lives in one place, `docs/business_model.py`. Change a number there, rerun it, and the tables below regenerate.

---

## 1. Summary

Zipli is a freemium URL shortener with real-time click analytics, sold to a general audience (creators, marketers, small businesses, developers). Visitors shorten links for free with no account; accounts add link management and analytics; paid plans raise link and analytics-history limits.

- **Revenue:** monthly or annual subscriptions in ৳ (Pro ৳499, Business ৳1,999) plus custom Enterprise contracts.
- **Costs are small and mostly fixed.** One 8 GB server runs the whole stack, so infrastructure is roughly ৳9,000 a month in this model. That makes the business **limited by customer acquisition and trust, not by hosting cost**.
- **Break-even on infrastructure alone is about 17–23 paying customers.** Covering infrastructure plus one salary (৳60,000/month, assumed) takes about 126–171 paying customers.
- **The biggest risks** are not financial: abuse (phishing and spam through a free shortener), free-to-paid conversion, and payment friction in Bangladesh. See §8.

---

## 2. Who it is for

General audience, with four natural segments (no single one is assumed to dominate):

| Segment | What they want | Likely plan |
|---|---|---|
| Creators and freelancers | Clean links for bios and posts, to see which post drives clicks | Free → Pro |
| Marketers and small businesses | Campaign links, QR codes for print and packaging, referrer and device data | Pro → Business |
| Developers and agencies | Many links, reliable redirects, later an API | Business |
| Platforms / high-volume senders | Millions of redirects, SLA, data export | Enterprise |

**Why people would choose this:** fast redirects, honest analytics, a free tier that works without sign-up, and prices set in ৳ with local payment methods (once billing is live).

I did not research competitor prices for this document. Before launch, compare the tiers against the shorteners your target users already use, and adjust.

---

## 3. Plans and pricing

Prices are per month, **VAT-inclusive** (the model nets VAT out; see §9).

| | **Free** | **Pro** | **Business** | **Enterprise** |
|---|---|---|---|---|
| Price | ৳0 | **৳499** | **৳1,999** | Custom (modelled at ৳20,000) |
| Short links | 25 | 1,000 | 10,000 | Unlimited |
| Analytics history | 7 days | 90 days | 1 year | 1 year |
| Custom aliases, expiry, QR codes | ✔ | ✔ | ✔ | ✔ |
| Referrer / device / country stats | ✔ | ✔ | ✔ | ✔ |
| Support | – | Email | Priority | SLA + onboarding |
| Custom branded domain | – | – | *soon* | *soon* |
| Team seats | – | – | *soon* | *soon* |
| Data export to your warehouse | – | – | – | *soon* |
| Annual billing | – | 2 months free | 2 months free | Contract |

Guests (no account) get a 7-day link with no analytics, rate-limited, as the top of the funnel.

**What is enforced in the product today** (verified): link limits per plan (HTTP 402 over the limit), analytics history per plan (the API clamps the requested window; a Free user asking for 90 days gets 7; ClickHouse also deletes data older than 365 days), guest expiry and rate limit. **Not built yet:** billing/checkout, custom domains, team seats, data export. Those are marked "soon" on the pricing page. Support tiers are an operational promise, not software.

**Pricing logic.** Free is generous enough to be useful (25 links) but its 7-day history is the natural reason to upgrade once a link starts to matter. Pro is priced around a few US dollars (roughly ৳499 ≈ US$4 at ৳123/US$) so a freelancer can pay without a second thought. Business is priced for a team that runs campaigns and needs a year of history. Annual billing (pay for 10 months, get 12) improves cash flow and lowers churn.

---

## 4. Revenue streams

1. **Subscriptions (core):** Pro and Business, monthly or annual.
2. **Enterprise contracts:** custom price for volume, SLA, onboarding. Modelled at ৳20,000/month; real deals will vary widely.
3. **Add-ons (hypotheses, not in the numbers):** extra branded domains (e.g. ৳299/month each), extra link packs, API access for developers. Add them only after customers ask.
4. **Not recommended:** ads or interstitial pages on redirects. They slow the one thing the product is for, and they harm trust.

---

## 5. Cost structure

| Cost | Behaviour | Modelled |
|---|---|---|
| Infrastructure (server, backups, monitoring, domain) | Mostly fixed; steps up with traffic | ৳9,125/month at launch scale |
| Payment gateway | ~2.5% of money collected | 2.5% |
| VAT | Collected for the government, not revenue | 15% of the VAT-inclusive price (confirm) |
| People | Founder time is unpaid in the base case | One salary shown separately (৳60,000/month) |

**Not modelled, and should be:** one-time payment-gateway setup fees (reported at roughly ৳15,000–25,500, sources conflict), refunds and chargebacks, support tooling, legal and accounting, income tax, marketing spend beyond the CAC assumption, and currency risk on dollar-priced hosting.

Variable cost per customer is close to zero: a stored click is a few dozen bytes in ClickHouse, and links are tiny rows. Server capacity (how many redirects per second one 8 GB machine really serves) is **unmeasured**; run the planned k6 load test and update the infrastructure assumption with real numbers.

---

## 6. Financial model

All figures are in ৳ per month in a steady-state month around month 12. Generated by `docs/business_model.py`.

| | Conservative | Base | Optimistic |
|---|---:|---:|---:|
| Registered users | 2,000 | 10,000 | 40,000 |
| Paying customers | 40 | 300 | 1,600 |
|   of which Pro / Business | 36 / 4 | 264 / 36 | 1360 / 240 |
| Enterprise contracts | 0 | 1 | 3 |
| Collected from subscribers (incl. VAT) | ৳24,878 | ৳195,212 | ৳1,110,133 |
| **Net revenue** (ex-VAT, incl. Enterprise) | **৳21,633** | **৳189,750** | **৳1,025,333** |
| Payment gateway fees | −৳622 | −৳4,880 | −৳27,753 |
| Infrastructure | −৳9,125 | −৳9,125 | −৳16,125 |
| **Profit before salaries** | **৳11,886** | **৳175,745** | **৳981,455** |
| Team cost (৳60,000) | −৳60,000 | −৳60,000 | −৳60,000 |
| **Profit after one salary** | **−৳48,114** | **৳115,745** | **৳921,455** |

### Break-even (paying customers needed per month)

| Cost to cover | Pro-only | Base mix (88% Pro / 12% Business) |
|---|---:|---:|
| Infrastructure only (৳9,125) | 23 | 17 |
| Infra + one salary (৳69,125) | 171 | 126 |

### Unit economics per paying customer

| | Pro | Business |
|---|---:|---:|
| Avg collected / month (after annual discount) | ৳478 | ৳1,916 |
| Kept after VAT + gateway fee / month | ৳404 | ৳1,618 |
| Lifetime value (kept ÷ monthly churn) | ৳8,078 | ৳53,931 |
| CAC payback (months) | 2.0 | 2.5 |
| LTV : CAC | 10.1 : 1 | 13.5 : 1 |
| Assumed monthly churn | 5% | 3% |
| Assumed CAC | ৳800 | ৳4,000 |

### Sensitivity: Base scenario profit before salaries

| Registered users → | 2,000 | 5,000 | 10,000 | 20,000 | 40,000 |
|---|---:|---:|---:|---:|---:|
| 1% paid | ৳1,381 | ৳18,353 | ৳45,832 | ৳93,788 | ৳203,701 |
| 2% paid | ৳13,100 | ৳45,832 | ৳100,788 | ৳203,701 | ৳423,528 |
| 3% paid | ৳23,606 | ৳73,310 | ৳155,745 | ৳313,614 | ৳643,354 |
| 4% paid | ৳35,326 | ৳100,788 | ৳210,701 | ৳423,528 | ৳863,180 |
| 5% paid | ৳45,832 | ৳128,266 | ৳265,658 | ৳533,441 | ৳1,083,006 |

### Infrastructure cost lines (assumed)

| Item | ৳/month |
|---|---:|
| 8 GB Singapore VPS | ৳7,000 |
| Off-site backups + monitoring | ৳1,000 |
| Domain (amortised) | ৳125 |
| Misc / email reserve | ৳1,000 |
| **Stage 1 total** | **৳9,125** |
| Stage 1 + second server (headroom) | ৳16,125 |
| Stage 2 (managed services, HA) | ৳60,000 |

Kept per BDT collected: 0.8446 (after 15% VAT and 2.5% gateway fee). Annual-billing blend factor: 0.9583.


### What the numbers say

- **Hosting is not the constraint.** Even the conservative case covers infrastructure; the base case brings in about 21× its infrastructure bill in net revenue.
- **Conversion drives everything.** Moving paid conversion from 2% to 4% at least doubles profit at every scale (see the sensitivity table). A conversion rate of 2–4% of registered users is a typical freemium assumption, **not something measured for this product**.
- **One Enterprise deal matters.** The base case includes one ৳20,000 contract, about a tenth of net revenue. Without it the base profit before salaries is about ৳156,000.
- **The conservative case does not cover a salary.** At 2,000 registered users and 2% paying, the business stays a side project until it reaches roughly 130–170 paying customers.
- **Payback looks fast, but CAC and churn are guesses.** Treat the LTV:CAC ratios as a template to fill in with real data, not a result.

---

## 7. Payments in Bangladesh

Plan three payment options, in this order of effort:

1. **SSLCommerz (cards + bKash + Nagad + Rocket in one hosted checkout).** Reported fees are about 2.5% for cards and 1.85–2.5% for wallets, with a one-time setup fee; sources disagree, so get SSLCommerz's current rate card and setup terms in writing. This is the first integration to build.
2. **bKash / Nagad direct merchant APIs.** Reported to be cheaper per transaction (roughly 1–2%) but need merchant onboarding. Add once volume justifies it.
3. **Manual bank transfer / invoice for Enterprise.**

**Recurring billing caveat.** Confirm with each provider whether true auto-renewal (a saved agreement or token) is available to you. If it is not, sell **prepaid periods** (1 month, 3 months, 12 months): the customer pays, the plan is valid until the end date, and the app reminds them before expiry. This also fits the annual-discount design. I have not verified provider recurring-payment support.

**Engineering needed** (none of this exists yet):
- `subscriptions` and `payments` tables (plan, period start/end, provider, transaction id, amount, status).
- A checkout endpoint that creates a payment session, and a **server-side webhook/IPN handler that verifies the payment with the provider before changing a plan** (never trust the browser redirect).
- A job that downgrades expired plans to Free and emails reminders (plus an email provider).
- VAT-correct invoices/receipts.
- Replace the manual `UPDATE users SET plan=…` used today.

---

## 8. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Abuse: phishing and spam links** | Free anonymous shortening is the classic abuse vector; domains get blocklisted and the product dies | Before public launch: URL reputation checks (e.g. Google Safe Browsing), report/takedown page, stricter guest limits or require sign-up for non-trivial volume, delete flagged links fast |
| Low free-to-paid conversion | Revenue assumes 2–4% | Make the 7-day limit visible in the dashboard, show what longer history reveals, test pricing early |
| Payment friction | Many local users lack international cards | Lead with bKash/Nagad via SSLCommerz, prepaid periods |
| Capacity unproven | The 8 GB server figure is untested | k6 load test; keep Stage 2 (managed services) cost in the plan |
| Single-node data services | One server failing means downtime | Off-site backups now; managed Postgres first when revenue allows |
| Price competition | Free shorteners exist | Compete on speed, analytics clarity, local payment, and trust |
| Regulation and tax | VAT, data protection, content rules | Take local legal and accounting advice before charging |

---

## 9. Assumptions to verify

| Assumption | Value used | Evidence / status |
|---|---|---|
| USD→BDT | ৳123 | Sources show about 122–123.4 but are several months old: [Pluang](https://pluang.com/en/tools/currency-converter/usd-bdt), [CurrencyConvert](https://currencyconvert.online/usd/bdt), [Wise](https://wise.com/us/currency-converter/usd-to-bdt-rate). Check today's rate. |
| Gateway fee | 2.5% | Third-party figures only (cards ~2.5%, wallets 1.85–2.5%, some as low as 1.4%): [BUBT payment page](https://payment.bubt.edu.bd/), [bKash vs card](https://nokiamob.net/2026/04/13/bkash-vs-card-payments-what-works-better-for-bangladeshi-businesses/). Get SSLCommerz's official rate card. |
| Gateway setup fee | not modelled | Reports range ৳15,000–25,500. Confirm. |
| 8 GB Singapore server | ৳7,000/month | Third-party review cites roughly €49/month ([Bitdoze](https://www.bitdoze.com/hetzner-cloud-review/)); Hetzner pricing was not confirmed on its own site and prices changed in 2026. Check the provider's current price. |
| VAT | 15% of VAT-inclusive price | Standard Bangladesh rate as I understand it; **not verified**. Confirm applicability to your services with an accountant. |
| Conversion, mix, churn, CAC | 2–4%, 10–15% Business, 3–5%, ৳800–4,000 | Pure assumptions. Replace with measured values as soon as there are users. |
| Annual billing share | 25% | Assumption. |
| Enterprise price | ৳20,000/month | Assumption. |
| Team cost | ৳60,000/month | Assumption. |
| Server capacity | unmeasured | Requires the k6 load test. |

---

## 10. Milestones to revenue

1. **Make it safe to open:** abuse handling for guest links; Terms, Privacy and abuse-contact pages.
2. **Measure capacity:** k6 load test on the target server size; update the infrastructure line.
3. **Deploy** following `docs/DEPLOYMENT.md` with a real domain and HTTPS.
4. **Build billing** (§7): SSLCommerz checkout, verified webhook, expiry job, receipts.
5. **Soft launch** to a small audience; measure sign-ups, free-to-paid conversion, and what people actually use.
6. **Revisit prices** with real data and rerun `docs/business_model.py`.
7. **Then** custom domains and team seats (they unlock the Business tier's main selling points).

---

## Sources

- Exchange rate: [Pluang USD/BDT](https://pluang.com/en/tools/currency-converter/usd-bdt), [CurrencyConvert USD/BDT](https://currencyconvert.online/usd/bdt), [Wise USD/BDT](https://wise.com/us/currency-converter/usd-to-bdt-rate)
- Gateway fees: [BUBT payment methods](https://payment.bubt.edu.bd/), [bKash vs card payments](https://nokiamob.net/2026/04/13/bkash-vs-card-payments-what-works-better-for-bangladeshi-businesses/), [SSLCommerz](https://sslcommerz.com/?p=6233)
- Hosting price: [Bitdoze Hetzner review](https://www.bitdoze.com/hetzner-cloud-review/), [Hetzner Singapore](https://www.hetzner.com/cloud-singapore/)
