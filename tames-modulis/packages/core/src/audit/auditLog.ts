import type { BoqState } from "../models/boq.js";

/**
 * Notikuma veids audita žurnālā - viens ieraksts katrai bāzes iesaldēšanas,
 * VO statusa maiņas, vai izpildes akta izveides/anulēšanas darbībai. Skat.
 * CLAUDE.md "Audita žurnāls (Sesija 28)" pilnu semantiku.
 */
export type AuditEventType =
  | "baseline_approved"
  | "vo_proposed"
  | "vo_approved"
  | "vo_rejected"
  | "vo_voided"
  | "execution_record_created"
  | "execution_record_voided";

export interface AuditEvent {
  type: AuditEventType;
  /** ISO datums, kad notikums notika. */
  date: string;
  /** VO/akta `id`, vai "baseline" bāzes iesaldēšanas notikumam. */
  refId: string;
  /** Cilvēklasāma atsauce, piem. "VO-3" vai "Akts: 2026-02". */
  refLabel: string;
  /** Kurš instruēja/apstiprināja - null, ja avota laukam nav vērtības (piem. bāzes iesaldēšanai nav atsevišķa apstiprinātāja lauka, skat. "Nākamās sesijas" CLAUDE.md). */
  actor: string | null;
  /** Pamatojums/iemesls/periods, kur pieejams - citādi null. */
  detail: string | null;
}

const VO_STATUS_EVENT_TYPE: Record<Exclude<AuditEventType, "baseline_approved" | "execution_record_created" | "execution_record_voided">, true> = {
  vo_proposed: true,
  vo_approved: true,
  vo_rejected: true,
  vo_voided: true,
};

function voStatusEventType(status: string): AuditEventType {
  const type = `vo_${status}` as AuditEventType;
  if (!(type in VO_STATUS_EVENT_TYPE)) {
    throw new Error(`Nezināms VariationOrderStatus statusHistory ierakstā: ${status}`);
  }
  return type;
}

/**
 * Apvieno visus BoqState notikumus (bāzes iesaldēšana, katras VO statusa
 * maiņas, katra izpildes akta izveide/anulēšana) VIENĀ hronoloģiskā sarakstā
 * - skat. CLAUDE.md "Audita žurnāls (Sesija 28)". Tīra funkcija, nemaina
 * `state`, tāpēc droši izsaucama tieši UI renderā (skat.
 * `computeExecutionOverview`/`diffAgainstBaseline` tāda pati konvencija).
 * Sakārtots JAUNĀKAIS PIRMS (dilstošā secībā pēc `date`).
 */
export function computeAuditLog(state: BoqState): AuditEvent[] {
  const events: AuditEvent[] = [];

  if (state.baselineApprovedAt !== null) {
    events.push({
      type: "baseline_approved",
      date: state.baselineApprovedAt,
      refId: "baseline",
      refLabel: "Bāzes tāme",
      actor: null,
      detail: null,
    });
  }

  for (const vo of state.variationOrders) {
    for (const historyEntry of vo.statusHistory) {
      const isVoided = historyEntry.status === "voided";
      events.push({
        type: voStatusEventType(historyEntry.status),
        date: historyEntry.date,
        refId: vo.id,
        refLabel: vo.number,
        actor: vo.instructedBy || null,
        detail: (isVoided ? vo.voidedReason : vo.justification) || null,
      });
    }
  }

  for (const record of state.executionRecords) {
    events.push({
      type: "execution_record_created",
      date: record.date,
      refId: record.id,
      refLabel: `Akts: ${record.period}`,
      actor: record.approvedBy || null,
      detail: record.period || null,
    });
    if (record.voidedAt !== null) {
      events.push({
        type: "execution_record_voided",
        date: record.voidedAt,
        refId: record.id,
        refLabel: `Akts: ${record.period}`,
        actor: null,
        detail: record.voidedReason,
      });
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));
  return events;
}
