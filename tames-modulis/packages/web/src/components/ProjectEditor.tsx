import { summarizeBoq } from "@tames-modulis/core";
import type { BoqItem, BoqSection, BoqState, CompanyDetails, StorageAdapter } from "@tames-modulis/core";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ItemsTable } from "./ItemsTable.js";

interface ProjectEditorProps {
  adapter: StorageAdapter;
  projectId: string;
  onSaved: () => void;
}

function newItem(): BoqItem {
  return {
    id: crypto.randomUUID(),
    code: "",
    description: "",
    unit: "",
    quantity: 0,
    unitLaborCost: 0,
    unitMaterialsCost: 0,
    unitMechanismsCost: 0,
  };
}

function newSection(): BoqSection {
  return { id: crypto.randomUUID(), name: "Jauna sadaļa", estimateNumber: "", items: [] };
}

function eur(value: number): string {
  return `${value.toFixed(2)} €`;
}

/**
 * Chromium falls back to a generic "download" filename when the `download`
 * attribute contains non-ASCII characters (verified: identical blob/anchor
 * setup with an ASCII name downloads correctly, with a diacritic it doesn't)
 * - and Latvian project names routinely contain diacritics. Strip them so
 * the suggested filename survives; the project's real name stays intact
 * inside the file itself.
 */
function toAsciiFileName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim();
  return stripped || "tame";
}

export function ProjectEditor({ adapter, projectId, onSaved }: ProjectEditorProps) {
  const [state, setState] = useState<BoqState | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setStatus(null);
    adapter.load(projectId).then((loaded) => {
      if (!cancelled) setState(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, projectId]);

  if (!state) {
    return <p>Ielādē projektu...</p>;
  }

  const summary = summarizeBoq(state);
  const update = (updater: (s: BoqState) => BoqState) => setState((prev) => (prev ? updater(prev) : prev));

  const updateItem = (sectionIndex: number, itemIndex: number, patch: Partial<BoqItem>) =>
    update((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i === sectionIndex
          ? { ...sec, items: sec.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)) }
          : sec,
      ),
    }));

  const removeItem = (sectionIndex: number, itemIndex: number) =>
    update((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i === sectionIndex ? { ...sec, items: sec.items.filter((_, j) => j !== itemIndex) } : sec,
      ),
    }));

  const addItem = (sectionIndex: number) =>
    update((s) => ({
      ...s,
      sections: s.sections.map((sec, i) => (i === sectionIndex ? { ...sec, items: [...sec.items, newItem()] } : sec)),
    }));

  const updateSectionName = (sectionIndex: number, name: string) =>
    update((s) => ({
      ...s,
      sections: s.sections.map((sec, i) => (i === sectionIndex ? { ...sec, name } : sec)),
    }));

  const updateSectionEstimateNumber = (sectionIndex: number, estimateNumber: string) =>
    update((s) => ({
      ...s,
      sections: s.sections.map((sec, i) => (i === sectionIndex ? { ...sec, estimateNumber } : sec)),
    }));

  const updateContractor = (patch: Partial<CompanyDetails>) =>
    update((s) => ({ ...s, contractor: { ...s.contractor, ...patch } }));

  const updateClient = (patch: Partial<CompanyDetails>) =>
    update((s) => ({ ...s, client: { ...s.client, ...patch } }));

  const removeSection = (sectionIndex: number) =>
    update((s) => ({ ...s, sections: s.sections.filter((_, i) => i !== sectionIndex) }));

  const addSection = () => update((s) => ({ ...s, sections: [...s.sections, newSection()] }));

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const toSave: BoqState = { ...state, updatedAt: new Date().toISOString() };
      await adapter.save(projectId, toSave);
      setState(toSave);
      onSaved();
      setStatus("Saglabāts.");
    } catch (err) {
      setStatus(`Kļūda saglabājot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setStatus(null);
    setExporting(true);
    try {
      // Dynamic import so exceljs (a large dependency) is only fetched when
      // someone actually clicks export, instead of bloating the initial
      // page load for everyone who never uses it.
      const { exportBoqToBuffer } = await import("@tames-modulis/core/excel");
      const buffer = await exportBoqToBuffer(state);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${toAsciiFileName(state.projectName)}.xlsx`;
      // Some browsers only honor the download filename reliably when the
      // anchor is actually in the DOM at click time.
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus(`Kļūda eksportējot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    if (
      !confirm(
        `Importēt "${file.name}" pārrakstīs VISAS pašreizējās sadaļas un pozīcijas projektā "${state.projectName}" ` +
          "(projekta nosaukums, likmes un citi projekti netiek skarti). Izmaiņas jāapstiprina ar \"Saglabāt\". Turpināt?",
      )
    ) {
      return;
    }

    setStatus(null);
    setImporting(true);
    try {
      // Same dynamic-import-only-on-use approach as export (see
      // "Bundle izmērs / code-splitting" in CLAUDE.md) - importBoqFromBuffer
      // pulls in exceljs, so this stays lazy.
      const { importBoqFromBuffer } = await import("@tames-modulis/core/excel");
      const buffer = await file.arrayBuffer();
      const imported = await importBoqFromBuffer(buffer, state.projectId, state.projectName);
      // Overwrite semantics: only sections are replaced. Project id, name,
      // rates, and other metadata are kept as-is - confirmed with the user
      // (see PROGRESS.md Session 14) rather than merging/appending sections.
      update((s) => ({ ...s, sections: imported.sections }));
      setStatus(`Importēts: ${imported.sections.length} sadaļas. Nospied "Saglabāt", lai saglabātu izmaiņas.`);
    } catch (err) {
      setStatus(`Kļūda importējot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="project-editor">
      <div className="editor-header">
        <input
          className="project-name"
          value={state.projectName}
          onChange={(e) => update((s) => ({ ...s, projectName: e.target.value }))}
        />
        <div className="editor-actions">
          <button onClick={handleSave} disabled={saving}>
            {saving ? "Saglabā..." : "Saglabāt"}
          </button>
          <button onClick={handleExport} disabled={exporting}>
            {exporting ? "Sagatavo..." : "Eksportēt Excel"}
          </button>
          <button onClick={() => importFileInputRef.current?.click()} disabled={importing}>
            {importing ? "Importē..." : "Importēt Excel (pārrakstīt sadaļas)"}
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => void handleImportFileChange(e)}
          />
        </div>
      </div>
      {status && <p className="status">{status}</p>}

      <details className="project-details">
        <summary>Projekta rekvizīti (Excel eksportam)</summary>
        <div className="details-grid">
          <fieldset>
            <legend>Būvuzņēmējs</legend>
            <label>
              Nosaukums
              <input value={state.contractor.name} onChange={(e) => updateContractor({ name: e.target.value })} />
            </label>
            <label>
              Reģ. Nr.
              <input value={state.contractor.regNr} onChange={(e) => updateContractor({ regNr: e.target.value })} />
            </label>
            <label>
              Adrese
              <input
                value={state.contractor.address}
                onChange={(e) => updateContractor({ address: e.target.value })}
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Pasūtītājs</legend>
            <label>
              Nosaukums
              <input value={state.client.name} onChange={(e) => updateClient({ name: e.target.value })} />
            </label>
            <label>
              Reģ. Nr.
              <input value={state.client.regNr} onChange={(e) => updateClient({ regNr: e.target.value })} />
            </label>
            <label>
              Adrese
              <input value={state.client.address} onChange={(e) => updateClient({ address: e.target.value })} />
            </label>
          </fieldset>
          <label>
            Sastādīja (vārds, uzvārds)
            <input value={state.preparedBy} onChange={(e) => update((s) => ({ ...s, preparedBy: e.target.value }))} />
          </label>
          <label>
            Pārbaudīja (vārds, uzvārds)
            <input value={state.checkedBy} onChange={(e) => update((s) => ({ ...s, checkedBy: e.target.value }))} />
          </label>
        </div>
      </details>

      <div className="rates">
        <label>
          Atlaide (%)
          <input
            type="number"
            step="0.1"
            value={state.discountRate * 100}
            onChange={(e) => update((s) => ({ ...s, discountRate: Number(e.target.value) / 100 }))}
          />
        </label>
        <label>
          Virsizdevumi (%)
          <input
            type="number"
            step="0.1"
            value={state.overheadRate * 100}
            onChange={(e) => update((s) => ({ ...s, overheadRate: Number(e.target.value) / 100 }))}
          />
        </label>
        <label>
          Peļņa (%)
          <input
            type="number"
            step="0.1"
            value={state.profitRate * 100}
            onChange={(e) => update((s) => ({ ...s, profitRate: Number(e.target.value) / 100 }))}
          />
        </label>
        <label>
          PVN (%)
          <input
            type="number"
            step="0.1"
            value={state.vatRate * 100}
            onChange={(e) => update((s) => ({ ...s, vatRate: Number(e.target.value) / 100 }))}
          />
        </label>
      </div>

      {state.sections.map((section, sectionIndex) => {
        const sectionSummary = summary.sections[sectionIndex];
        return (
          <div className="section" key={section.id}>
            <div className="section-header">
              <input
                className="section-estimate-number"
                placeholder="Nr."
                title="Tāmes numurs (piem. 1-1)"
                value={section.estimateNumber}
                onChange={(e) => updateSectionEstimateNumber(sectionIndex, e.target.value)}
              />
              <input
                className="section-name"
                value={section.name}
                onChange={(e) => updateSectionName(sectionIndex, e.target.value)}
              />
              <button onClick={() => removeSection(sectionIndex)}>Dzēst sadaļu</button>
            </div>

            <ItemsTable
              items={section.items}
              onUpdateItem={(itemIndex, patch) => updateItem(sectionIndex, itemIndex, patch)}
              onRemoveItem={(itemIndex) => removeItem(sectionIndex, itemIndex)}
            />
            <button onClick={() => addItem(sectionIndex)}>+ Pozīcija</button>

            <div className="section-summary">
              Tiešās izmaksas: {eur(sectionSummary.directTotal)}
              {state.discountRate !== 0 && <> · Atlaide: {eur(sectionSummary.discountAmount)}</>} · Virsizdevumi:{" "}
              {eur(sectionSummary.overhead)} · Peļņa: {eur(sectionSummary.profit)} · Pavisam:{" "}
              {eur(sectionSummary.totalWithMarkup)}
            </div>
          </div>
        );
      })}

      <button onClick={addSection}>+ Sadaļa</button>

      <div className="project-summary">
        <p>Tiešās izmaksas: {eur(summary.directTotal)}</p>
        {state.discountRate !== 0 && <p>Atlaide: -{eur(summary.discountAmount)}</p>}
        <p>Virsizdevumi: {eur(summary.overhead)}</p>
        <p>Peļņa: {eur(summary.profit)}</p>
        <p>Pavisam (bez PVN): {eur(summary.subtotal)}</p>
        <p>PVN: {eur(summary.vatAmount)}</p>
        <p className="grand-total">KOPĀ AR PVN: {eur(summary.total)}</p>
      </div>
    </div>
  );
}
