/**
 * What a run genuinely cannot produce, and what to say instead.
 *
 * An agent builder that only refuses is nearly useless; one that quietly
 * accepts an impossible brief is worse. Each limit here names the missing
 * ingredient and the nearest thing that is actually achievable, so a
 * conversation can ask for a source rather than either bluffing or stonewalling.
 */

export type LimitId =
  | "wallet.performance"
  | "wallet.history"
  | "chain.discovery"
  | "web.search"
  | "delivery.external"
  | "wallet.execute";

export type RuntimeLimit = {
  id: LimitId;
  /** Why a run cannot produce this, in terms of what a run actually reads. */
  because: string;
  /** What would have to be supplied for it to become possible. */
  needs: string;
  /** What GARDN can genuinely do instead, offered rather than withheld. */
  instead: string;
};

export const RUNTIME_LIMITS: Record<LimitId, RuntimeLimit> = {
  "wallet.performance": {
    id: "wallet.performance",
    because: "Win rate and profit need entry prices and realised P&L across a wallet's whole trading history. A run reads a confirmed balance and the 25 most recent signatures.",
    needs: "A public endpoint that already publishes wallet performance.",
    instead: "Watch specific wallets you name and report their balance changes and new activity as it happens.",
  },
  "wallet.history": {
    id: "wallet.history",
    because: "A run sees the 25 most recent signatures, not a wallet's full history, and cannot page backwards through it.",
    needs: "An endpoint that publishes the aggregate you want.",
    instead: "Track changes from run to run, which builds a record forward from the moment the agent is planted.",
  },
  "chain.discovery": {
    id: "chain.discovery",
    because: "A run reads one target. It cannot sweep the chain looking for tokens or wallets that match a description.",
    needs: "An endpoint that returns a list — a screener or aggregator API rather than a single record.",
    instead: "Screen a list endpoint you point at, reasoning across every item it returns in one run.",
  },
  "web.search": {
    id: "web.search",
    because: "A run fetches one URL it was given. It cannot search, crawl, or follow its way around a site.",
    needs: "The specific URL that already returns what you want.",
    instead: "Read one endpoint and reason over its whole response.",
  },
  "delivery.external": {
    id: "delivery.external",
    because: "Results are written to the GARDN inbox. There is no connector for Telegram, webhooks or social posting.",
    needs: "A delivery connector, which is not yet built.",
    instead: "Store every result as evidence in the inbox, where it can be read and audited.",
  },
  "wallet.execute": {
    id: "wallet.execute",
    because: "Agents are read-only. Nothing in a run can sign a transaction or move funds.",
    needs: "A separate user-signed execution connector.",
    instead: "Surface the moment worth acting on, and leave the acting to you.",
  },
};

const PATTERNS: Array<{ id: LimitId; test: RegExp }> = [
  { id: "wallet.performance", test: /\b(win[- ]?rate|winrate|pnl|p&l|profit|roi|performance|most profitable|best traders?|alpha wallets?)\b/i },
  { id: "chain.discovery", test: /\b(find|discover|scan|search) (me )?(all |any |the )?(new |good |profitable )?(wallets?|tokens?|coins?|projects?)\b/i },
  { id: "web.search", test: /\b(search the web|web search|google|browse the (web|internet)|crawl)\b/i },
  { id: "delivery.external", test: /\b(telegram|discord|webhook|tweet|post to x|dm me)\b/i },
  { id: "wallet.execute", test: /\b(buy|sell|swap|trade|transfer|withdraw)\b/i },
  { id: "wallet.history", test: /\b(historical|history|over the last (month|year)|past \d+ (days?|weeks?|months?))\b/i },
];

/** Limits a request runs into, so they can be named before anything is promised. */
export function limitsFor(request: string): RuntimeLimit[] {
  return PATTERNS
    .filter(({ test }) => test.test(request))
    .map(({ id }) => RUNTIME_LIMITS[id]);
}

export function isAchievable(request: string): boolean {
  return limitsFor(request).length === 0;
}
