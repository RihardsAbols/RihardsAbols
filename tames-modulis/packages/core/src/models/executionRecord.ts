/**
 * Vienas pozīcijas izpildītais daudzums KONKRĒTĀ atskaites periodā (nevis
 * kumulatīvs) - inženiera apstiprināts, skat. ExecutionRecord. Kumulatīvo
 * "izpildīts līdz šim" un "atlikums" vienmēr atvasina no visu periodu
 * ierakstiem (skat. executionRecords/executionRecords.ts
 * computeExecutedToDate) - šeit netiek glabāts, lai nebūtu divu patiesības
 * avotu.
 */
export interface ExecutionRecordEntry {
  id: string;
  sectionId: string;
  itemId: string;
  /** Šajā periodā izpildītais un inženiera apstiprinātais daudzums. */
  executedQuantity: number;
}

/**
 * Izpildes akts par vienu atskaites periodu (piem. mēnesi) - brīvs teksta
 * apzīmējums (`period`, piem. "2026-01" vai "Akts Nr. 5"), nevis automātiski
 * numurēts, jo lietotājs var šeit lietot jebkuru savā praksē pieņemto
 * numerāciju. Ieraksti (`entries`) satur TIKAI pozīcijas ar izpildi šajā
 * periodā - nulles/neskartas pozīcijas netiek glabātas. Reiz saglabāts akts
 * NAV tieši rediģējams/dzēšams (append-only audit trail, tāpat kā
 * apstiprinātas/noraidītas VO nav rediģējamas pēc statusa maiņas) - kļūdas
 * (piem. nepareizi ievadīts skaitlis) labo ar ANULĒŠANU
 * (`voidedAt`/`voidedReason`, skat. executionRecords/executionRecords.ts
 * `voidExecutionRecord`) + jauna, pareiza akta izveidi, nevis pārrakstot vai
 * dzēšot šo pašu ierakstu - tas saglabā pilnu vēsturi (kas un kad anulēja,
 * un kāpēc), skat. CLAUDE.md "Izpildes aktu/VO anulēšana (Sesija 23)".
 */
export interface ExecutionRecord {
  id: string;
  period: string;
  /** Perioda/akta datums (ISO). */
  date: string;
  /** Kurš inženieris/puse apstiprinājusi šo aktu. */
  approvedBy: string;
  entries: ExecutionRecordEntry[];
  /**
   * Kad šis akts anulēts (ISO datums), `null` kamēr aktīvs. Anulēts akts
   * paliek vēsturē (nav dzēsts), bet tā ieraksti tiek IZSLĒGTI no
   * `computeExecutedToDate`/`computeExecutionOverview` aprēķina - tā, it kā
   * šis akts nekad nebūtu iesniegts.
   */
  voidedAt: string | null;
  /** Anulēšanas iemesls (brīvs teksts) - `null` kamēr aktīvs. */
  voidedReason: string | null;
  createdAt: string;
  updatedAt: string;
}
