// Tieši tā pati normalizācijas/fuzzy-match loģika, kas jau pierādīta Kanban
// app CCF/VO modulī (skat. ARCHITECTURE_EXPORT.md §5) — pārmantota apzināti,
// lai vēlākā savienošana ar Variations moduli nebūtu jāpārrēķina.
export function normalizeCostRef(s) {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function looseCostRefKey(s) {
  return normalizeCostRef(s).replace(/[^\p{L}\p{N}]/gu, '');
}
