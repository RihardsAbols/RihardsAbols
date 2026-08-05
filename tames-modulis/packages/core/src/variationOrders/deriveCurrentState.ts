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
  if (change.newSection) {
    // Jauna (sākotnēji tukša) sadaļa - pati izmaiņa nepievieno pozīcijas,
    // skat. models/variationOrder.ts VariationOrderChange.newSection.
    // Neveido dublikātu, ja šī sadaļa (pēc id) jau eksistē - aizsardzība pret
    // to, ka šī funkcija tiek izsaukta ar to pašu VO sarakstu vairākas
    // reizes (piem. UI preview aprēķini).
    if (!sections.some((s) => s.id === change.id)) {
      sections.push({ id: change.id, name: change.newSection.name, estimateNumber: change.newSection.estimateNumber, items: [] });
    }
    return;
  }

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
    voidedReason: null,
    reserveDrawdown: 0,
    changes: [],
    statusHistory: [{ status: "proposed", date: now }],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * ANULĒ apstiprinātu VO (status "approved" -> "voided") - korekcijas
 * mehānisms kļūdaini apstiprinātai VO (piem. nepareizs daudzums), skat.
 * CLAUDE.md "Izpildes aktu/VO anulēšana (Sesija 23)". Anulēta VO paliek
 * `variationOrders` sarakstā (nav dzēsta, pilns audit trail), bet vairs NAV
 * "approved", tāpēc `deriveCurrentState`/`deriveCurrentSections` (kas filtrē
 * pēc `status === "approved"`) to vairs nepiemēro pašreizējam stāvoklim -
 * korekciju veic, izveidojot JAUNU VO, nevis pārrakstot šo.
 *
 * Zināms ierobežojums (apzināti nav bloķēts, tikai jāzina): ja cita
 * APSTIPRINĀTA VO atsaucas (change.itemId/sectionId) uz pozīciju/sadaļu, ko
 * izveidoja TIEŠI ŠĪ VO (skat. models/variationOrder.ts "self-referencing
 * id"), pēc anulēšanas `applyChange` (deriveCurrentSections) to izmaiņu
 * klusi izlaidīs (sadaļa/pozīcija vairs neeksistēs atvasinātajā stāvoklī) -
 * tas jau ir esošais "nekonsekventi dati" ceļš, ne jauna kļūda, bet
 * lietotājam pirms anulēšanas jāpārliecinās, ka neviena vēlāka VO nav
 * atkarīga no šīs.
 */
export function voidVariationOrder(variationOrders: VariationOrder[], voId: string, reason: string): VariationOrder[] {
  const target = variationOrders.find((vo) => vo.id === voId);
  if (!target) {
    throw new Error(`Variation order not found: ${voId}`);
  }
  if (target.status !== "approved") {
    throw new Error(`Only an approved variation order can be voided (current status: ${target.status})`);
  }
  const now = new Date().toISOString();
  return variationOrders.map((vo) =>
    vo.id === voId
      ? { ...vo, status: "voided", statusDate: now, voidedReason: reason, statusHistory: [...vo.statusHistory, { status: "voided", date: now }], updatedAt: now }
      : vo,
  );
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

/** Vienas VO ieguldījums/izmantojums "Pasūtītāja rezervē" - skat. computeReserveBalance. */
export interface ReserveEntry {
  voId: string;
  voNumber: string;
  voTitle: string;
  /** Šīs VO finansiālā ietekme (EUR) - tas pats, ko atgriež computeVariationOrderDirectTotalImpact. Negatīva = ietaupījums, pozitīva = papildu izmaksas. */
  directTotalImpact: number;
  /** Summa, ko šī VO PAPILDINA rezervei (|impact|, ja impact < 0 - citādi 0). */
  contribution: number;
  /** Summa, ko šī VO IZMANTO no rezerves (vo.reserveDrawdown, TIKAI ja impact > 0 - VO ar ietaupījumu drawdown netiek uzskaitīts, pat ja lauks kļūdaini iestatīts). */
  drawdown: number;
  /** Kumulatīvais rezerves atlikums TŪLĪT PĒC šīs VO. */
  balanceAfter: number;
}

export interface ReserveBalance {
  /** Viena rinda katrai APSTIPRINĀTAI (un neanulētai) VO, VO secībā - tāpat kā deriveCurrentState, anulētas/noraidītas/vēl "proposed" VO neietekmē. */
  entries: ReserveEntry[];
  totalAccumulated: number;
  totalDrawn: number;
  /** totalAccumulated - totalDrawn - pieejamā summa nākamajām VO. */
  available: number;
}

/**
 * "Pasūtītāja rezerve" (skat. CLAUDE.md "Pasūtītāja rezerve (Sesija 26)") -
 * VO ceļā izslēgto/samazināto pozīciju ietaupītās vērtības uzkrājums, ko
 * vēlāk var izmantot jaunu papildu darbu segšanai. Pilnībā ATVASINĀTS
 * (tāpat kā "pašreizējais" stāvoklis) - VIENĪGAIS tieši ievadāmais lauks ir
 * VariationOrder.reserveDrawdown (cik daudz no savas POZITĪVĀS ietekmes šī
 * VO izmanto no rezerves), uzkrāšanas puse nav manuāli jāatzīmē katram
 * izslēgumam atsevišķi.
 *
 * INFORMATĪVS pārskats - NEIETEKMĒ tāmes pašu "Pavisam"/"KOPĀ AR PVN" summu
 * (kas jau pareizi atspoguļo visu apstiprināto VO derivāciju neatkarīgi no
 * šīs funkcijas) - tikai rāda, cik no papildu darbu izmaksām jau ir "segts"
 * ar iepriekšēju ietaupījumu, noderīgi pasūtītāja pārskatiem/sarunām.
 *
 * `variationOrders` jāpadod PILNS saraksts (ne tikai apstiprinātās) - tāpat
 * kā computeVariationOrderDirectTotalImpact, katrai VO vajadzīgs tās secības
 * konteksts pilnajā masīvā, lai pareizi aprēķinātu ietekmi.
 */
export function computeReserveBalance(baseline: BoqSection[], variationOrders: VariationOrder[]): ReserveBalance {
  const approved = variationOrders.filter((vo) => vo.status === "approved");

  const entries: ReserveEntry[] = [];
  let running = 0;
  let totalAccumulated = 0;
  let totalDrawn = 0;

  for (const vo of approved) {
    const impact = computeVariationOrderDirectTotalImpact(baseline, variationOrders, vo.id);
    const contribution = impact < 0 ? -impact : 0;
    const drawdown = impact > 0 ? vo.reserveDrawdown : 0;
    running += contribution - drawdown;
    totalAccumulated += contribution;
    totalDrawn += drawdown;
    entries.push({ voId: vo.id, voNumber: vo.number, voTitle: vo.title, directTotalImpact: impact, contribution, drawdown, balanceAfter: running });
  }

  return { entries, totalAccumulated, totalDrawn, available: running };
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

/** Vienas VO ietekme uz VIENU pozīciju - skat. computeItemCodesAndHistory. */
export interface ItemVoImpact {
  voId: string;
  voNumber: string;
  /** true, ja šī VO izveidoja pozīciju (nevis mainīja jau esošu). */
  isNew: boolean;
  /** Šīs VO izraisītā daudzuma izmaiņa - jaunai pozīcijai tas ir tās pilnais sākotnējais daudzums. */
  quantityDelta: number;
  /** Šīs VO izraisītā tiešo izmaksu izmaiņa (EUR), izolēti no citu VO ietekmes. */
  directTotalDelta: number;
}

export interface ItemDisplayInfo {
  /**
   * Atvasināta N.p.k. vērtība pozīcijai (skat. computeItemCodesAndHistory) -
   * NAV tas pats, kas BoqItem.code (kas paliek neskarts, brīvs teksts).
   */
  displayCode: string;
  /** Katras VO ietekme uz šo pozīciju, VO secībā - tukšs, ja pozīciju neviena padotā VO nav skārusi. */
  impacts: ItemVoImpact[];
}

/** 1->"a", 2->"b", ..., 26->"z", 27->"aa", ... (base-26, tāpat kā izklājlapu kolonnu burti). */
function letterSuffix(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(97 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

interface ItemCodeState {
  originCode: string;
  /** VO numurs ("VO-N"), ja šo pozīciju automātiski numurēja jaunas pozīcijas izveide esošā sadaļā - citādi null. */
  originTag: string | null;
  revisionCount: number;
  impacts: ItemVoImpact[];
}

/**
 * Katrai pozīcijai atvasina (a) cilvēklasāmu N.p.k. displayCode, kas atspoguļo
 * TĀS IZCELSMI un turpmāko VO revīziju vēsturi, un (b) katras padotās VO
 * izolēto ietekmi uz šo pozīciju (daudzums + tiešās izmaksas) - skat.
 * CLAUDE.md "Tāmes izmaiņu (Variation Order) vadība" numerācijas shēmu.
 * `variationOrders` ir SAUCĒJA izvēlēts saraksts (parasti tikai approved, VO
 * secībā) - tāpat kā deriveCurrentSections, šī funkcija pati nefiltrē pēc
 * statusa.
 *
 * Displaycode noteikšana pēc izcelsmes:
 * - Bāzes pozīcija, ko neviena VO nav mainījusi: displayCode === item.code.
 * - Bāzes pozīcija, ko mainījušas N VO (kopā, neatkarīgi no konkrētā VO
 *   numura): displayCode === item.code + burta piedēklis (revīzijas KĀRTA,
 *   nevis konkrētās VO numurs - "1a" pēc 1. korekcijas, "1b" pēc 2., utt.).
 * - Pavisam jauna pozīcija, ko VO pievieno ESOŠĀ (bāzes) sadaļā: jauns
 *   unikāls numurs (turpina sadaļas numerāciju) + VO atzīme, piem.
 *   "21 (VO-2)" - un TURPMĀK arī var iegūt revīzijas burtu, ja vēlāka VO to
 *   atkal maina (piem. "21a (VO-2)").
 * - Jauna pozīcija JAUNĀ (VO izveidotā) sadaļā: displayCode === newItem.code
 *   tieši, kā lietotājs to ievadījis - nav auto-numura/tag, jo sadaļa pati
 *   jau ir "sākas no 1" (skat. CLAUDE.md).
 *
 * Reizē lieto (nevis dublē) jau esošo applyChange/cloneSections mutācijas
 * loģiku, lai daudzuma/izslēgšanas aprēķini paliktu VIENĀ vietā.
 */
export function computeItemCodesAndHistory(
  baseline: BoqSection[],
  variationOrders: VariationOrder[],
): Map<string, ItemDisplayInfo> {
  const workingSections = cloneSections(baseline);
  const baselineSectionIds = new Set(baseline.map((s) => s.id));
  const sectionCounters = new Map<string, number>(baseline.map((s) => [s.id, s.items.length]));
  const itemState = new Map<string, ItemCodeState>();

  for (const section of baseline) {
    for (const item of section.items) {
      itemState.set(item.id, { originCode: item.code, originTag: null, revisionCount: 0, impacts: [] });
    }
  }

  const findItem = (itemId: string): BoqItem | undefined => {
    for (const section of workingSections) {
      const found = section.items.find((i) => i.id === itemId);
      if (found) return found;
    }
    return undefined;
  };

  for (const vo of variationOrders) {
    for (const change of vo.changes) {
      if (change.newSection) {
        applyChange(workingSections, change);
        continue;
      }

      if (change.itemId === null) {
        applyChange(workingSections, change);
        const newItem = findItem(change.id);
        if (!newItem) continue; // sadaļa neeksistēja (nekonsekventi dati) - applyChange to jau klusi izlaida.
        const directTotal = calculateItemCosts(newItem).directTotal;
        const isBaselineSection = baselineSectionIds.has(change.sectionId);
        let originCode: string;
        let originTag: string | null;
        if (isBaselineSection) {
          const nextNumber = (sectionCounters.get(change.sectionId) ?? 0) + 1;
          sectionCounters.set(change.sectionId, nextNumber);
          originCode = String(nextNumber);
          originTag = vo.number;
        } else {
          originCode = newItem.code;
          originTag = null;
        }
        itemState.set(change.id, {
          originCode,
          originTag,
          revisionCount: 0,
          impacts: [{ voId: vo.id, voNumber: vo.number, isNew: true, quantityDelta: newItem.quantity, directTotalDelta: directTotal }],
        });
        continue;
      }

      const entry = itemState.get(change.itemId);
      const itemBefore = findItem(change.itemId);
      if (!entry || !itemBefore) continue; // nekonsekventi dati - klusi izlaižam, tāpat kā applyChange.
      const beforeTotal = calculateItemCosts(itemBefore).directTotal;
      applyChange(workingSections, change);
      const itemAfter = findItem(change.itemId);
      if (!itemAfter) continue;
      const afterTotal = calculateItemCosts(itemAfter).directTotal;
      if (change.quantityDelta !== 0 || change.excluded) {
        entry.revisionCount += 1;
        entry.impacts.push({
          voId: vo.id,
          voNumber: vo.number,
          isNew: false,
          quantityDelta: change.quantityDelta,
          directTotalDelta: afterTotal - beforeTotal,
        });
      }
    }
  }

  const result = new Map<string, ItemDisplayInfo>();
  for (const [itemId, entry] of itemState) {
    const suffix = entry.revisionCount > 0 ? letterSuffix(entry.revisionCount) : "";
    const tag = entry.originTag ? ` (${entry.originTag})` : "";
    result.set(itemId, { displayCode: `${entry.originCode}${suffix}${tag}`, impacts: entry.impacts });
  }
  return result;
}
