import {
  computeVariationOrderDirectTotalImpact,
  createVariationOrder,
  deriveCurrentSections,
  diffAgainstBaseline,
} from "@tames-modulis/core";
import type { BoqState, VariationOrder, VariationOrderChange } from "@tames-modulis/core";
import { useState } from "react";

interface VariationOrdersProps {
  state: BoqState;
  onUpdate: (updater: (s: BoqState) => BoqState) => void;
}

function eur(value: number): string {
  return `${value.toFixed(2)} €`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

const STATUS_LABELS: Record<VariationOrder["status"], string> = {
  proposed: "Ierosināts",
  approved: "Apstiprināts",
  rejected: "Noraidīts",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface NewVoFormState {
  title: string;
  justification: string;
  instructedBy: string;
  date: string;
}

function emptyVoForm(): NewVoFormState {
  return { title: "", justification: "", instructedBy: "", date: todayIso() };
}

interface ChangeFormState {
  sectionId: string;
  /** "" nozīmē "jauna pozīcija" (skat. itemId === null models/variationOrder.ts). */
  itemId: string;
  quantityDelta: string;
  excluded: boolean;
  newCode: string;
  newDescription: string;
  newUnit: string;
  newQuantity: string;
  newUnitLaborCost: string;
  newUnitMaterialsCost: string;
  newUnitMechanismsCost: string;
}

function emptyChangeForm(firstSectionId: string): ChangeFormState {
  return {
    sectionId: firstSectionId,
    itemId: "",
    quantityDelta: "0",
    excluded: false,
    newCode: "",
    newDescription: "",
    newUnit: "",
    newQuantity: "0",
    newUnitLaborCost: "0",
    newUnitMaterialsCost: "0",
    newUnitMechanismsCost: "0",
  };
}

/**
 * "Izmaiņu" cilne - tāmes izmaiņu (Variation Order) izveide/apstiprināšana un
 * bāzes/pašreizējā stāvokļa diff skats. Rāda TIKAI, kad projektam ir
 * iesaldēta bāze (state.baselineApprovedAt !== null, skat.
 * ProjectEditor.tsx) - VO jēdziens bez bāzes nav definēts. Visas izmaiņas iet
 * caur `onUpdate` (tas pats `update` no ProjectEditor.tsx) - nesaglabā
 * automātiski, tāpat kā jebkura cita rediģēšana (skat. CLAUDE.md "Imports
 * esošā projektā" par to pašu konvenciju).
 */
export function VariationOrders({ state, onUpdate }: VariationOrdersProps) {
  const [voForm, setVoForm] = useState<NewVoFormState>(emptyVoForm());
  const [openChangeFormFor, setOpenChangeFormFor] = useState<string | null>(null);
  const [changeForm, setChangeForm] = useState<ChangeFormState>(emptyChangeForm(state.sections[0]?.id ?? ""));

  const approvedVariationOrders = state.variationOrders.filter((vo) => vo.status === "approved");
  const currentSections = deriveCurrentSections(state.sections, approvedVariationOrders);
  const currentSectionsById = new Map(currentSections.map((s) => [s.id, s]));
  const diffRows = diffAgainstBaseline(state.sections, currentSections);

  const handleCreateVo = () => {
    if (!voForm.title.trim()) return;
    const created = createVariationOrder(state.variationOrders, voForm);
    onUpdate((s) => ({ ...s, variationOrders: [...s.variationOrders, created] }));
    setVoForm(emptyVoForm());
  };

  const handleSetStatus = (voId: string, status: VariationOrder["status"]) => {
    const now = new Date().toISOString();
    onUpdate((s) => ({
      ...s,
      variationOrders: s.variationOrders.map((vo) => (vo.id === voId ? { ...vo, status, statusDate: now, updatedAt: now } : vo)),
    }));
  };

  const handleRemoveChange = (voId: string, changeId: string) => {
    const now = new Date().toISOString();
    onUpdate((s) => ({
      ...s,
      variationOrders: s.variationOrders.map((vo) =>
        vo.id === voId ? { ...vo, changes: vo.changes.filter((c) => c.id !== changeId), updatedAt: now } : vo,
      ),
    }));
  };

  const openAddChange = (voId: string) => {
    setOpenChangeFormFor(voId);
    setChangeForm(emptyChangeForm(state.sections[0]?.id ?? ""));
  };

  const handleAddChange = (voId: string) => {
    let change: VariationOrderChange;
    if (changeForm.itemId === "") {
      if (!changeForm.newDescription.trim()) return;
      change = {
        id: crypto.randomUUID(),
        sectionId: changeForm.sectionId,
        itemId: null,
        quantityDelta: 0,
        excluded: false,
        newItem: {
          code: changeForm.newCode,
          description: changeForm.newDescription,
          unit: changeForm.newUnit,
          quantity: Number(changeForm.newQuantity),
          unitLaborCost: Number(changeForm.newUnitLaborCost),
          unitMaterialsCost: Number(changeForm.newUnitMaterialsCost),
          unitMechanismsCost: Number(changeForm.newUnitMechanismsCost),
        },
      };
    } else {
      change = {
        id: crypto.randomUUID(),
        sectionId: changeForm.sectionId,
        itemId: changeForm.itemId,
        quantityDelta: changeForm.excluded ? 0 : Number(changeForm.quantityDelta),
        excluded: changeForm.excluded,
        newItem: null,
      };
    }

    const now = new Date().toISOString();
    onUpdate((s) => ({
      ...s,
      variationOrders: s.variationOrders.map((vo) => (vo.id === voId ? { ...vo, changes: [...vo.changes, change], updatedAt: now } : vo)),
    }));
    setOpenChangeFormFor(null);
  };

  return (
    <div className="variation-orders">
      <div className="vo-new-form">
        <h3>Jauna tāmes izmaiņa (VO)</h3>
        <div className="vo-new-form-grid">
          <label>
            Nosaukums
            <input value={voForm.title} onChange={(e) => setVoForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label>
            Instruēja
            <input value={voForm.instructedBy} onChange={(e) => setVoForm((f) => ({ ...f, instructedBy: e.target.value }))} />
          </label>
          <label>
            Datums
            <input type="date" value={voForm.date} onChange={(e) => setVoForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <label className="vo-justification-field">
            Pamatojums
            <textarea value={voForm.justification} onChange={(e) => setVoForm((f) => ({ ...f, justification: e.target.value }))} />
          </label>
        </div>
        <button onClick={handleCreateVo} disabled={!voForm.title.trim()}>
          + Izveidot VO
        </button>
      </div>

      {state.variationOrders.length === 0 && <p className="hint">Vēl nav neviena tāmes izmaiņa.</p>}

      {state.variationOrders.map((vo) => {
        const impact = computeVariationOrderDirectTotalImpact(state.sections, state.variationOrders, vo.id);
        return (
          <div className="vo-card" key={vo.id}>
            <div className="vo-card-header">
              <span className="vo-number">{vo.number}</span>
              <span className="vo-title">{vo.title}</span>
              <span className={`vo-status-badge vo-status-${vo.status}`}>{STATUS_LABELS[vo.status]}</span>
              <span className="vo-impact">Ietekme uz tiešajām izmaksām: {eur(impact)}</span>
            </div>
            <div className="vo-card-meta">
              {vo.date} · Instruēja: {vo.instructedBy || "-"}
            </div>
            {vo.justification && <p className="vo-justification-text">{vo.justification}</p>}

            {vo.changes.length > 0 && (
              <table className="vo-changes-table">
                <thead>
                  <tr>
                    <th>Sadaļa</th>
                    <th>Pozīcija</th>
                    <th>Izmaiņa</th>
                    {vo.status === "proposed" && <th />}
                  </tr>
                </thead>
                <tbody>
                  {vo.changes.map((change) => {
                    const section = state.sections.find((s) => s.id === change.sectionId);
                    const changeLabel =
                      change.itemId === null
                        ? "+ jauna pozīcija"
                        : change.excluded
                          ? "IZSLĒGTA"
                          : `daudzums ${signed(change.quantityDelta)}`;
                    const itemLabel =
                      change.itemId === null
                        ? `${change.newItem?.code ?? ""} ${change.newItem?.description ?? ""}`
                        : (() => {
                            const found = currentSectionsById.get(change.sectionId)?.items.find((i) => i.id === change.itemId);
                            return found ? `${found.code} ${found.description}` : change.itemId;
                          })();
                    return (
                      <tr key={change.id}>
                        <td>{section?.name ?? change.sectionId}</td>
                        <td>{itemLabel}</td>
                        <td>{changeLabel}</td>
                        {vo.status === "proposed" && (
                          <td>
                            <button aria-label="Dzēst izmaiņu" onClick={() => handleRemoveChange(vo.id, change.id)}>
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {vo.status === "proposed" && (
              <div className="vo-actions">
                <button onClick={() => openAddChange(vo.id)}>+ Izmaiņa</button>
                <button onClick={() => handleSetStatus(vo.id, "approved")}>Apstiprināt</button>
                <button onClick={() => handleSetStatus(vo.id, "rejected")}>Noraidīt</button>
              </div>
            )}

            {openChangeFormFor === vo.id && (
              <div className="vo-change-form">
                <label>
                  Sadaļa
                  <select
                    value={changeForm.sectionId}
                    onChange={(e) => setChangeForm((f) => ({ ...f, sectionId: e.target.value, itemId: "" }))}
                  >
                    {state.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pozīcija
                  <select value={changeForm.itemId} onChange={(e) => setChangeForm((f) => ({ ...f, itemId: e.target.value }))}>
                    <option value="">+ Jauna pozīcija</option>
                    {(currentSectionsById.get(changeForm.sectionId)?.items ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} - {item.description.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </label>

                {changeForm.itemId === "" ? (
                  <div className="vo-change-new-item">
                    <label>
                      Kods
                      <input value={changeForm.newCode} onChange={(e) => setChangeForm((f) => ({ ...f, newCode: e.target.value }))} />
                    </label>
                    <label>
                      Nosaukums
                      <input
                        value={changeForm.newDescription}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newDescription: e.target.value }))}
                      />
                    </label>
                    <label>
                      Mērv.
                      <input value={changeForm.newUnit} onChange={(e) => setChangeForm((f) => ({ ...f, newUnit: e.target.value }))} />
                    </label>
                    <label>
                      Daudzums
                      <input
                        type="number"
                        value={changeForm.newQuantity}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newQuantity: e.target.value }))}
                      />
                    </label>
                    <label>
                      Darba alga
                      <input
                        type="number"
                        value={changeForm.newUnitLaborCost}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newUnitLaborCost: e.target.value }))}
                      />
                    </label>
                    <label>
                      Materiāli
                      <input
                        type="number"
                        value={changeForm.newUnitMaterialsCost}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newUnitMaterialsCost: e.target.value }))}
                      />
                    </label>
                    <label>
                      Mehānismi
                      <input
                        type="number"
                        value={changeForm.newUnitMechanismsCost}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newUnitMechanismsCost: e.target.value }))}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="vo-change-existing-item">
                    <label className="vo-exclude-checkbox">
                      <input
                        type="checkbox"
                        checked={changeForm.excluded}
                        onChange={(e) => setChangeForm((f) => ({ ...f, excluded: e.target.checked }))}
                      />
                      Izslēgt pilnībā
                    </label>
                    {!changeForm.excluded && (
                      <label>
                        Daudzuma izmaiņa (+/-)
                        <input
                          type="number"
                          value={changeForm.quantityDelta}
                          onChange={(e) => setChangeForm((f) => ({ ...f, quantityDelta: e.target.value }))}
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="vo-change-form-actions">
                  <button onClick={() => handleAddChange(vo.id)}>Pievienot</button>
                  <button onClick={() => setOpenChangeFormFor(null)}>Atcelt</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <h3>Mainītās pozīcijas (bāze → pašreizējais)</h3>
      {diffRows.length === 0 ? (
        <p className="hint">Nav apstiprinātu izmaiņu, kas ietekmētu pozīcijas.</p>
      ) : (
        <table className="vo-diff-table">
          <thead>
            <tr>
              <th>Sadaļa</th>
              <th>Nr.</th>
              <th>Nosaukums</th>
              <th>Bāze</th>
              <th>Pašreiz.</th>
              <th>Delta</th>
              <th>Izslēgts</th>
              <th>Izmaksu delta</th>
            </tr>
          </thead>
          <tbody>
            {diffRows.map((row) => (
              <tr key={row.itemId}>
                <td>{row.sectionName}</td>
                <td>{row.code}</td>
                <td>{row.description}</td>
                <td>{row.baselineQuantity === null ? "JAUNS" : row.baselineQuantity}</td>
                <td>{row.currentQuantity}</td>
                <td>{signed(row.quantityDelta)}</td>
                <td>{row.excluded ? "Jā" : "Nē"}</td>
                <td>{eur(row.directTotalDelta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
