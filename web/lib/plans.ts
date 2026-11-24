// Single source of truth for pricing (BDT). Keep in sync with docs/BUSINESS_MODEL.md
// and planLimits in api/internal/server/server.go.
export type Plan = {
  id: "free" | "pro" | "business" | "enterprise";
  name: string;
  price: number | null; // ৳ per month; null = custom
  blurb: string;
  links: string;
  features: { text: string; soon?: boolean }[];
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free", name: "Free", price: 0, blurb: "For trying things out.", links: "25 links",
    features: [
      { text: "25 short links" }, { text: "7-day analytics history" },
      { text: "Custom aliases & expiry" }, { text: "Referrer, device & country stats" }, { text: "QR codes" },
    ],
  },
  {
    id: "pro", name: "Pro", price: 499, blurb: "For creators and freelancers.", links: "1,000 links", highlight: true,
    features: [
      { text: "Everything in Free" }, { text: "1,000 short links" }, { text: "90-day analytics history" }, { text: "Email support" },
    ],
  },
  {
    id: "business", name: "Business", price: 1999, blurb: "For teams and campaigns.", links: "10,000 links",
    features: [
      { text: "Everything in Pro" }, { text: "10,000 short links" }, { text: "1-year analytics history" }, { text: "Priority support" },
      { text: "Custom branded domain", soon: true }, { text: "Team seats", soon: true },
    ],
  },
  {
    id: "enterprise", name: "Enterprise", price: null, blurb: "For high-volume platforms.", links: "Unlimited",
    features: [
      { text: "Everything in Business" }, { text: "Unlimited links" }, { text: "1-year analytics history" },
      { text: "SLA & onboarding" }, { text: "Data export to your warehouse", soon: true },
    ],
  },
];

export const formatBDT = (n: number) => "৳" + n.toLocaleString("en-US");
