import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterPublications,
  normalizeFilters,
  parseFilters,
  serializeFilters,
  sortPublications,
} from '../src/lib/publication-filters.mjs';

const options = {
  years: ['2026', '2025', '2024'],
  types: ['journal', 'conference', 'book', 'chapter', 'editorial'],
  topics: ['vr-ar', 'human-ai', 'education', 'wellbeing', 'accessibility', 'social'],
  sorts: ['newest', 'oldest', 'title'],
};
const records = Object.freeze([
  {id: 'vr-journal', title: 'Virtual learning', year: 2025, type: 'journal', tags: ['vr-ar', 'education'], search: 'Virtual learning Li C IEEE'},
  {id: 'ai-conference', title: 'Agentic moderators', year: 2026, type: 'conference', tags: ['human-ai'], search: 'Agentic moderators Zhu Li CHI'},
  {id: 'ai-journal', title: 'AI for learning', year: 2025, type: 'journal', tags: ['human-ai', 'education'], search: 'AI for learning Li C JMIR'},
  {id: 'health-journal', title: 'Health in VR', year: 2024, type: 'journal', tags: ['vr-ar', 'wellbeing'], search: 'Health in VR Li C Frontiers'},
  {id: 'ai-book', title: 'AI education', year: 2025, type: 'book', tags: ['human-ai', 'education'], search: 'AI education Smith Springer'},
].map((record) => Object.freeze({...record, tags: Object.freeze(record.tags)})));
const ids = (values) => values.map((record) => record.id);
const state = (values = {}) => normalizeFilters(values, options);

test('the default state shows all works newest first with title tie breaks', () => {
  assert.deepEqual(state(), {q: '', year: '', type: '', sort: 'newest', topics: []});
  assert.deepEqual(ids(filterPublications(records, state())), [
    'ai-conference', 'ai-book', 'ai-journal', 'vr-journal', 'health-journal',
  ]);
});

test('selected topics use OR while year, type, and search use AND', () => {
  const filtered = filterPublications(records, state({
    topics: ['vr-ar', 'human-ai'], year: '2025', type: 'journal', q: 'LEARNING li',
  }));
  assert.deepEqual(ids(filtered), ['ai-journal', 'vr-journal']);
  // Neither of these works has both selected topics.
  assert.ok(filtered.every((record) => !['vr-ar', 'human-ai'].every((tag) => record.tags.includes(tag))));
});

test('search is case insensitive and each word must match', () => {
  assert.deepEqual(ids(filterPublications(records, state({q: '  CHI   zHU  '}))), ['ai-conference']);
  assert.deepEqual(ids(filterPublications(records, state({q: 'CHI springer'}))), []);
});

test('missing and invalid query values safely fall back to the full list', () => {
  assert.deepEqual(parseFilters('', options), state());
  assert.deepEqual(parseFilters('?year=2025junk&type=anything&sort=random&topic=unknown', options), state());
  assert.deepEqual(parseFilters('?year=1900&type=journal&topic=unknown&topic=vr-ar&topic=vr-ar', options),
    state({type: 'journal', topics: ['vr-ar']}));
  assert.deepEqual(normalizeFilters(null, options), state());
});

test('URL parsing honors the options actually present on a page', () => {
  const narrowed = {...options, years: ['2026'], types: ['conference'], topics: ['human-ai'], sorts: ['newest']};
  assert.deepEqual(parseFilters('year=2025&type=journal&topic=vr-ar&sort=oldest', narrowed), state());
});

test('URL round trip keeps Unicode and punctuation and canonicalizes repeated topics', () => {
  const original = state({q: 'Li & AI — learning', year: '2025', type: 'journal', sort: 'oldest', topics: ['social', 'human-ai']});
  const query = serializeFilters(original, options);
  assert.deepEqual(query.getAll('topic'), ['human-ai', 'social']);
  assert.deepEqual(parseFilters(query, options), original);
});

test('serialization removes defaults and stale state but preserves unrelated parameters', () => {
  const query = serializeFilters(state(), options, 'q=old&year=2024&topic=vr-ar&sort=oldest&utm_source=profile');
  assert.equal(query.toString(), 'utm_source=profile');
  assert.equal(serializeFilters(state(), options).toString(), '');
});

test('oldest and alphabetical orders are deterministic and do not mutate input', () => {
  const before = ids(records);
  assert.deepEqual(ids(sortPublications(records, 'oldest')), [
    'health-journal', 'ai-book', 'ai-journal', 'vr-journal', 'ai-conference',
  ]);
  assert.deepEqual(ids(sortPublications(records, 'title')), [
    'ai-conference', 'ai-book', 'ai-journal', 'health-journal', 'vr-journal',
  ]);
  assert.deepEqual(ids(records), before);
});

test('identical years and titles preserve source order, title ties prefer newer works', () => {
  const duplicateTitles = [
    {...records[0], id: 'older', title: 'Same title', year: 2024},
    {...records[0], id: 'first', title: 'Same title', year: 2025},
    {...records[0], id: 'second', title: 'Same title', year: 2025},
  ];
  assert.deepEqual(ids(sortPublications(duplicateTitles, 'newest')), ['first', 'second', 'older']);
  assert.deepEqual(ids(sortPublications(duplicateTitles, 'title')), ['first', 'second', 'older']);
  assert.deepEqual(ids(sortPublications(duplicateTitles, 'oldest')), ['older', 'first', 'second']);
});

test('valid filters with no matches return an empty list', () => {
  assert.deepEqual(filterPublications(records, state({year: '2026', topics: ['wellbeing']})), []);
  assert.deepEqual(filterPublications([], state()), []);
});
