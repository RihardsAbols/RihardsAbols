import { round2 } from "../calculations/boq.js";
import type { BoqItem, BoqSection } from "../models/boq.js";
import type { ExecutionRecord } from "../models/executionRecord.js";

/** Pozīcijas vienības izmaksa (darba alga+materiāli+mehānismi), izslēgtai pozīcijai vienmēr 0 - konsekventi ar calculateItemCosts. */
function itemUnitCost(item: BoqItem): number {
  return item.excluded ? 0 : item.unitLaborCost + item.unitMaterialsCost + item.unitMechanismsCost;
}

/**
 * Kumulatīvais izpildītais daudzums pozīcijai VISOS izpildes aktos
 * (visos periodos kopā) - vienmēr atvasināts no akta ierakstiem, nekad
 * glabāts atsevišķi (skat. models/boq.ts BoqState.executionRecords).
 * ANULĒTI akti (`record.voidedAt !== null`, skat. voidExecutionRecord)
 * netiek ieskaitīti - tā, it kā tie nekad nebūtu iesniegti.
 */
export function computeExecutedToDate(executionRecords: ExecutionRecord[], itemId: string): number {
  let total = 0;
  for (const record of executionRecords) {
    if (record.voidedAt) continue;
    for (const entry of record.entries) {
      if (entry.itemId === itemId) {
        total += entry.executedQuantity;
      }
    }
  }
  return total;
}

/**
 * Atlikums = pašreizējais (bāze + apstiprinātās VO) daudzums mīnus
 * kumulatīvi izpildītais - "cik vēl paliek" pirms jaunas VO izveides, skat.
 * CLAUDE.md "Tāmes izmaiņu (Variation Order) vadība". Var būt negatīvs, ja
 * izpildīts vairāk par pašreizējo līgumā paredzēto apjomu - saucējam
 * (UI) tas jāparāda kā brīdinājumu, šī funkcija pati neierobežo/neklampē.
 */
export function computeRemainingQuantity(currentQuantity: number, executedToDate: number): number {
  return currentQuantity - executedToDate;
}

export interface CreateExecutionRecordInput {
  period: string;
  date: string;
  approvedBy: string;
}

/** Izveido jaunu izpildes aktu bez ierakstiem - ierakstus pievieno atsevišķi. */
export function createExecutionRecord(input: CreateExecutionRecordInput): ExecutionRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    period: input.period,
    date: input.date,
    approvedBy: input.approvedBy,
    entries: [],
    voidedAt: null,
    voidedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * ANULĒ izpildes aktu (`voidedAt`/`voidedReason` iestatīti) - korekcijas
 * mehānisms kļūdainam aktam (piem. nepareizi ievadīts skaitlis), skat.
 * CLAUDE.md "Izpildes aktu/VO anulēšana (Sesija 23)". Akts paliek
 * `executionRecords` sarakstā (nav dzēsts, pilns audit trail), bet
 * `computeExecutedToDate` to vairs neieskaita - korekciju veic, izveidojot
 * JAUNU aktu (manuāli vai Excel importu) ar pareizo daudzumu, nevis
 * pārrakstot šo.
 */
export function voidExecutionRecord(executionRecords: ExecutionRecord[], recordId: string, reason: string): ExecutionRecord[] {
  const target = executionRecords.find((r) => r.id === recordId);
  if (!target) {
    throw new Error(`Execution record not found: ${recordId}`);
  }
  if (target.voidedAt) {
    throw new Error(`Execution record already voided: ${recordId}`);
  }
  const now = new Date().toISOString();
  return executionRecords.map((r) => (r.id === recordId ? { ...r, voidedAt: now, voidedReason: reason, updatedAt: now } : r));
}

/**
 * Viena izpildes akta EUR vērtība - visu tā ierakstu izpildīto daudzumu ×
 * attiecīgās pozīcijas vienības izmaksa, summēts NEATKARĪGI no mērvienības
 * (šī ir naudas summa, ne daudzums - atšķirībā no vēstures tabulas "Kopā
 * izpildīts šajā periodā" ExecutionRecords.tsx, kas summē jēlos daudzumus un
 * tāpēc jēgpilna tikai vienas mērvienības sadaļām). Lieto pozīcijas
 * PAŠREIZĒJO vienības izmaksu (currentItemsById), nevis vēsturisko cenu akta
 * brīdī, kas netiek glabāta atsevišķi - konsekventi ar to, ka arī atlikums
 * rēķina pret pašreizējo daudzumu. Pozīcija, kas currentItemsById nav
 * atrodama, tiek izlaista no summas.
 */
export function computeExecutionRecordValue(record: ExecutionRecord, currentItemsById: Map<string, BoqItem>): number {
  let total = 0;
  for (const entry of record.entries) {
    const item = currentItemsById.get(entry.itemId);
    if (!item) continue;
    total += entry.executedQuantity * itemUnitCost(item);
  }
  return round2(total);
}

export interface ExecutionOverviewRow {
  sectionId: string;
  sectionName: string;
  itemId: string;
  code: string;
  description: string;
  unit: string;
  currentQuantity: number;
  executedToDate: number;
  remainingQuantity: number;
  executedValue: number;
}

/**
 * Izpildes pārskats visām sadaļu pozīcijām, kur ir vismaz kāda izpilde
 * (executedToDate !== 0) - pozīcijas bez izpildes tiek izlaistas, tāpat kā
 * diffAgainstBaseline izlaiž nemainītas pozīcijas. `currentSections` ir
 * ATVASINĀTAIS (bāze + apstiprinātās VO) stāvoklis, lai currentQuantity/
 * remainingQuantity atbilstu tam, kas šobrīd redzams "Tāme" cilnē/eksporta
 * sadaļu lapās.
 */
export function computeExecutionOverview(currentSections: BoqSection[], executionRecords: ExecutionRecord[]): ExecutionOverviewRow[] {
  const rows: ExecutionOverviewRow[] = [];
  for (const section of currentSections) {
    for (const item of section.items) {
      const executedToDate = computeExecutedToDate(executionRecords, item.id);
      if (executedToDate === 0) continue;
      rows.push({
        sectionId: section.id,
        sectionName: section.name,
        itemId: item.id,
        code: item.code,
        description: item.description,
        unit: item.unit,
        currentQuantity: item.quantity,
        executedToDate,
        remainingQuantity: computeRemainingQuantity(item.quantity, executedToDate),
        executedValue: round2(executedToDate * itemUnitCost(item)),
      });
    }
  }
  return rows;
}
