import { Decimal, isWithinRange } from "@/lib/decimal";

export interface AlertTransitionInput {
  previousRangeKey: string | null;
  previousInRange: boolean;
  rangeKey: string;
  low: string;
  high: string;
  price: string;
}

export function alertTransition(input: AlertTransitionInput) {
  const rangeChanged = input.previousRangeKey !== input.rangeKey;
  const previousInRange = rangeChanged ? false : input.previousInRange;
  const inside = isWithinRange(new Decimal(input.price), new Decimal(input.low), new Decimal(input.high));
  return { inside, entered: inside && !previousInRange, rangeChanged };
}
