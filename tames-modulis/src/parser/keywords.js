// Atslēgvārdu vārdnīca strukturālai atpazīšanai — lapu un galvenes nosaukumi
// atšķiras starp projektiem (skat. TAMES_MODULE_SPEC.md §0), tāpēc pazīšana
// balstās TIKAI uz šiem atslēgvārdiem, nevis fiksētiem lapu/kolonnu nosaukumiem.

export const SHEET_TYPE_PATTERNS = {
  masterSummary: /koptāme|project\s*summary/i,
  objectSummary: /kopsavilkum|object\s*summary/i,
};

// Identitātes lauki — vienādi svarīgi gan detail, gan summary lapām.
// Secība ir svarīga: specifiskākie/šaurākie raksti pirms plašākiem (piem.
// "New Quantity ..." jāpārbauda PIRMS vispārīgā "quantity", citādi tas
// vienmēr uzvarētu, jo teksts satur abus vārdus).
export const IDENTITY_FIELD_PATTERNS = [
  ['sectionRef', /tāmes\s*nr|estimate\s*no/i],
  ['code', /kods|code/i],
  ['seqNo', /nr?\.?\s*p\.?\s*k/i],
  ['quantityCurrent', /new\s*quantity|jaun.*daudzum/i],
  ['quantity', /daudzum|quantity/i],
  ['unit', /mērvien|^unit$/i],
  ['description', /apraksts|description|nosaukum|name/i],
];

// Izmaksu apakšlauki — parādās divreiz katrā detail lapā (reizi zem
// "vienības izmaksas" grupas, reizi zem "kopā par visu apjomu" grupas);
// detectHeaderRow tos piesaista pareizajai grupai pēc kolonnu secības (fāze).
export const SUBFIELD_PATTERNS = [
  ['timeRate', /laika\s*norma|time\s*rate/i],
  ['wageRate', /darba\s*samaksas\s*likme|wage\s*rate|work\s*rate/i],
  ['laborHours', /darbietilpība|labor.*\(?c\/h\)?|labour.*volume|\(w\/h\)/i],
  ['salaryCents', /darba\s*alga|salary/i],
  ['materialsCents', /būvizstrādājumi|materi[āa]l/i],
  ['mechanismsCents', /mehānismi|mechanisms/i],
  [
    'totalCents',
    // Bilingual "kopā/total"-style labels (kopā|total|summa|sum, either
    // standalone or as one half of a "lv/en" pair split by "/"), plus a few
    // fixed phrasings actually seen in real files ("Pavisam kopā/Total",
    // "Objekta izmaksas euro/Total euro", "Tāmes izmaksas /Total cost",
    // "Estimated costs"). Deliberately does NOT match group-header labels
    // like "Total costs (EUR)" / "Unit costs (EUR)" (plural "costs"), which
    // are handled by falling through to the sub-header row instead.
    /(^|\/)\s*(kopā|total|summa|sum)\s*($|\/)|pavisam\s*kopā|izmaksas.*euro|total\s*euro|total\s*cost\b|estimated\s*cost/i,
  ],
];

export function matchIdentityField(text) {
  const t = (text || '').trim();
  if (!t) return null;
  for (const [field, re] of IDENTITY_FIELD_PATTERNS) {
    if (re.test(t)) return field;
  }
  if (/^no\.?$/i.test(t)) return 'seqNo';
  return null;
}

export function matchSubfield(text) {
  const t = (text || '').trim();
  if (!t) return null;
  for (const [field, re] of SUBFIELD_PATTERNS) {
    if (re.test(t)) return field;
  }
  return null;
}
