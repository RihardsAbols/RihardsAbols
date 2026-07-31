import type { BoqItem, BoqSection, BoqState } from "../models/boq.js";

/** Rounds to 2 decimal places (money), correcting for float artifacts like 1.005. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateItemTotal(item: BoqItem): number {
  return item.quantity * item.unitPrice;
}

export function calculateSectionSubtotal(section: BoqSection): number {
  return section.items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
}

export interface BoqSectionSummary {
  id: string;
  name: string;
  subtotal: number;
}

export interface BoqSummary {
  sections: BoqSectionSummary[];
  /** Summa bez PVN. */
  subtotal: number;
  vatRate: number;
  /** PVN summa. */
  vatAmount: number;
  /** Summa ar PVN. */
  total: number;
}

export function summarizeBoq(state: BoqState): BoqSummary {
  // Sum unrounded section totals first, then round once at the end — rounding
  // each section before summing would let per-section rounding drift compound.
  const rawSections = state.sections.map((section) => ({
    id: section.id,
    name: section.name,
    raw: calculateSectionSubtotal(section),
  }));

  const rawSubtotal = rawSections.reduce((sum, section) => sum + section.raw, 0);
  const rawVatAmount = rawSubtotal * state.vatRate;

  return {
    sections: rawSections.map(({ id, name, raw }) => ({ id, name, subtotal: round2(raw) })),
    subtotal: round2(rawSubtotal),
    vatRate: state.vatRate,
    vatAmount: round2(rawVatAmount),
    total: round2(rawSubtotal + rawVatAmount),
  };
}
