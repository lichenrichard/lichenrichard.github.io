/**
 * Small, DOM-independent helpers for the progressively enhanced bibliography.
 * Query values are constrained to options actually offered by the page.
 */

export const PUBLICATION_TYPES = Object.freeze([
  'journal', 'conference', 'book', 'chapter', 'editorial',
]);
export const PUBLICATION_SORTS = Object.freeze(['newest', 'oldest', 'title']);
const FILTER_KEYS = ['q', 'year', 'type', 'sort', 'topic'];

/**
 * @typedef {{q: string, year: string, type: string, sort: string, topics: string[]}} PublicationFilters
 * @typedef {{years?: readonly string[], types?: readonly string[], topics?: readonly string[], sorts?: readonly string[]}} FilterOptions
 * @typedef {{year: number, type: string, tags: readonly string[], title: string, search?: string}} PublicationRecord
 */

/**
 * Normalize input from either the URL or form; never let unknown tags or years
 * accidentally produce an empty bibliography for a malformed shared URL.
 * @param {Partial<PublicationFilters> | null | undefined} input
 * @param {FilterOptions} [options]
 * @returns {PublicationFilters}
 */
export function normalizeFilters(input, options = {}) {
  const value = input ?? {};
  const years = options.years ?? [];
  const types = options.types ?? PUBLICATION_TYPES;
  const topics = options.topics ?? [];
  const sorts = options.sorts ?? PUBLICATION_SORTS;
  return {
    q: typeof value.q === 'string' ? value.q.trim().replace(/\s+/g, ' ') : '',
    year: typeof value.year === 'string' && /^\d{4}$/.test(value.year) && years.includes(value.year)
      ? value.year : '',
    type: typeof value.type === 'string' && PUBLICATION_TYPES.includes(value.type) && types.includes(value.type)
      ? value.type : '',
    sort: typeof value.sort === 'string' && PUBLICATION_SORTS.includes(value.sort) && sorts.includes(value.sort)
      ? value.sort : 'newest',
    // DOM order gives equivalent selections one predictable URL representation.
    topics: topics.filter((topic, index) => topics.indexOf(topic) === index
      && Array.isArray(value.topics) && value.topics.includes(topic)),
  };
}

/**
 * @param {URLSearchParams | string} query
 * @param {FilterOptions} [options]
 * @returns {PublicationFilters}
 */
export function parseFilters(query, options = {}) {
  const params = typeof query === 'string' ? new URLSearchParams(query) : query;
  return normalizeFilters({
    q: params.get('q') ?? '',
    year: params.get('year') ?? '',
    type: params.get('type') ?? '',
    sort: params.get('sort') ?? 'newest',
    topics: params.getAll('topic'),
  }, options);
}

/**
 * Preserve unrelated URL parameters (for example campaign references), remove
 * defaults, and represent each selected topic using a repeated topic parameter.
 * The caller retains the URL pathname and fragment.
 * @param {Partial<PublicationFilters>} filters
 * @param {FilterOptions} [options]
 * @param {URLSearchParams | string} [base]
 * @returns {URLSearchParams}
 */
export function serializeFilters(filters, options = {}, base = '') {
  const params = new URLSearchParams(base);
  const normalized = normalizeFilters(filters, options);
  for (const key of FILTER_KEYS) params.delete(key);
  if (normalized.q) params.set('q', normalized.q);
  if (normalized.year) params.set('year', normalized.year);
  if (normalized.type) params.set('type', normalized.type);
  if (normalized.sort !== 'newest') params.set('sort', normalized.sort);
  for (const topic of normalized.topics) params.append('topic', topic);
  return params;
}

/**
 * Sort a copy, preserving input order for indistinguishable records. Year sorts
 * break ties by title; title sort breaks ties by newest year.
 * @template {PublicationRecord} T
 * @param {readonly T[]} records
 * @param {string} [sort]
 * @returns {T[]}
 */
export function sortPublications(records, sort = 'newest') {
  const titleOrder = (a, b) => a.title.localeCompare(b.title, 'en', {sensitivity: 'base'});
  return records.map((record, index) => ({record, index})).sort((a, b) => {
    let order;
    if (sort === 'title') {
      order = titleOrder(a.record, b.record) || b.record.year - a.record.year;
    } else {
      order = (sort === 'oldest' ? a.record.year - b.record.year : b.record.year - a.record.year)
        || titleOrder(a.record, b.record);
    }
    return order || a.index - b.index;
  }).map(({record}) => record);
}

/**
 * OR selected topics, AND search/year/type. Every search word may occur anywhere
 * in the title/authors/venue text supplied by the rendered record.
 * @template {PublicationRecord} T
 * @param {readonly T[]} records
 * @param {PublicationFilters} filters
 * @returns {T[]}
 */
export function filterPublications(records, filters) {
  const terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = records.filter((record) => {
    if (filters.year && record.year !== Number(filters.year)) return false;
    if (filters.type && record.type !== filters.type) return false;
    if (filters.topics.length && !filters.topics.some((topic) => record.tags.includes(topic))) return false;
    const searchable = (record.search ?? record.title).toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  return sortPublications(matches, filters.sort);
}
