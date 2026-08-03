import type { BoqItem } from "./boq.js";

export type VariationOrderStatus = "proposed" | "approved" | "rejected";

/**
 * Vienas pozīcijas izmaiņa VO ietvaros. Attiecas VAI NU uz jau esošu bāzes
 * (vai iepriekšējas VO pievienotu) pozīciju - `itemId` norāda uz to, un
 * `quantityDelta`/`excluded` apraksta izmaiņu - VAI ievieš pavisam JAUNU
 * pozīciju esošā sadaļā - `itemId` ir `null`, dati nāk no `newItem`.
 *
 * Kāpēc `itemId` var norādīt arī uz cita VO pievienotu pozīciju, ne tikai uz
 * bāzes pozīciju: `deriveCurrentSections` (skat. `variationOrders/`) katrai
 * jaunai pozīcijai piešķir `id` vienādu ar to izveidojušās izmaiņas `id`, tāpēc
 * vēlāka VO var atsaukties uz to tāpat kā uz jebkuru bāzes pozīciju (piem.,
 * viena VO pievieno pozīciju, cita to vēlāk izslēdz vai maina daudzumu).
 */
export interface VariationOrderChange {
  id: string;
  sectionId: string;
  itemId: string | null;
  /** Daudzuma korekcija (+/-) esošai pozīcijai. Jaunām pozīcijām (itemId === null) netiek lietots - to sākotnējais daudzums nāk no newItem.quantity. */
  quantityDelta: number;
  /**
   * Pozīcija tiek pilnībā izslēgta (omitted) neatkarīgi no daudzuma -
   * atšķirīgs jēdziens no daudzuma=0 (kas var nozīmēt arī "vēl nav sākts"),
   * skat. models/boq.ts BoqItem.excluded.
   */
  excluded: boolean;
  /** Jaunas pozīcijas dati, ja itemId === null; citādi null. */
  newItem: Omit<BoqItem, "id" | "excluded"> | null;
}

/**
 * Tāmes izmaiņa (Variation Order) pret iesaldētu bāzes tāmi - skat.
 * CLAUDE.md "Tāmes izmaiņu (variation orders) vadība" un
 * variationOrders/deriveCurrentState.ts pilnu semantiku. Tikai `approved`
 * statusa VO ietekmē atvasināto "pašreizējo" stāvokli.
 */
export interface VariationOrder {
  id: string;
  /** Cilvēklasāms secīgs numurs, piem. "VO-3" - skat. nextVariationOrderNumber. */
  number: string;
  title: string;
  justification: string;
  /** Kurš pusē instruēja/ierosināja šo izmaiņu (piem. "Pasūtītājs", "Inženieris"). */
  instructedBy: string;
  /** Ierosinājuma/instrukcijas datums (ISO). */
  date: string;
  status: VariationOrderStatus;
  /** Kad statuss pēdējoreiz mainīts uz approved/rejected - null, kamēr proposed. */
  statusDate: string | null;
  changes: VariationOrderChange[];
  createdAt: string;
  updatedAt: string;
}
