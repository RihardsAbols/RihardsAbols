import type { BoqItem } from "@tames-modulis/core";
import { useState } from "react";

const ROW_HEIGHT = 33;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 8;
const VISIBLE_ROWS = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);

interface ItemsTableProps {
  items: BoqItem[];
  onUpdateItem: (itemIndex: number, patch: Partial<BoqItem>) => void;
  onRemoveItem: (itemIndex: number) => void;
}

/**
 * Renders only the item rows scrolled into view instead of all of them.
 * Real Līguma tāme files can have thousands of positions per section (see
 * PROGRESS.md Session 12: 12876 items across 47 sections) - rendering every
 * row's 7 <input> elements up front produced ~90k DOM nodes and made
 * import+render take ~17-26s. Row height is a fixed estimate (not measured
 * per-row), which is fine here since every row has the same layout.
 */
export function ItemsTable({ items, onUpdateItem, onRemoveItem }: ItemsTableProps) {
  const [scrollTop, setScrollTop] = useState(0);

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
            <th />
          </tr>
        </thead>
        <tbody>
          {topSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
              <td colSpan={8} />
            </tr>
          )}
          {items.slice(startIndex, endIndex).map((item, i) => {
            const itemIndex = startIndex + i;
            return (
              <tr key={item.id} style={{ height: ROW_HEIGHT }}>
                <td>
                  <input value={item.code} onChange={(e) => onUpdateItem(itemIndex, { code: e.target.value })} />
                </td>
                <td>
                  <input
                    value={item.description}
                    onChange={(e) => onUpdateItem(itemIndex, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="unit-input"
                    value={item.unit}
                    onChange={(e) => onUpdateItem(itemIndex, { unit: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(itemIndex, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitLaborCost}
                    onChange={(e) => onUpdateItem(itemIndex, { unitLaborCost: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitMaterialsCost}
                    onChange={(e) => onUpdateItem(itemIndex, { unitMaterialsCost: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input"
                    value={item.unitMechanismsCost}
                    onChange={(e) => onUpdateItem(itemIndex, { unitMechanismsCost: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button aria-label="Dzēst pozīciju" onClick={() => onRemoveItem(itemIndex)}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 && (
            <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
              <td colSpan={8} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
