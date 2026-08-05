import { computeAuditLog } from "@tames-modulis/core";
import type { AuditEventType, BoqState } from "@tames-modulis/core";

interface AuditLogProps {
  state: BoqState;
}

const EVENT_LABELS: Record<AuditEventType, string> = {
  baseline_approved: "Bāzes tāme iesaldēta",
  vo_proposed: "VO ierosināta",
  vo_approved: "VO apstiprināta",
  vo_rejected: "VO noraidīta",
  vo_voided: "VO anulēta",
  execution_record_created: "Izpildes akts izveidots",
  execution_record_voided: "Izpildes akts anulēts",
};

function formatDate(iso: string): string {
  // Notikuma datumi nāk gan no pilniem ISO timestampiem (baselineApprovedAt,
  // statusHistory), gan no vienkāršiem "YYYY-MM-DD" laukiem (VO/akta datuma
  // ievades) - Date to pareizi parsē abus, tāpēc UI vienmēr rāda to pašā
  // lokalizētajā formātā, ko jau lieto bāzes iesaldēšanas baneris
  // (ProjectEditor.tsx `toLocaleDateString("lv-LV")`).
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString("lv-LV");
}

/**
 * "Vēsture" cilnes saturs - VIENA hronoloģiska tabula, kas apvieno bāzes
 * iesaldēšanu, katras VO statusa maiņu, un katra izpildes akta izveidi/
 * anulēšanu (skat. `computeAuditLog` un CLAUDE.md "Audita žurnāls (Sesija
 * 28)"). Rāda TIKAI pēc bāzes iesaldēšanas (tāpat kā "Izmaiņas (VO)"/
 * "Izpildes akti" cilnes, skat. ProjectEditor.tsx). Nav virtualizēta - notikumu
 * skaits ir mazuma kārtā desmitiem/simtos, nevis tūkstošos kā pozīciju
 * tabulām (skat. CLAUDE.md "Pozīciju tabulas virtualizācija" pamatojumu, kāpēc
 * TĀ tabula to vajadzēja).
 */
export function AuditLog({ state }: AuditLogProps) {
  const events = computeAuditLog(state);

  return (
    <div className="audit-log">
      {events.length === 0 ? (
        <p className="hint">Vēl nav neviena audita notikuma.</p>
      ) : (
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>Datums</th>
              <th>Notikums</th>
              <th>Atsauce</th>
              <th>Persona</th>
              <th>Piezīme</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, i) => (
              <tr key={`${event.refId}-${event.type}-${i}`}>
                <td>{formatDate(event.date)}</td>
                <td>{EVENT_LABELS[event.type]}</td>
                <td>{event.refLabel}</td>
                <td>{event.actor ?? "-"}</td>
                <td>{event.detail ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
