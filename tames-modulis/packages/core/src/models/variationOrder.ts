import type { BoqItem } from "./boq.js";

/**
 * "voided" - VO bija `approved` (ietekmēja pašreizējo stāvokli), bet vēlāk
 * ANULĒTA kļūdas dēļ (piem. nepareizi ievadīts daudzums) - skat.
 * variationOrders/deriveCurrentState.ts `voidVariationOrder`. Anulēta VO
 * paliek redzama vēsturē, bet vairs NEIETEKMĒ atvasināto stāvokli (tā vairs
 * nav "approved"), tāpēc korekcijai izmanto jaunu VO, nevis pārraksta šo.
 */
export type VariationOrderStatus = "proposed" | "approved" | "rejected" | "voided";

/**
 * Vienas pozīcijas izmaiņa VO ietvaros. Attiecas VAI NU uz jau esošu bāzes
 * (vai iepriekšējas VO pievienotu) pozīciju - `itemId` norāda uz to, un
 * `quantityDelta`/`excluded` apraksta izmaiņu - VAI ievieš pavisam JAUNU
 * pozīciju esošā (vai VO izveidotā) sadaļā - `itemId` ir `null`, dati nāk no
 * `newItem` - VAI izveido pavisam JAUNU (tukšu) sadaļu - `newSection` ir
 * iestatīts, `sectionId` šai izmaiņai ir pašas izmaiņas `id` (self-
 * referencing, skat. zemāk), `itemId`/`newItem` paliek `null`.
 *
 * Kāpēc `itemId` var norādīt arī uz cita VO pievienotu pozīciju, ne tikai uz
 * bāzes pozīciju: `deriveCurrentSections` (skat. `variationOrders/`) katrai
 * jaunai pozīcijai piešķir `id` vienādu ar to izveidojušās izmaiņas `id`, tāpēc
 * vēlāka VO var atsaukties uz to tāpat kā uz jebkuru bāzes pozīciju (piem.,
 * viena VO pievieno pozīciju, cita to vēlāk izslēdz vai maina daudzumu). Tas
 * pats mehānisms atkārtots vienu līmeni augstāk jaunām sadaļām: sadaļu
 * izveidojošā izmaiņa pati NEPIEVIENO nevienu pozīciju (jaunā sadaļa
 * sākotnēji tukša) - pozīcijas tai pievieno ATSEVIŠĶAS turpmākas izmaiņas
 * (tajā pašā vai vēlākā VO), kas norāda `sectionId: <sadaļu izveidojušās
 * izmaiņas id>` un `itemId: null` (jauna pozīcija tajā).
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
  /** Jaunas pozīcijas dati, ja itemId === null un newSection === null; citādi null. */
  newItem: Omit<BoqItem, "id" | "excluded"> | null;
  /**
   * Jaunas sadaļas dati (nosaukums + tāmes numurs), ja šī izmaiņa izveido
   * pavisam jaunu sadaļu (nevis pozīciju esošā) - citādi null. Kad
   * iestatīts, `itemId`/`newItem` ir `null` un `quantityDelta`/`excluded`
   * netiek lietoti.
   */
  newSection: { name: string; estimateNumber: string } | null;
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
  /** Kad statuss pēdējoreiz mainīts uz approved/rejected/voided - null, kamēr proposed. */
  statusDate: string | null;
  /** Anulēšanas iemesls (brīvs teksts), ja status === "voided" - citādi null. */
  voidedReason: string | null;
  /**
   * EUR summa, ko šī VO izmanto no "Pasūtītāja rezerves" (skat.
   * variationOrders/deriveCurrentState.ts `computeReserveBalance`) - jēgpilna
   * TIKAI VO ar POZITĪVU finansiālo ietekmi (papildu darbi), noklusējums 0
   * (neizmanto rezervi). Rediģējama TIKAI, kamēr `status === "proposed"` -
   * tāpat kā pārējie VO lauki, kļūdu pēc apstiprināšanas labo ar anulēšanu +
   * jaunu VO (skat. "Izpildes aktu/VO anulēšana"), nevis tiešu rediģēšanu.
   * Rezerves UZKRĀŠANA (no izslēgtām/samazinātām pozīcijām) paliek pilnībā
   * ATVASINĀTA - šis lauks ir vienīgā tieši ievadāmā daļa, tikai
   * IZMANTOŠANAS pusei.
   */
  reserveDrawdown: number;
  changes: VariationOrderChange[];
  /**
   * PILNA statusa maiņu vēsture, viens ieraksts katrai maiņai (proposed ->
   * approved/rejected, un, ja vēlāk anulēta, approved -> voided) - PAPILDUS
   * `statusDate` (kas paliek "pēdējās maiņas datums", nemainīts). Vajadzīgs,
   * jo `statusDate` tiek PĀRRAKSTĪTS katrā maiņā (skat.
   * `variationOrders/deriveCurrentState.ts` `voidVariationOrder`) - bez šī
   * lauka apstiprināšanas datums PAZUDĪS neatgriezeniski, ja VO vēlāk
   * anulēta, kas sagrautu audita žurnālu (skat. CLAUDE.md "Audita žurnāls
   * (Sesija 28)"). Pirmais ieraksts vienmēr `{ status: "proposed", date:
   * vo.date }` (izveides brīdis).
   */
  statusHistory: VariationOrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Viens ieraksts VariationOrder.statusHistory - skat. tā dokumentāciju. */
export interface VariationOrderStatusEvent {
  status: VariationOrderStatus;
  /** ISO datums, kad statuss mainījās uz šo vērtību. */
  date: string;
}
