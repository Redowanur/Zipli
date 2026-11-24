#!/usr/bin/env python3
"""Zipli business model (BDT). Edit ASSUMPTIONS, run `python3 docs/business_model.py`.

Every figure marked ASSUMPTION is an estimate to verify, not a fact. Output is
Markdown, pasted into docs/BUSINESS_MODEL.md.
"""

# ---------------- ASSUMPTIONS (BDT unless noted) ----------------
FX = 123                 # ASSUMPTION: BDT per USD (sources ranged ~122-123.4, months old)

# List prices shown to customers, VAT-INCLUSIVE, per month.
P_PRO, P_BIZ = 499, 1999
P_ENT = 20_000           # ASSUMPTION: typical Enterprise contract, quoted ex-VAT
VAT = 0.15               # ASSUMPTION: Bangladesh standard VAT, confirm with an accountant
FEE = 0.025              # payment gateway fee on money collected (cards ~2.5%; wallets ~1.85-2.5%)
ANNUAL_SHARE = 0.25      # ASSUMPTION: share of paying customers on annual (10 months paid = 2 free)

# Monthly infrastructure cost
SERVER_8GB = 7_000       # ASSUMPTION: ~EUR49 Singapore 8GB VPS (third-party price), ~BDT 7k
BACKUP_MON = 1_000       # ASSUMPTION: off-site backups, uptime monitoring
DOMAIN = 125             # ASSUMPTION: ~USD12/yr domain
RESERVE = 1_000          # ASSUMPTION: email / misc tooling
STAGE1 = SERVER_8GB + BACKUP_MON + DOMAIN + RESERVE
STAGE1B = 2 * SERVER_8GB + BACKUP_MON + DOMAIN + RESERVE  # second server for headroom
STAGE2 = 60_000          # ASSUMPTION: managed Postgres/Kafka/ClickHouse + 2 app VMs (HA)

TEAM = 60_000            # ASSUMPTION: one full-time person (dev + support) per month
CHURN = {"pro": 0.05, "biz": 0.03}   # ASSUMPTION: monthly churn
CAC = {"pro": 800, "biz": 4_000}     # ASSUMPTION: blended acquisition cost per paying customer

SCENARIOS = [
    # name, registered users, paid conversion, business share of paid, enterprise deals, infra
    ("Conservative", 2_000, 0.02, 0.10, 0, STAGE1),
    ("Base",        10_000, 0.03, 0.12, 1, STAGE1),
    ("Optimistic",  40_000, 0.04, 0.15, 3, STAGE1B),
]
# ----------------------------------------------------------------

ANNUAL_FACTOR = 1 - ANNUAL_SHARE * (1 - 10 / 12)          # blended price after annual discount
KEEP = 1 / (1 + VAT) - FEE                                 # BDT kept per BDT collected (VAT out, fee out)
tk = lambda n: ("−" if round(n) < 0 else "") + f"৳{abs(round(n)):,}"

def run(reg, conv, biz_share, ent, infra):
    paying = round(reg * conv)
    biz = round(paying * biz_share)
    pro = paying - biz
    gross = (pro * P_PRO + biz * P_BIZ) * ANNUAL_FACTOR    # collected from customers, incl. VAT
    net_sub = gross / (1 + VAT)
    fees = gross * FEE
    revenue = net_sub + ent * P_ENT
    profit = revenue - fees - infra
    return dict(reg=reg, paying=paying, pro=pro, biz=biz, ent=ent, gross=gross, revenue=revenue,
                fees=fees, infra=infra, profit=profit, after_team=profit - TEAM)

def out(s=""): print(s)

out("### Scenarios (steady-state month, around month 12)\n")
out("| | " + " | ".join(n for n, *_ in SCENARIOS) + " |")
out("|---|" + "---:|" * len(SCENARIOS))
res = [run(*sc[1:]) for sc in SCENARIOS]
rows = [
    ("Registered users", lambda r: f"{r['reg']:,}"),
    ("Paying customers", lambda r: f"{r['paying']:,}"),
    ("  of which Pro / Business", lambda r: f"{r['pro']} / {r['biz']}"),
    ("Enterprise contracts", lambda r: f"{r['ent']}"),
    ("Collected from subscribers (incl. VAT)", lambda r: tk(r["gross"])),
    ("**Net revenue** (ex-VAT, incl. Enterprise)", lambda r: "**" + tk(r["revenue"]) + "**"),
    ("Payment gateway fees", lambda r: "−" + tk(r["fees"])),
    ("Infrastructure", lambda r: "−" + tk(r["infra"])),
    ("**Profit before salaries**", lambda r: "**" + tk(r["profit"]) + "**"),
    (f"Team cost ({tk(TEAM)})", lambda r: "−" + tk(TEAM)),
    ("**Profit after one salary**", lambda r: "**" + tk(r["after_team"]) + "**"),
]
for label, f in rows:
    out(f"| {label} | " + " | ".join(f(r) for r in res) + " |")

# Break-even
out("\n### Break-even (paying customers needed per month)\n")
out("| Cost to cover | Pro-only | Base mix (88% Pro / 12% Business) |")
out("|---|---:|---:|")
base_mix_gross = (0.88 * P_PRO + 0.12 * P_BIZ) * ANNUAL_FACTOR
for label, cost in [(f"Infrastructure only ({tk(STAGE1)})", STAGE1),
                    (f"Infra + one salary ({tk(STAGE1 + TEAM)})", STAGE1 + TEAM)]:
    pro_only = cost / (P_PRO * ANNUAL_FACTOR * KEEP)
    mix = cost / (base_mix_gross * KEEP)
    out(f"| {label} | {pro_only:.0f} | {mix:.0f} |")

# Unit economics
out("\n### Unit economics per paying customer\n")
out("| | Pro | Business |")
out("|---|---:|---:|")
for_each = {}
for k, price in (("pro", P_PRO), ("biz", P_BIZ)):
    collected = price * ANNUAL_FACTOR
    kept = collected * KEEP
    ltv = kept / CHURN[k]
    for_each[k] = (collected, kept, ltv, CAC[k] / kept, ltv / CAC[k])
labels = ["Avg collected / month (after annual discount)", "Kept after VAT + gateway fee / month",
          "Lifetime value (kept ÷ monthly churn)", "CAC payback (months)", "LTV : CAC"]
fmt = [tk, tk, tk, lambda v: f"{v:.1f}", lambda v: f"{v:.1f} : 1"]
for i, l in enumerate(labels):
    out(f"| {l} | " + " | ".join(fmt[i](for_each[k][i]) for k in ("pro", "biz")) + " |")
out(f"| Assumed monthly churn | {CHURN['pro']:.0%} | {CHURN['biz']:.0%} |")
out(f"| Assumed CAC | {tk(CAC['pro'])} | {tk(CAC['biz'])} |")

# Sensitivity on base
out("\n### Sensitivity: Base scenario profit before salaries\n")
regs = [2_000, 5_000, 10_000, 20_000, 40_000]
convs = [0.01, 0.02, 0.03, 0.04, 0.05]
out("| Registered users → | " + " | ".join(f"{r:,}" for r in regs) + " |")
out("|---|" + "---:|" * len(regs))
for c in convs:
    cells = []
    for r in regs:
        infra = STAGE1 if r <= 10_000 else STAGE1B
        cells.append(tk(run(r, c, 0.12, 0, infra)["profit"]))
    out(f"| {c:.0%} paid | " + " | ".join(cells) + " |")

out(f"\n### Infrastructure cost lines (assumed)\n")
out("| Item | ৳/month |")
out("|---|---:|")
for l, v in [("8 GB Singapore VPS", SERVER_8GB), ("Off-site backups + monitoring", BACKUP_MON),
             ("Domain (amortised)", DOMAIN), ("Misc / email reserve", RESERVE)]:
    out(f"| {l} | {tk(v)} |")
out(f"| **Stage 1 total** | **{tk(STAGE1)}** |")
out(f"| Stage 1 + second server (headroom) | {tk(STAGE1B)} |")
out(f"| Stage 2 (managed services, HA) | {tk(STAGE2)} |")
out(f"\nKept per BDT collected: {KEEP:.4f} (after {VAT:.0%} VAT and {FEE:.1%} gateway fee). Annual-billing blend factor: {ANNUAL_FACTOR:.4f}.")
