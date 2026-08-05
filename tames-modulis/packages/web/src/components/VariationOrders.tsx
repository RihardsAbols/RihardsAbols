import {
  computeExecutedToDate,
  computeItemCodesAndHistory,
  computeRemainingQuantity,
  computeReserveBalance,
  computeVariationOrderDirectTotalImpact,
  createVariationOrder,
  deriveCurrentSections,
  diffAgainstBaseline,
  voidVariationOrder,
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
  voided: "Anulēts",
};

/** Sadaļas izvēlnes sentinel vērtība "+ Jauna sadaļa" opcijai - nekad nesakrīt ar īstu sadaļas/izmaiņas id (crypto.randomUUID()). */
const NEW_SECTION_VALUE = "__new__";

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
  /** Esošas (vai šīs VO jau izveidotas) sadaļas id, vai NEW_SECTION_VALUE. */
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
  newSectionName: string;
  newSectionEstimateNumber: string;
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
    newSectionName: "",
    newSectionEstimateNumber: "",
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
  const [changeForm, setChangeForm] = useState<ChangeFormState>(emptyChangeForm(state.sections[0]?.id ?? NEW_SECTION_VALUE));
  const [voidingVoId, setVoidingVoId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const approvedVariationOrders = state.variationOrders.filter((vo) => vo.status === "approved");
  const currentSections = deriveCurrentSections(state.sections, approvedVariationOrders);
  const diffRows = diffAgainstBaseline(state.sections, currentSections);
  // Šī cilne rādās TIKAI pēc bāzes iesaldēšanas (skat. ProjectEditor.tsx), tāpēc
  // droši aprēķināt bez papildu null-pārbaudes - tas pats atvasinājums, ko
  // ProjectEditor.tsx jau lieto ItemsTable.tsx "Nr." kolonnai, tagad arī VO
  // kartes izmaiņu tabulai (skat. zemāk voOwnItemDisplay) - konsekventi
  // rāda vienu un to pašu numerāciju abās cilnēs.
  const itemDisplay = computeItemCodesAndHistory(state.sections, approvedVariationOrders);
  // "Pasūtītāja rezerve" atlikums NO VISĀM APSTIPRINĀTAJĀM VO - tas pats
  // skaitlis, kas jārāda kā "pieejamais atlikums" jebkurai VĒL "proposed" VO
  // (tā vēl neietekmē šo aprēķinu, skat. computeReserveBalance).
  const reserveBalance = computeReserveBalance(state.sections, state.variationOrders);

  // Sadaļas/pozīcijas, kas pieejamas IZMAIŅAS PIEVIENOŠANAS formai konkrētai
  // (vienmēr "proposed") VO - bāze + apstiprinātās VO + ŠĪS VO PAŠAS jau
  // pievienotās izmaiņas (lai var, piem., pirmajā izmaiņā izveidot jaunu
  // sadaļu un otrajā, tajā pašā VO, tai jau pievienot pozīciju, pirms VO ir
  // apstiprināta). Droši pievienot `vo` klāt bez dublēšanās risku, jo forma
  // atveras TIKAI "proposed" VO (skat. JSX zemāk), kas nekad nav
  // `approvedVariationOrders` iekšā.
  const openVo = openChangeFormFor ? state.variationOrders.find((vo) => vo.id === openChangeFormFor) : undefined;
  const previewSections = openVo ? deriveCurrentSections(state.sections, [...approvedVariationOrders, openVo]) : currentSections;
  const previewSectionsById = new Map(previewSections.map((s) => [s.id, s]));

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
      variationOrders: s.variationOrders.map((vo) =>
        vo.id === voId ? { ...vo, status, statusDate: now, statusHistory: [...vo.statusHistory, { status, date: now }], updatedAt: now } : vo,
      ),
    }));
  };

  const handleSetReserveDrawdown = (voId: string, value: number) => {
    const now = new Date().toISOString();
    onUpdate((s) => ({
      ...s,
      variationOrders: s.variationOrders.map((vo) => (vo.id === voId ? { ...vo, reserveDrawdown: value, updatedAt: now } : vo)),
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

  const openVoidVo = (voId: string) => {
    setVoidingVoId(voId);
    setVoidReason("");
  };

  const handleConfirmVoidVo = (voId: string) => {
    if (!voidReason.trim()) return;
    onUpdate((s) => ({ ...s, variationOrders: voidVariationOrder(s.variationOrders, voId, voidReason.trim()) }));
    setVoidingVoId(null);
    setVoidReason("");
  };

  const openAddChange = (voId: string) => {
    setOpenChangeFormFor(voId);
    setChangeForm(emptyChangeForm(state.sections[0]?.id ?? NEW_SECTION_VALUE));
  };

  const handleAddChange = (voId: string) => {
    let change: VariationOrderChange;
    if (changeForm.sectionId === NEW_SECTION_VALUE) {
      if (!changeForm.newSectionName.trim()) return;
      const newId = crypto.randomUUID();
      change = {
        id: newId,
        sectionId: newId,
        itemId: null,
        quantityDelta: 0,
        excluded: false,
        newItem: null,
        newSection: { name: changeForm.newSectionName, estimateNumber: changeForm.newSectionEstimateNumber },
      };
    } else if (changeForm.itemId === "") {
      if (!changeForm.newDescription.trim()) return;
      change = {
        id: crypto.randomUUID(),
        sectionId: changeForm.sectionId,
        itemId: null,
        quantityDelta: 0,
        excluded: false,
        newSection: null,
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
        newSection: null,
      };
    }

    const now = new Date().toISOString();
    onUpdate((s) => ({
      ...s,
      variationOrders: s.variationOrders.map((vo) => (vo.id === voId ? { ...vo, changes: [...vo.changes, change], updatedAt: now } : vo)),
    }));
    setOpenChangeFormFor(null);
  };

  const selectedItem =
    changeForm.sectionId !== NEW_SECTION_VALUE && changeForm.itemId !== ""
      ? previewSectionsById.get(changeForm.sectionId)?.items.find((i) => i.id === changeForm.itemId)
      : undefined;
  const executedToDate = selectedItem ? computeExecutedToDate(state.executionRecords, selectedItem.id) : 0;
  const remaining = selectedItem ? computeRemainingQuantity(selectedItem.quantity, executedToDate) : null;
  const resultingQuantity = selectedItem
    ? changeForm.excluded
      ? 0
      : Math.max(0, selectedItem.quantity + Number(changeForm.quantityDelta || "0"))
    : null;
  const showExecutedWarning =
    selectedItem !== undefined && resultingQuantity !== null && executedToDate > 0 && resultingQuantity < executedToDate;

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
        // Šīs VO pašas izmaiņu tabulas (sadaļu/pozīciju nosaukumu) atveidošanai
        // vajag PIEEJU arī pie sadaļām/pozīcijām, ko izveidojusi PATI ŠĪ VO
        // (ne tikai bāze + citas apstiprinātās) - ja vo pati jau apstiprināta,
        // tā jau ir approvedVariationOrders iekšā, tāpēc to nepievieno vēlreiz
        // (dubultā piemērošana sabojātu daudzumus).
        const voOwnSections =
          vo.status === "approved" ? currentSections : deriveCurrentSections(state.sections, [...approvedVariationOrders, vo]);
        const voOwnSectionsById = new Map(voOwnSections.map((s) => [s.id, s]));
        // Tas pats approved-vs-proposed nosacījums kā voOwnSections augšā -
        // apstiprinātai VO tas jau ir itemDisplay (aprēķināts vienu reizi
        // augšā); vēl proposed/rejected/voided VO simulē "kas notiktu, ja šī
        // arī būtu apstiprināta", lai izmaiņu tabula rādītu displayCode, kas
        // atbilst TIEŠI tiem pašiem voOwnSections, no kuriem ņemts apraksts.
        const voOwnItemDisplay =
          vo.status === "approved" ? itemDisplay : computeItemCodesAndHistory(state.sections, [...approvedVariationOrders, vo]);
        const resolveSectionName = (sectionId: string): string => {
          const creatingChange = vo.changes.find((c) => c.id === sectionId && c.newSection);
          if (creatingChange?.newSection) return creatingChange.newSection.name;
          return voOwnSectionsById.get(sectionId)?.name ?? state.sections.find((s) => s.id === sectionId)?.name ?? sectionId;
        };

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
            {vo.status === "voided" && vo.voidedReason && (
              <p className="vo-justification-text">Anulēšanas iemesls: {vo.voidedReason}</p>
            )}

            {vo.status === "proposed" && impact > 0 && (
              <div className="vo-reserve-drawdown">
                <label>
                  Segt no Pasūtītāja rezerves (€)
                  <input
                    type="number"
                    min="0"
                    value={vo.reserveDrawdown}
                    onChange={(e) => handleSetReserveDrawdown(vo.id, Number(e.target.value))}
                  />
                </label>
                <span className="hint">Pieejamais atlikums šobrīd: {eur(reserveBalance.available)}</span>
                {vo.reserveDrawdown > 0 && vo.reserveDrawdown > reserveBalance.available && (
                  <p className="vo-reserve-warning">
                    ⚠ Uzmanību: {eur(vo.reserveDrawdown)} pārsniedz pieejamo rezerves atlikumu ({eur(reserveBalance.available)}).
                  </p>
                )}
                {vo.reserveDrawdown > impact && (
                  <p className="vo-reserve-warning">
                    ⚠ Uzmanību: {eur(vo.reserveDrawdown)} pārsniedz šīs VO pašas izmaksu ietekmi ({eur(impact)}).
                  </p>
                )}
              </div>
            )}
            {vo.status === "approved" && vo.reserveDrawdown > 0 && (
              <p className="vo-justification-text">Segts no Pasūtītāja rezerves: {eur(vo.reserveDrawdown)}</p>
            )}

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
                    const changeLabel = change.newSection
                      ? "+ jauna sadaļa"
                      : change.itemId === null
                        ? "+ jauna pozīcija"
                        : change.excluded
                          ? "IZSLĒGTA"
                          : `daudzums ${signed(change.quantityDelta)}`;
                    // Pozīcijas "kods" šeit ir atvasinātais displayCode (skat.
                    // voOwnItemDisplay augšā), NEVIS bāzes/manuāli ievadītais
                    // item.code - konsekventi ar "Tāme" cilni (ItemsTable.tsx)
                    // un Excel eksportu (skat. CLAUDE.md "Pozīciju numerācija +
                    // VO izmaiņu vēsture"). Jaunas pozīcijas gadījumā tās id ir
                    // change.id (skat. deriveCurrentState.ts applyChange), tāpēc
                    // tas pats lookup strādā abiem gadījumiem.
                    const itemLabel = change.newSection
                      ? "-"
                      : (() => {
                          const itemId = change.itemId ?? change.id;
                          const displayCode = voOwnItemDisplay.get(itemId)?.displayCode;
                          const description =
                            change.itemId === null
                              ? (change.newItem?.description ?? "")
                              : (voOwnSectionsById.get(change.sectionId)?.items.find((i) => i.id === itemId)?.description ?? "");
                          const fallbackCode = change.itemId === null ? (change.newItem?.code ?? "") : itemId;
                          return `${displayCode ?? fallbackCode} ${description}`.trim();
                        })();
                    return (
                      <tr key={change.id}>
                        <td>{resolveSectionName(change.sectionId)}</td>
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

            {vo.status === "approved" &&
              (voidingVoId === vo.id ? (
                <div className="vo-void-form">
                  <p className="hint">
                    Anulēšana ir korekcijas mehānisms kļūdaini apstiprinātai VO (piem. nepareizs daudzums) - VO paliek
                    redzama vēsturē, bet vairs neietekmē pašreizējo stāvokli. Uzmanību: ja cita apstiprināta VO
                    atsaucas uz šīs VO izveidotu sadaļu/pozīciju, pēc anulēšanas tā izmaiņa vairs netiks piemērota.
                  </p>
                  <label>
                    Anulēšanas iemesls
                    <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                  </label>
                  <div className="vo-void-form-actions">
                    <button onClick={() => handleConfirmVoidVo(vo.id)} disabled={!voidReason.trim()}>
                      Apstiprināt anulēšanu
                    </button>
                    <button onClick={() => setVoidingVoId(null)}>Atcelt</button>
                  </div>
                </div>
              ) : (
                <div className="vo-actions">
                  <button onClick={() => openVoidVo(vo.id)}>Anulēt</button>
                </div>
              ))}

            {openChangeFormFor === vo.id && (
              <div className="vo-change-form">
                <label>
                  Sadaļa
                  <select
                    value={changeForm.sectionId}
                    onChange={(e) => setChangeForm((f) => ({ ...f, sectionId: e.target.value, itemId: "" }))}
                  >
                    <option value={NEW_SECTION_VALUE}>+ Jauna sadaļa</option>
                    {previewSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {changeForm.sectionId === NEW_SECTION_VALUE ? (
                  <div className="vo-change-new-section">
                    <label>
                      Sadaļas nosaukums
                      <input
                        value={changeForm.newSectionName}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newSectionName: e.target.value }))}
                      />
                    </label>
                    <label>
                      Tāmes numurs
                      <input
                        placeholder="Nr."
                        value={changeForm.newSectionEstimateNumber}
                        onChange={(e) => setChangeForm((f) => ({ ...f, newSectionEstimateNumber: e.target.value }))}
                      />
                    </label>
                    <p className="hint">
                      Jaunā sadaļa sākumā ir tukša - pozīcijas tai pievieno ar nākamu izmaiņu, izvēloties šo sadaļu.
                    </p>
                  </div>
                ) : (
                  <>
                    <label>
                      Pozīcija
                      <select value={changeForm.itemId} onChange={(e) => setChangeForm((f) => ({ ...f, itemId: e.target.value }))}>
                        <option value="">+ Jauna pozīcija</option>
                        {(previewSectionsById.get(changeForm.sectionId)?.items ?? []).map((item) => (
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
                          <input
                            value={changeForm.newCode}
                            onChange={(e) => setChangeForm((f) => ({ ...f, newCode: e.target.value }))}
                          />
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
                          <input
                            value={changeForm.newUnit}
                            onChange={(e) => setChangeForm((f) => ({ ...f, newUnit: e.target.value }))}
                          />
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
                        {selectedItem && (
                          <p className="vo-remaining-info">
                            Pašreizējais daudzums: {selectedItem.quantity} {selectedItem.unit} · Izpildīts līdz šim:{" "}
                            {executedToDate} {selectedItem.unit} · Pieejamais atlikums: {remaining} {selectedItem.unit}
                          </p>
                        )}
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
                        {showExecutedWarning && (
                          <p className="vo-executed-warning">
                            ⚠ Uzmanību: no {selectedItem?.quantity} {selectedItem?.unit} jau izpildīti {executedToDate}{" "}
                            {selectedItem?.unit} - šī izmaiņa samazinātu apjomu uz {resultingQuantity} {selectedItem?.unit},
                            kas ir MAZĀK par jau izpildīto.
                          </p>
                        )}
                      </div>
                    )}
                  </>
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

      <h3>Pasūtītāja rezerve</h3>
      <p className="hint">
        Izslēgto/samazināto pozīciju ietaupītā vērtība, ko var izmantot jaunu papildu darbu segšanai - INFORMATĪVS pārskats,
        neietekmē tāmes Pavisam/KOPĀ AR PVN summu.
      </p>
      <p className="vo-reserve-summary">
        Uzkrāts: {eur(reserveBalance.totalAccumulated)} · Izmantots: {eur(reserveBalance.totalDrawn)} · Atlikums:{" "}
        <strong>{eur(reserveBalance.available)}</strong>
      </p>
      {reserveBalance.entries.length === 0 ? (
        <p className="hint">Vēl nav apstiprinātu VO, kas ietekmētu rezervi.</p>
      ) : (
        <table className="vo-reserve-table">
          <thead>
            <tr>
              <th>VO</th>
              <th>Nosaukums</th>
              <th>Ietekme</th>
              <th>Papildina rezervi</th>
              <th>Izmanto no rezerves</th>
              <th>Atlikums pēc</th>
            </tr>
          </thead>
          <tbody>
            {reserveBalance.entries.map((entry) => (
              <tr key={entry.voId}>
                <td>{entry.voNumber}</td>
                <td>{entry.voTitle}</td>
                <td>{eur(entry.directTotalImpact)}</td>
                <td>{entry.contribution > 0 ? eur(entry.contribution) : "-"}</td>
                <td>{entry.drawdown > 0 ? eur(entry.drawdown) : "-"}</td>
                <td>{eur(entry.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
