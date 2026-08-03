import { createExecutionRecord, deriveCurrentSections } from "@tames-modulis/core";
import type { BoqState, ExecutionRecordEntry } from "@tames-modulis/core";
import type { ParsedExecutionActSheet } from "@tames-modulis/core/excel";
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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

/** Module shape from the dynamically-imported "@tames-modulis/core/excel" entry point (see "Bundle izmērs / code-splitting" in CLAUDE.md) - `typeof import(...)` is a type-only reference, it doesn't itself trigger the runtime import. */
type ExcelModule = typeof import("@tames-modulis/core/excel");

interface ActImportState {
  sheets: ParsedExecutionActSheet[];
  mapping: Record<string, string | null>;
  recordForm: RecordFormState;
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
  const [actImport, setActImport] = useState<ActImportState | null>(null);
  const [actImportLoading, setActImportLoading] = useState(false);
  const [actImportError, setActImportError] = useState<string | null>(null);
  const excelModuleRef = useRef<ExcelModule | null>(null);
  const actFileInputRef = useRef<HTMLInputElement>(null);

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

  // Parsing/matching is derived here (not stored in state) so adjusting the
  // sheet -> sadaļa dropdown mapping in the preview immediately recomputes
  // matched/unmatched counts without re-parsing the file.
  const actMatches = useMemo(() => {
    if (!actImport || !excelModuleRef.current) return null;
    return excelModuleRef.current.matchExecutionActToProject(actImport.sheets, currentSections, actImport.mapping);
  }, [actImport, currentSections]);

  const handleActFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    setActImportError(null);
    setActImportLoading(true);
    try {
      // Same dynamic-import-only-on-use approach as export/tāmes imports
      // (see "Bundle izmērs / code-splitting" in CLAUDE.md) - parsing pulls
      // in exceljs, so this stays lazy.
      const mod = await import("@tames-modulis/core/excel");
      excelModuleRef.current = mod;
      const buffer = await file.arrayBuffer();
      const sheets = await mod.parseExecutionActBuffer(buffer);
      if (sheets.length === 0) {
        setActImportError('Failā netika atrasta neviena akta lapa ar izpildi šajā periodā ("Izpildīts atskaites periodā" kolonna).');
        return;
      }
      const mapping = mod.suggestSheetToSectionMapping(sheets, currentSections);
      setActImport({ sheets, mapping, recordForm: emptyRecordForm() });
    } catch (err) {
      setActImportError(`Kļūda nolasot failu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActImportLoading(false);
    }
  };

  const updateActMapping = (sheetName: string, sectionId: string | null) => {
    setActImport((current) => (current ? { ...current, mapping: { ...current.mapping, [sheetName]: sectionId } } : current));
  };

  const handleConfirmActImport = () => {
    if (!actImport || !actMatches || !actImport.recordForm.period.trim()) return;
    const entries = actMatches.flatMap((m) => m.entries);
    const created = { ...createExecutionRecord(actImport.recordForm), entries };
    onUpdate((s) => ({ ...s, executionRecords: [...s.executionRecords, created] }));
    setActImport(null);
  };

  const totalUnmatched = actMatches?.reduce((sum, m) => sum + m.unmatchedRows.length, 0) ?? 0;
  const totalMatched = actMatches?.reduce((sum, m) => sum + m.entries.length, 0) ?? 0;

  return (
    <div className="execution-records">
      {actImportError && <p className="error">{actImportError}</p>}
      {actImport ? (
        <div className="execution-record-form">
          <h3>Izpildes akta imports (Excel)</h3>
          <p className="hint">
            Katrai akta lapai izvēlēta sadaļa pēc nosaukuma sakritības - pārbaudi/izlabo pirms apstiprināšanas. Lapas, kurām nav
            izvēlēta sadaļa ("— izlaist —"), netiek importētas.
          </p>
          <div className="execution-record-form-grid">
            <label>
              Periods
              <input
                placeholder='piem. "2021-02" vai "Akts Nr. 5"'
                value={actImport.recordForm.period}
                onChange={(e) => setActImport((cur) => (cur ? { ...cur, recordForm: { ...cur.recordForm, period: e.target.value } } : cur))}
              />
            </label>
            <label>
              Datums
              <input
                type="date"
                value={actImport.recordForm.date}
                onChange={(e) => setActImport((cur) => (cur ? { ...cur, recordForm: { ...cur.recordForm, date: e.target.value } } : cur))}
              />
            </label>
            <label>
              Apstiprināja
              <input
                value={actImport.recordForm.approvedBy}
                onChange={(e) => setActImport((cur) => (cur ? { ...cur, recordForm: { ...cur.recordForm, approvedBy: e.target.value } } : cur))}
              />
            </label>
          </div>

          <table className="execution-history-table">
            <thead>
              <tr>
                <th>Akta lapa</th>
                <th>Sadaļa</th>
                <th>Sakrita</th>
                <th>Nesakrita</th>
              </tr>
            </thead>
            <tbody>
              {actImport.sheets.map((sheet) => {
                const match = actMatches?.find((m) => m.sheetName === sheet.sheetName);
                return (
                  <tr key={sheet.sheetName}>
                    <td>
                      {sheet.sheetName} ({sheet.rows.length})
                    </td>
                    <td>
                      <select
                        value={actImport.mapping[sheet.sheetName] ?? ""}
                        onChange={(e) => updateActMapping(sheet.sheetName, e.target.value || null)}
                      >
                        <option value="">— izlaist —</option>
                        {currentSections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{match?.entries.length ?? 0}</td>
                    <td>{match?.unmatchedRows.length ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalUnmatched > 0 && (
            <p className="baseline-banner">
              Brīdinājums: {totalUnmatched} pozīcija(s) neatrada atbilstību izvēlētajā sadaļā (nesakrīt "Nr." kods) un netiks
              importētas.
            </p>
          )}

          <div className="execution-record-form-actions">
            <button onClick={handleConfirmActImport} disabled={!actImport.recordForm.period.trim() || totalMatched === 0}>
              Apstiprināt importu ({totalMatched} pozīcijas)
            </button>
            <button onClick={() => setActImport(null)}>Atcelt</button>
          </div>
        </div>
      ) : !isCreating ? (
        <div className="execution-records-actions">
          <button onClick={openCreateForm}>+ Jauns izpildes akts</button>
          <button onClick={() => actFileInputRef.current?.click()} disabled={actImportLoading}>
            {actImportLoading ? "Ielasa..." : "Importēt izpildes aktu (Excel)"}
          </button>
          <input ref={actFileInputRef} type="file" accept=".xlsx" hidden onChange={(e) => void handleActFileChange(e)} />
        </div>
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
