import type { ExecutionRecord } from "../models/executionRecord.js";

/**
 * Kumulatīvais izpildītais daudzums pozīcijai VISOS izpildes aktos
 * (visos periodos kopā) - vienmēr atvasināts no akta ierakstiem, nekad
 * glabāts atsevišķi (skat. models/boq.ts BoqState.executionRecords).
 */
export function computeExecutedToDate(executionRecords: ExecutionRecord[], itemId: string): number {
  let total = 0;
  for (const record of executionRecords) {
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
    createdAt: now,
    updatedAt: now,
  };
}
