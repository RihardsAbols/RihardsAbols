import { calculateItemCosts, calculateSectionDirectTotal } from "../calculations/boq.js";
import type { BoqItem, BoqSection, BoqState } from "../models/boq.js";
import type { VariationOrder, VariationOrderChange } from "../models/variationOrder.js";

function cloneSections(sections: BoqSection[]): BoqSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));
}

function applyChange(sections: BoqSection[], change: VariationOrderChange): void {
  const section = sections.find((s) => s.id === change.sectionId);
  if (!section) {
    return; // Sadaļa neeksistē (nekonsekventi dati) - klusi izlaižam, nevis metam kļūdu, jo šo funkciju izsauc arī UI render ceļā.
  }

  if (change.itemId === null) {
    if (!change.newItem) {
      return;
    }
    section.items.push({ ...change.newItem, id: change.id, excluded: change.excluded });
    return;
  }

  const item = section.items.find((i) => i.id === change.itemId);
  if (!item) {
    return;
  }
  item.quantity = Math.max(0, item.quantity + change.quantityDelta);
  if (change.excluded) {
    item.excluded = true;
  }
}

/**
 * Atvasina "pašreizējo" sadaļu/pozīciju stāvokli no iesaldētas bāzes +
 * norādīto VO izmaiņu piemērošanas SECĪGI (masīva secībā, ne pēc datuma).
 * Bāze (`baseline`) pati NEKAD netiek mutēta - skat. BoqState.baselineApprovedAt.
 * Katras VO iekšienē arī izmaiņas piemērotas to masīva secībā.
 *
 * Kārtošana pēc statusa (approved vs. cita) ir SAUCĒJA ziņā - šī funkcija
 * piemēro tieši to VO sarakstu, kas padots, neatkarīgi no to `status` lauka.
 * Tas ļauj to atkalizmantot arī "kas notiktu, ja apstiprinātu" simulācijām
 * (skat. computeVariationOrderDirectTotalImpact zemāk), ne tikai galīgajam
 * "pašreizējam" stāvoklim.
 *
 * Jaunas pozīcijas (change.itemId === null) dabū `id` vienādu ar to
 * izveidojušās izmaiņas `id` - tas ļauj vēlākai VO atsaukties uz šo pozīciju
 * tāpat kā uz bāzes pozīciju (skat. models/variationOrder.ts).
 */
export function deriveCurrentSections(baseline: BoqSection[], variationOrders: VariationOrder[]): BoqSection[] {
  const sections = cloneSections(baseline);
  for (const vo of variationOrders) {
    for (const change of vo.changes) {
      applyChange(sections, change);
    }
  }
  return sections;
}

/** Ērtības funkcija - atvasina pilnu BoqState ar sections = bāze + apstiprinātās VO. */
export function deriveCurrentState(state: BoqState): BoqState {
  const approved = state.variationOrders.filter((vo) => vo.status === "approved");
  return { ...state, sections: deriveCurrentSections(state.sections, approved) };
}

export function nextVariationOrderNumber(existing: VariationOrder[]): string {
  return `VO-${existing.length + 1}`;
}

export interface CreateVariationOrderInput {
  title: string;
  justification: string;
  instructedBy: string;
  date: string;
}

/** Izveido jaunu VO statusā "proposed", bez izmaiņām - izmaiņas pievieno atsevišķi. */
export function createVariationOrder(existing: VariationOrder[], input: CreateVariationOrderInput): VariationOrder {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    number: nextVariationOrderNumber(existing),
    title: input.title,
    justification: input.justification,
    instructedBy: input.instructedBy,
    date: input.date,
    status: "proposed",
    statusDate: null,
    changes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Šīs VIENAS VO ietekme uz projekta tiešajām izmaksām (EUR), neatkarīgi no
 * pašas VO statusa - salīdzina atvasināto stāvokli TIEŠI PIRMS šīs VO
 * (bāze + iepriekšējās APSTIPRINĀTĀS VO masīva secībā) pret stāvokli TŪLĪT
 * PĒC tās piemērošanas. Lieto Excel "Izmaiņu reģistrā" un UI VO sarakstā, lai
 * katrai VO (arī vēl "proposed") rādītu tās finansiālo ietekmi.
 *
 * Piemērots caur deriveCurrentSections divreiz (nevis atsevišķa
 * per-izmaiņas formula), lai pareizi apstrādātu VISUS gadījumus vienādi
 * (daudzuma korekcija, izslēgšana, jauna pozīcija, arī atsauces uz cita VO
 * pievienotu pozīciju) bez loģikas dublēšanās.
 */
export function computeVariationOrderDirectTotalImpact(
  baseline: BoqSection[],
  variationOrders: VariationOrder[],
  voId: string,
): number {
  const index = variationOrders.findIndex((vo) => vo.id === voId);
  if (index === -1) {
    return 0;
  }
  const target = variationOrders[index];
  const priorApproved = variationOrders.slice(0, index).filter((vo) => vo.status === "approved");

  const before = deriveCurrentSections(baseline, priorApproved);
  const after = deriveCurrentSections(baseline, [...priorApproved, target]);

  const sum = (sections: BoqSection[]) => sections.reduce((total, section) => total + calculateSectionDirectTotal(section), 0);
  return sum(after) - sum(before);
}

export interface BoqItemDiffRow {
  sectionId: string;
  sectionName: string;
  itemId: string;
  code: string;
  description: string;
  unit: string;
  /** null, ja šīs pozīcijas bāzes tāmē nebija - pievienota ar VO. */
  baselineQuantity: number | null;
  currentQuantity: number;
  quantityDelta: number;
  excluded: boolean;
  baselineDirectTotal: number;
  currentDirectTotal: number;
  directTotalDelta: number;
}

/**
 * Salīdzina bāzes un pašreizējo (jau atvasināto, skat. deriveCurrentSections)
 * sadaļu/pozīciju sarakstus un atgriež TIKAI pozīcijas, kas atšķiras
 * (daudzums mainīts, izslēgtas, vai jaunas) - lieto UI "Izmaiņu" cilnes diff
 * skatam un Excel eksporta delta kolonnām. Lielai tāmei ar tūkstošiem
 * pozīciju, no kurām mainījušās tikai dažas, pilns saraksts būtu nelietojams
 * troksnis.
 */
export function diffAgainstBaseline(baseline: BoqSection[], current: BoqSection[]): BoqItemDiffRow[] {
  const baselineItems = new Map<string, BoqItem>();
  for (const section of baseline) {
    for (const item of section.items) {
      baselineItems.set(item.id, item);
    }
  }

  const rows: BoqItemDiffRow[] = [];
  for (const section of current) {
    for (const item of section.items) {
      const baselineItem = baselineItems.get(item.id) ?? null;
      const baselineQuantity = baselineItem ? baselineItem.quantity : null;
      const quantityDelta = item.quantity - (baselineQuantity ?? 0);
      const isNew = baselineItem === null;
      const isExcluded = Boolean(item.excluded);
      if (quantityDelta === 0 && !isExcluded && !isNew) {
        continue;
      }
      const baselineDirectTotal = baselineItem ? calculateItemCosts(baselineItem).directTotal : 0;
      const currentDirectTotal = calculateItemCosts(item).directTotal;
      rows.push({
        sectionId: section.id,
        sectionName: section.name,
        itemId: item.id,
        code: item.code,
        description: item.description,
        unit: item.unit,
        baselineQuantity,
        currentQuantity: item.quantity,
        quantityDelta,
        excluded: isExcluded,
        baselineDirectTotal,
        currentDirectTotal,
        directTotalDelta: currentDirectTotal - baselineDirectTotal,
      });
    }
  }
  return rows;
}
