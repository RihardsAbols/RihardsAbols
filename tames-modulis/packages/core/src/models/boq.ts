import type { ExecutionRecord } from "./executionRecord.js";
import type { VariationOrder } from "./variationOrder.js";

export interface BoqItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  /** Vienības izmaksa - darba alga (EUR/vienība). */
  unitLaborCost: number;
  /** Vienības izmaksa - materiāli (EUR/vienība). */
  unitMaterialsCost: number;
  /** Vienības izmaksa - mehānismi (EUR/vienība). */
  unitMechanismsCost: number;
  /**
   * Pozīcija ir pilnībā izslēgta (omitted) ar apstiprinātu tāmes izmaiņu
   * (Variation Order) - atšķirīgs jēdziens no quantity=0 (kas var nozīmēt arī
   * "vēl nav sākts, ne atcelts"). Aprēķini (calculateItemCosts) izslēgtai
   * pozīcijai vienmēr atgriež nulles izmaksas, neatkarīgi no quantity, lai
   * daudzums paliktu redzams atsaucei (piem. diff skatā), bet neietekmētu
   * summas. TIKAI atvasinātajā (bāze + apstiprinātās VO) stāvoklī var būt
   * true - bāzes pozīcijās vienmēr false/undefined, skat.
   * variationOrders/deriveCurrentState.ts.
   */
  excluded?: boolean;
}

export interface BoqSection {
  id: string;
  name: string;
  /**
   * Manuāli ievadāms tāmes numurs (piem. "1-1"), neatkarīgs no sadaļas
   * nosaukuma un no Excel eksporta lapas nosaukuma - reāli Līguma tāmju
   * faili bieži numurē lokālās tāmes citādi, nekā ir nosaukta pati lapa
   * (skat. excel/export.ts "Lokālā tāme Nr." Excel eksportā).
   */
  estimateNumber: string;
  items: BoqItem[];
}

/** Uzņēmuma rekvizīti (Būvuzņēmējam vai Pasūtītājam). */
export interface CompanyDetails {
  name: string;
  regNr: string;
  address: string;
}

export function createEmptyCompanyDetails(): CompanyDetails {
  return { name: "", regNr: "", address: "" };
}

export interface BoqState {
  schemaVersion: number;
  projectId: string;
  projectName: string;
  /** PVN likme daļskaitlī, piem. 0.21 nozīmē 21%. */
  vatRate: number;
  /** Virsizdevumu likme no tiešajām izmaksām, piem. 0.12 nozīmē 12%. */
  overheadRate: number;
  /** Peļņas likme no tiešajām izmaksām, piem. 0.05 nozīmē 5%. */
  profitRate: number;
  /**
   * Atlaides likme no tiešajām izmaksām, piem. 0.05 nozīmē 5%. Atskaitīta
   * PIRMS virsizdevumiem/peļņas (skat. calculations/boq.ts summarizeBoq).
   * Projekta līmenī, ne pa sadaļām/pozīcijām.
   */
  discountRate: number;
  /**
   * Būvuzņēmēja un Pasūtītāja rekvizīti, un tāmes sastādītāja/pārbaudītāja
   * vārds/uzvārds - projekta līmenī (vieni visam projektam), rādās katrā
   * Excel eksporta lapā (skat. excel/export.ts).
   */
  contractor: CompanyDetails;
  client: CompanyDetails;
  preparedBy: string;
  checkedBy: string;
  sections: BoqSection[];
  /**
   * Kad bāzes tāme apstiprināta/iesaldēta (ISO datums), `null` kamēr
   * projekts vēl "melnrakstā" (sadaļas/pozīcijas brīvi rediģējamas kā līdz
   * šim). Pēc iesaldēšanas `sections` vairs netiek TIEŠI rediģētas - tā ir
   * pastāvīga atsauce (bāze), un turpmākās izmaiņas iet caur
   * `variationOrders`. "Pašreizējais" stāvoklis vienmēr tiek ATVASINĀTS no
   * `sections` + apstiprinātajām `variationOrders`, nevis glabāts atsevišķi -
   * skat. variationOrders/deriveCurrentState.ts un CLAUDE.md "Tāmes izmaiņu
   * (variation orders) vadība".
   */
  baselineApprovedAt: string | null;
  /** Ierosinātās/apstiprinātās/noraidītās tāmes izmaiņas pret bāzi. */
  variationOrders: VariationOrder[];
  /**
   * Izpildes akti pa atskaites periodiem (piem. mēnesi) - katrs satur pa
   * pozīcijām šajā periodā inženiera apstiprināto izpildīto daudzumu.
   * Kumulatīvais "izpildīts līdz šim"/"atlikums" vienmēr atvasināts no šī
   * saraksta (skat. executionRecords/executionRecords.ts), nevis glabāts
   * atsevišķi. Skat. CLAUDE.md "Tāmes izmaiņu (Variation Order) vadība".
   */
  executionRecords: ExecutionRecord[];
  createdAt: string;
  updatedAt: string;
}

// v7 pievienoja executionRecords (izpildes aktu vēsture pa periodiem, lieto
// atlikuma aprēķinam pirms jaunas VO izveides) un VariationOrderChange.newSection
// (VO var izveidot pavisam jaunu sadaļu, ne tikai pozīcijas esošā). v6 pievienoja baselineApprovedAt (bāzes tāmes iesaldēšanas atzīme) un
// variationOrders (tāmes izmaiņu/VO saraksts) - skat. models/variationOrder.ts
// un variationOrders/deriveCurrentState.ts. v5 pievienoja projekta līmeņa
// contractor/client rekvizītus un preparedBy/checkedBy (Excel eksporta
// galvenes/paraksta lauki), kā arī sadaļas līmeņa estimateNumber (manuāla
// tāmes numerācija). v4 pievienoja projekta līmeņa discountRate (atskaitīta
// no tiešajām izmaksām pirms virsizdevumiem/peļņas). v3 replaced the single
// `unitPrice` with a darba alga/materiāli/mehānismi split and added
// overheadRate/profitRate, matching the Līguma tāme format used by the
// izpildes-akts-validacija skill (see storage/migrations).
export const CURRENT_SCHEMA_VERSION = 7;

/** Latvijas standarta PVN likme. */
export const DEFAULT_VAT_RATE = 0.21;

/** Standarta virsizdevumu likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_OVERHEAD_RATE = 0.12;

/** Standarta peļņas likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_PROFIT_RATE = 0.05;

/** Noklusējuma atlaides likme - bez atlaides. */
export const DEFAULT_DISCOUNT_RATE = 0;

export function createEmptyBoqState(projectId: string, projectName: string): BoqState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId,
    projectName,
    vatRate: DEFAULT_VAT_RATE,
    overheadRate: DEFAULT_OVERHEAD_RATE,
    profitRate: DEFAULT_PROFIT_RATE,
    discountRate: DEFAULT_DISCOUNT_RATE,
    contractor: createEmptyCompanyDetails(),
    client: createEmptyCompanyDetails(),
    preparedBy: "",
    checkedBy: "",
    sections: [],
    baselineApprovedAt: null,
    variationOrders: [],
    executionRecords: [],
    createdAt: now,
    updatedAt: now,
  };
}
