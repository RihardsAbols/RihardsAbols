import { computeExecutedToDate, computeRemainingQuantity } from "@tames-modulis/core";
import type { BoqItem, ExecutionRecord, ItemDisplayInfo } from "@tames-modulis/core";
import { Fragment, useState } from "react";

const ROW_HEIGHT = 33;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 8;
const VISIBLE_ROWS = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);

function eur(value: number): string {
  return `${value.toFixed(2)} €`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

interface ItemsTableProps {
  items: BoqItem[];
  onUpdateItem: (itemIndex: number, patch: Partial<BoqItem>) => void;
  onRemoveItem: (itemIndex: number) => void;
  /**
   * Kad tāmes bāze iesaldēta (skat. ProjectEditor.tsx baselineLocked), šī
   * tabula rāda ATVASINĀTO (bāze + apstiprinātās VO) stāvokli - tieša
   * rediģēšana vairs nav pieejama (izmaiņas iet caur "Izmaiņu" cilni), tāpēc
   * ievades lauki tiek atspējoti, nevis paslēpti, lai vērtības joprojām būtu
   * salasāmas tajā pašā izkārtojumā.
   */
  readOnly?: boolean;
  /**
   * Kad padots un nav tukšs, pievieno pastāvīgas "Izpildīts"/"Atlikums"
   * kolonnas VISĀM pozīcijām uzreiz (skat. PROGRESS.md Sesija 22) - pretstatā
   * VariationOrders.tsx, kur atlikums redzams tikai pa vienai pozīcijai VO
   * izveides formā. Nepadots/tukšs masīvs (projektam vēl nav neviena
   * izpildes akta, vai bāze vēl nav iesaldēta) nozīmē kolonnas vispār
   * nerenderējas - konsekventi ar to pašu `showExecution` karogu, ko lieto
   * Excel eksports (`excel/export.ts`), lai UI un eksportētais fails rāda
   * vienu un to pašu ainu.
   */
  executionRecords?: ExecutionRecord[];
  /**
   * `computeItemCodesAndHistory` rezultāts (skat. @tames-modulis/core) -
   * kad padots, aizstāj "Nr." šūnas rediģējamo `item.code` ar atvasinātu
   * displayCode (bāzes kods + revīzijas burts + VO atzīme jaunām
   * pozīcijām). Nepadots (pirms bāzes iesaldēšanas) nozīmē veco uzvedību -
   * rediģējams `code` teksta lauks.
   */
  itemDisplay?: Map<string, ItemDisplayInfo>;
  /**
   * Šai sadaļai relevanto apstiprināto VO saraksts (VO secībā) - katrai
   * pievieno divas kolonnas ("VO-X ΔDaudz."/"VO-X ΔEUR"), rādot TIKAI šīs
   * VO izraisīto izmaiņu katrai pozīcijai (tukšs, ja VO šo pozīciju
   * nemainīja) - skat. CLAUDE.md "Tāmes izmaiņu (Variation Order) vadība".
   */
  voColumns?: { voId: string; voNumber: string }[];
}

/**
 * Renders only the item rows scrolled into view instead of all of them.
 * Real Līguma tāme files can have thousands of positions per section (see
 * PROGRESS.md Session 12: 12876 items across 47 sections) - rendering every
 * row's 7 <input> elements up front produced ~90k DOM nodes and made
 * import+render take ~17-26s. Row height is a fixed estimate (not measured
 * per-row), which is fine here since every row has the same layout.
 */
export function ItemsTable({
  items,
  onUpdateItem,
  onRemoveItem,
  readOnly = false,
  executionRecords,
  itemDisplay,
  voColumns,
}: ItemsTableProps) {
  const [scrollTop, setScrollTop] = useState(0);

  const showExecution = (executionRecords?.length ?? 0) > 0;
  const columns = voColumns ?? [];
  const columnCount = 7 + columns.length * 2 + (showExecution ? 2 : 0) + 1;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(items.length, startIndex + VISIBLE_ROWS + OVERSCAN * 2);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = (items.length - endIndex) * ROW_HEIGHT;

  return (
    <div
      className="items-table-scroll"
      style={{ maxHeight: VIEWPORT_HEIGHT }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
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
            {columns.map((col) => (
              <Fragment key={col.voId}>
                <th>{col.voNumber} ΔDaudz.</th>
                <th>{col.voNumber} ΔEUR</th>
              </Fragment>
            ))}
            {showExecution && (
              <>
                <th>Izpildīts</th>
                <th>Atlikums</th>
              </>
            )}
            <th />
          </tr>
        </thead>
        <tbody>
          {topSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
              <td colSpan={columnCount} />
            </tr>
          )}
          {items.slice(startIndex, endIndex).map((item, i) => {
            const itemIndex = startIndex + i;
            const executedToDate = showExecution ? computeExecutedToDate(executionRecords!, item.id) : 0;
            const remaining = showExecution ? computeRemainingQuantity(item.quantity, executedToDate) : 0;
            const rowClassName = [item.excluded ? "excluded-row" : null, showExecution && remaining < 0 ? "over-executed" : null]
              .filter(Boolean)
              .join(" ") || undefined;
            const displayCode = itemDisplay?.get(item.id)?.displayCode ?? item.code;
            const impacts = itemDisplay?.get(item.id)?.impacts ?? [];
            return (
              <tr key={item.id} className={rowClassName} style={{ height: ROW_HEIGHT }}>
                <td>
                  {itemDisplay ? (
                    <input className="code-input" value={displayCode} disabled />
                  ) : (
                    <input
                      className="code-input"
                      value={item.code}
                      disabled={readOnly}
                      onChange={(e) => onUpdateItem(itemIndex, { code: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  <input
                    value={item.description}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="unit-input"
                    value={item.unit}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { unit: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.quantity}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitLaborCost}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { unitLaborCost: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitMaterialsCost}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { unitMaterialsCost: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitMechanismsCost}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(itemIndex, { unitMechanismsCost: Number(e.target.value) })}
                  />
                </td>
                {columns.map((col) => {
                  const impact = impacts.find((i) => i.voId === col.voId);
                  return (
                    <Fragment key={col.voId}>
                      <td>{impact ? (impact.isNew ? `JAUNS: ${impact.quantityDelta}` : signed(impact.quantityDelta)) : "-"}</td>
                      <td>{impact ? eur(impact.directTotalDelta) : "-"}</td>
                    </Fragment>
                  );
                })}
                {showExecution && (
                  <>
                    <td>{executedToDate}</td>
                    <td>{remaining}</td>
                  </>
                )}
                <td>
                  {!readOnly && (
                    <button aria-label="Dzēst pozīciju" onClick={() => onRemoveItem(itemIndex)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
              <td colSpan={columnCount} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
