import { computeExecutedToDate, computeRemainingQuantity } from "@tames-modulis/core";
import type { BoqItem, ExecutionRecord } from "@tames-modulis/core";
import { useState } from "react";

const ROW_HEIGHT = 33;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 8;
const VISIBLE_ROWS = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);

interface ExecutionEntryTableProps {
  items: BoqItem[];
  executionRecords: ExecutionRecord[];
  entryQuantities: Record<string, string>;
  onChangeQuantity: (itemId: string, value: string) => void;
}

/**
 * Renders only the item rows scrolled into view instead of all of them -
 * same technique and constants as ItemsTable.tsx's virtualization (see its
 * comment for the real 12876-item file that motivated it). A section's
 * "Izpildes akti" entry table has the exact same one-row-per-pozīcija shape,
 * so a real project would hit the same slowdown here without it.
 */
export function ExecutionEntryTable({ items, executionRecords, entryQuantities, onChangeQuantity }: ExecutionEntryTableProps) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(items.length, startIndex + VISIBLE_ROWS + OVERSCAN * 2);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = (items.length - endIndex) * ROW_HEIGHT;

  return (
    <div className="execution-entry-table-scroll" style={{ maxHeight: VIEWPORT_HEIGHT }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <table className="execution-entry-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Nosaukums</th>
            <th>Mērv.</th>
            <th>Pašreizējais</th>
            <th>Izpildīts līdz šim</th>
            <th>Šajā periodā</th>
            <th>Atlikums uz nākamo periodu</th>
          </tr>
        </thead>
        <tbody>
          {topSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
              <td colSpan={7} />
            </tr>
          )}
          {items.slice(startIndex, endIndex).map((item) => {
            const priorExecuted = computeExecutedToDate(executionRecords, item.id);
            const thisPeriod = Number(entryQuantities[item.id] || "0");
            const remaining = computeRemainingQuantity(item.quantity, priorExecuted + thisPeriod);
            return (
              <tr key={item.id} className={remaining < 0 ? "over-executed" : undefined} style={{ height: ROW_HEIGHT }}>
                <td>{item.code}</td>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td>{item.quantity}</td>
                <td>{priorExecuted}</td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={entryQuantities[item.id] ?? ""}
                    onChange={(e) => onChangeQuantity(item.id, e.target.value)}
                  />
                </td>
                <td>{remaining}</td>
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
              <td colSpan={7} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
