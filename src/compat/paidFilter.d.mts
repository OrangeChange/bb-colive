export interface PaidAmountFacts { unit: number | null; cumulative: number | null }
export function paidAmountVisible(facts: PaidAmountFacts | undefined, threshold: number, mode?: 'unit' | 'cumulative'): boolean;
export function mergePaidAmounts(first: PaidAmountFacts | undefined, next: PaidAmountFacts | undefined): PaidAmountFacts;
