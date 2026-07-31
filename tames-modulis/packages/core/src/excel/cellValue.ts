import type ExcelJS from "exceljs";

/** Column letter for a 1-based column index (1 -> A, 27 -> AA). Only needs to
 * cover the Līguma tāme's column range (<= 16), so no need for >2-letter columns. */
export function colLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as { richText: unknown[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((rt) => rt.text).join("");
    }
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      return r === null || r === undefined ? "" : String(r);
    }
    if ("text" in v) return String((v as { text: unknown }).text);
  }
  return String(v);
}

export function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v && typeof (v as { result: unknown }).result === "number") {
    return (v as { result: number }).result;
  }
  const parsed = Number(cellText(cell).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
