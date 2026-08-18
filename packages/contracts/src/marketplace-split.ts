// USDC on Solana uses 6 decimals: 1 USDC = 1_000_000 base units, 1 cent = 10_000 units.
export const USDC_DECIMALS = 6;
export const USDC_BASE_UNITS_PER_CENT = 10_000n;

// Platform keeps 10%; the creator keeps the remaining 90% of every sale.
export const PLATFORM_FEE_BASIS_POINTS = 1_000;
export const BASIS_POINTS_DENOMINATOR = 10_000;

export type SettlementSplit = {
  totalCents: number;
  creatorShareCents: number;
  platformFeeCents: number;
  totalBaseUnits: bigint;
  creatorShareBaseUnits: bigint;
  platformFeeBaseUnits: bigint;
};

export function centsToBaseUnits(cents: number): bigint {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("Amount must be a non-negative integer number of cents.");
  }
  return BigInt(cents) * USDC_BASE_UNITS_PER_CENT;
}

export function computeSettlementSplit(priceCents: number): SettlementSplit {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError("Listing price must be a non-negative integer number of cents.");
  }
  // The platform fee is the remainder after the creator's floored 90% share, so
  // the two parts always sum back to the exact listing price with no lost cent.
  const creatorShareCents = Math.floor((priceCents * (BASIS_POINTS_DENOMINATOR - PLATFORM_FEE_BASIS_POINTS)) / BASIS_POINTS_DENOMINATOR);
  const platformFeeCents = priceCents - creatorShareCents;
  return {
    totalCents: priceCents,
    creatorShareCents,
    platformFeeCents,
    totalBaseUnits: centsToBaseUnits(priceCents),
    creatorShareBaseUnits: centsToBaseUnits(creatorShareCents),
    platformFeeBaseUnits: centsToBaseUnits(platformFeeCents),
  };
}

// A settlement is only valid when the on-chain transfers exactly match the split:
// the buyer is debited the total, the creator credited their share, the platform its fee.
export function settlementMatchesSplit(split: SettlementSplit, observed: {
  buyerDeltaBaseUnits: bigint;
  creatorDeltaBaseUnits: bigint;
  platformDeltaBaseUnits: bigint;
}): boolean {
  return observed.buyerDeltaBaseUnits === -split.totalBaseUnits
    && observed.creatorDeltaBaseUnits === split.creatorShareBaseUnits
    && observed.platformDeltaBaseUnits === split.platformFeeBaseUnits;
}
