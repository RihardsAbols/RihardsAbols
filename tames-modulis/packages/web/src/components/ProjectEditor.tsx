import { summarizeBoq } from "@tames-modulis/core";
import type { BoqItem, BoqSection, BoqState, StorageAdapter } from "@tames-modulis/core";
import { useEffect, useState } from "react";

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
  return { id: crypto.randomUUID(), name: "Jauna sadaļa", items: [] };
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
  const [status, setStatus] = useState<string | null>(null);

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
        </div>
      </div>
      {status && <p className="status">{status}</p>}

      <div className="rates">
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
                className="section-name"
                value={section.name}
                onChange={(e) => updateSectionName(sectionIndex, e.target.value)}
              />
              <button onClick={() => removeSection(sectionIndex)}>Dzēst sadaļu</button>
            </div>

            <table className="items-table">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Nosaukums</th>
                  <th>Mērv.</th>
                  <th>Daudz.</th>
                  <th>Darba alga</th>
                  <th>Materiāli</th>
                  <th>Mehānismi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, itemIndex) => (
                  <tr key={item.id}>
                    <td>
                      <input value={item.code} onChange={(e) => updateItem(sectionIndex, itemIndex, { code: e.target.value })} />
                    </td>
                    <td>
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(sectionIndex, itemIndex, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="unit-input"
                        value={item.unit}
                        onChange={(e) => updateItem(sectionIndex, itemIndex, { unit: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="number-input"
                        value={item.quantity}
                        onChange={(e) => updateItem(sectionIndex, itemIndex, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="number-input"
                        value={item.unitLaborCost}
                        onChange={(e) => updateItem(sectionIndex, itemIndex, { unitLaborCost: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="number-input"
                        value={item.unitMaterialsCost}
                        onChange={(e) =>
                          updateItem(sectionIndex, itemIndex, { unitMaterialsCost: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="number-input"
                        value={item.unitMechanismsCost}
                        onChange={(e) =>
                          updateItem(sectionIndex, itemIndex, { unitMechanismsCost: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <button aria-label="Dzēst pozīciju" onClick={() => removeItem(sectionIndex, itemIndex)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => addItem(sectionIndex)}>+ Pozīcija</button>

            <div className="section-summary">
              Tiešās izmaksas: {eur(sectionSummary.directTotal)} · Virsizdevumi: {eur(sectionSummary.overhead)} · Peļņa:{" "}
              {eur(sectionSummary.profit)} · Pavisam: {eur(sectionSummary.totalWithMarkup)}
            </div>
          </div>
        );
      })}

      <button onClick={addSection}>+ Sadaļa</button>

      <div className="project-summary">
        <p>Tiešās izmaksas: {eur(summary.directTotal)}</p>
        <p>Virsizdevumi: {eur(summary.overhead)}</p>
        <p>Peļņa: {eur(summary.profit)}</p>
        <p>Pavisam (bez PVN): {eur(summary.subtotal)}</p>
        <p>PVN: {eur(summary.vatAmount)}</p>
        <p className="grand-total">KOPĀ AR PVN: {eur(summary.total)}</p>
      </div>
    </div>
  );
}
