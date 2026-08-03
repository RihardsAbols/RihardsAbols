import type { BoqItem, BoqSection, BoqState } from "../models/boq.js";

/** Rounds to 2 decimal places (money), correcting for float artifacts like 1.005. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface BoqItemCosts {
  laborTotal: number;
  materialsTotal: number;
  mechanismsTotal: number;
  /** Tiešās izmaksas šai pozīcijai (darba alga + materiāli + mehānismi). */
  directTotal: number;
}

export function calculateItemCosts(item: BoqItem): BoqItemCosts {
  const laborTotal = item.quantity * item.unitLaborCost;
  const materialsTotal = item.quantity * item.unitMaterialsCost;
  const mechanismsTotal = item.quantity * item.unitMechanismsCost;
  return {
    laborTotal,
    materialsTotal,
    mechanismsTotal,
    directTotal: laborTotal + materialsTotal + mechanismsTotal,
  };
}

function sumSectionRawCosts(section: BoqSection): BoqItemCosts {
  return section.items.reduce<BoqItemCosts>(
    (sum, item) => {
      const costs = calculateItemCosts(item);
      return {
        laborTotal: sum.laborTotal + costs.laborTotal,
        materialsTotal: sum.materialsTotal + costs.materialsTotal,
        mechanismsTotal: sum.mechanismsTotal + costs.mechanismsTotal,
        directTotal: sum.directTotal + costs.directTotal,
      };
    },
    { laborTotal: 0, materialsTotal: 0, mechanismsTotal: 0, directTotal: 0 },
  );
}

/** Tiešās izmaksas sadaļai (darba alga + materiāli + mehānismi), bez virsizdevumiem/peļņas. */
export function calculateSectionDirectTotal(section: BoqSection): number {
  return sumSectionRawCosts(section).directTotal;
}

export interface BoqSectionSummary {
  id: string;
  name: string;
  laborTotal: number;
  materialsTotal: number;
  mechanismsTotal: number;
  /** Tiešās izmaksas (bez atlaides/virsizdevumiem/peļņas/PVN). */
  directTotal: number;
  /** Šīs sadaļas daļa no projekta atlaides (proporcionāli tās directTotal). */
  discountAmount: number;
  /** Tiešās izmaksas mīnus atlaide - bāze virsizdevumu/peļņas aprēķinam. */
  directTotalAfterDiscount: number;
  overhead: number;
  profit: number;
  /** Tiešās izmaksas pēc atlaides + virsizdevumi + peļņa (bez PVN). */
  totalWithMarkup: number;
}

export interface BoqSummary {
  sections: BoqSectionSummary[];
  /** Tiešās izmaksas (bez atlaides/virsizdevumiem/peļņas/PVN). */
  directTotal: number;
  discountRate: number;
  discountAmount: number;
  /** Tiešās izmaksas mīnus atlaide - bāze virsizdevumu/peļņas aprēķinam. */
  directTotalAfterDiscount: number;
  overheadRate: number;
  overhead: number;
  profitRate: number;
  profit: number;
  /** Pavisam pirms PVN (tiešās izmaksas pēc atlaides + virsizdevumi + peļņa). */
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  /** Pavisam ar PVN. */
  total: number;
}

export function summarizeBoq(state: BoqState): BoqSummary {
  // Sum unrounded intermediates first, then round once at the end — rounding
  // each section (or each markup step) before summing would let per-step
  // rounding drift compound across sections/items.
  const rawSections = state.sections.map((section) => {
    const raw = sumSectionRawCosts(section);
    const discountAmount = raw.directTotal * state.discountRate;
    const directTotalAfterDiscount = raw.directTotal - discountAmount;
    const overhead = directTotalAfterDiscount * state.overheadRate;
    const profit = directTotalAfterDiscount * state.profitRate;
    return {
      id: section.id,
      name: section.name,
      raw,
      discountAmount,
      directTotalAfterDiscount,
      overhead,
      profit,
      totalWithMarkup: directTotalAfterDiscount + overhead + profit,
    };
  });

  const rawDirectTotal = rawSections.reduce((sum, s) => sum + s.raw.directTotal, 0);
  const rawDiscountAmount = rawDirectTotal * state.discountRate;
  const rawDirectTotalAfterDiscount = rawDirectTotal - rawDiscountAmount;
  const rawOverhead = rawDirectTotalAfterDiscount * state.overheadRate;
  const rawProfit = rawDirectTotalAfterDiscount * state.profitRate;
  const rawSubtotal = rawDirectTotalAfterDiscount + rawOverhead + rawProfit;
  const rawVatAmount = rawSubtotal * state.vatRate;

  return {
    sections: rawSections.map(
      ({ id, name, raw, discountAmount, directTotalAfterDiscount, overhead, profit, totalWithMarkup }) => ({
        id,
        name,
        laborTotal: round2(raw.laborTotal),
        materialsTotal: round2(raw.materialsTotal),
        mechanismsTotal: round2(raw.mechanismsTotal),
        directTotal: round2(raw.directTotal),
        discountAmount: round2(discountAmount),
        directTotalAfterDiscount: round2(directTotalAfterDiscount),
        overhead: round2(overhead),
        profit: round2(profit),
        totalWithMarkup: round2(totalWithMarkup),
      }),
    ),
    directTotal: round2(rawDirectTotal),
    discountRate: state.discountRate,
    discountAmount: round2(rawDiscountAmount),
    directTotalAfterDiscount: round2(rawDirectTotalAfterDiscount),
    overheadRate: state.overheadRate,
    overhead: round2(rawOverhead),
    profitRate: state.profitRate,
    profit: round2(rawProfit),
    subtotal: round2(rawSubtotal),
    vatRate: state.vatRate,
    vatAmount: round2(rawVatAmount),
    total: round2(rawSubtotal + rawVatAmount),
  };
}
