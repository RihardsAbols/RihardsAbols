import { createExecutionRecord, deriveCurrentSections } from "@tames-modulis/core";
import type { BoqState, ExecutionRecordEntry } from "@tames-modulis/core";
import { useState } from "react";
import { ExecutionEntryTable } from "./ExecutionEntryTable.js";

interface ExecutionRecordsProps {
  state: BoqState;
  onUpdate: (updater: (s: BoqState) => BoqState) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RecordFormState {
  period: string;
  date: string;
  approvedBy: string;
}

function emptyRecordForm(): RecordFormState {
  return { period: "", date: todayIso(), approvedBy: "" };
}

/**
 * "Izpildes akti" cilne - katra atskaites perioda (piem. mēneša) izpildīto un
 * inženiera apstiprināto daudzumu ievade, un vēsture. Rāda TIKAI, kad
 * projektam ir iesaldēta bāze (skat. ProjectEditor.tsx) - tāpat kā "Izmaiņas
 * (VO)" cilne, jo izpilde notiek pret apstiprināto (bāze + apstiprinātās VO)
 * apjomu. Kumulatīvais "izpildīts līdz šim"/"atlikums" vienmēr atvasināts no
 * `state.executionRecords` (skat. CLAUDE.md "Tāmes izmaiņu (Variation Order)
 * vadība") - šeit netiek glabāts atsevišķi.
 *
 * Aktā ievadītās pozīcijas ir virtualizētas pa sadaļām
 * (`ExecutionEntryTable.tsx`, tā pati tehnika kā `ItemsTable.tsx`) - ļoti
 * lielam projektam (tūkstošiem pozīciju, skat. PROGRESS.md Sesija 12) šī
 * forma citādi palēninātos tāpat, kā `ItemsTable` pirms Sesijas 13
 * virtualizācijas.
 */
export function ExecutionRecords({ state, onUpdate }: ExecutionRecordsProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [recordForm, setRecordForm] = useState<RecordFormState>(emptyRecordForm());
  const [entryQuantities, setEntryQuantities] = useState<Record<string, string>>({});

  const approvedVariationOrders = state.variationOrders.filter((vo) => vo.status === "approved");
  const currentSections = deriveCurrentSections(state.sections, approvedVariationOrders);

  const openCreateForm = () => {
    setIsCreating(true);
    setRecordForm(emptyRecordForm());
    setEntryQuantities({});
  };

  const handleSaveRecord = () => {
    if (!recordForm.period.trim()) return;
    const entries: ExecutionRecordEntry[] = [];
    for (const section of currentSections) {
      for (const item of section.items) {
        const raw = entryQuantities[item.id];
        const value = raw ? Number(raw) : 0;
        if (value !== 0) {
          entries.push({ id: crypto.randomUUID(), sectionId: section.id, itemId: item.id, executedQuantity: value });
        }
      }
    }
    const created = { ...createExecutionRecord(recordForm), entries };
    onUpdate((s) => ({ ...s, executionRecords: [...s.executionRecords, created] }));
    setIsCreating(false);
  };

  return (
    <div className="execution-records">
      {!isCreating ? (
        <button onClick={openCreateForm}>+ Jauns izpildes akts</button>
      ) : (
        <div className="execution-record-form">
          <h3>Jauns izpildes akts</h3>
          <div className="execution-record-form-grid">
            <label>
              Periods
              <input
                placeholder='piem. "2026-01" vai "Akts Nr. 5"'
                value={recordForm.period}
                onChange={(e) => setRecordForm((f) => ({ ...f, period: e.target.value }))}
              />
            </label>
            <label>
              Datums
              <input type="date" value={recordForm.date} onChange={(e) => setRecordForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label>
              Apstiprināja
              <input value={recordForm.approvedBy} onChange={(e) => setRecordForm((f) => ({ ...f, approvedBy: e.target.value }))} />
            </label>
          </div>

          {currentSections.map((section) => (
            <div className="execution-entry-section" key={section.id}>
              <h4>{section.name}</h4>
              <ExecutionEntryTable
                items={section.items}
                executionRecords={state.executionRecords}
                entryQuantities={entryQuantities}
                onChangeQuantity={(itemId, value) => setEntryQuantities((q) => ({ ...q, [itemId]: value }))}
              />
            </div>
          ))}

          <div className="execution-record-form-actions">
            <button onClick={handleSaveRecord} disabled={!recordForm.period.trim()}>
              Saglabāt aktu
            </button>
            <button onClick={() => setIsCreating(false)}>Atcelt</button>
          </div>
        </div>
      )}

      <h3>Izpildes aktu vēsture</h3>
      {state.executionRecords.length === 0 ? (
        <p className="hint">Vēl nav neviena izpildes akta.</p>
      ) : (
        <table className="execution-history-table">
          <thead>
            <tr>
              <th>Periods</th>
              <th>Datums</th>
              <th>Apstiprināja</th>
              <th>Pozīcijas</th>
              <th>Kopā izpildīts šajā periodā</th>
            </tr>
          </thead>
          <tbody>
            {state.executionRecords.map((record) => {
              const total = record.entries.reduce((sum, e) => sum + e.executedQuantity, 0);
              return (
                <tr key={record.id}>
                  <td>{record.period}</td>
                  <td>{record.date}</td>
                  <td>{record.approvedBy || "-"}</td>
                  <td>{record.entries.length}</td>
                  <td>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
