import {
  filterPublications,
  normalizeFilters,
  parseFilters,
  serializeFilters,
} from '../lib/publication-filters.mjs';

function enhancePublications() {
  const form = document.querySelector<HTMLFormElement>('#publication-filters');
  const list = document.querySelector<HTMLElement>('#publication-list');
  const count = document.querySelector<HTMLElement>('#result-count');
  const empty = document.querySelector<HTMLElement>('#empty-results');
  if (!form || !list || !count || !empty) return;

  const search = form.querySelector<HTMLInputElement>('[name="q"]');
  const year = form.querySelector<HTMLSelectElement>('[name="year"]');
  const type = form.querySelector<HTMLSelectElement>('[name="type"]');
  const sort = form.querySelector<HTMLSelectElement>('[name="sort"]');
  const topics = Array.from(form.querySelectorAll<HTMLInputElement>('[name="topic"]'));
  if (!search || !year || !type || !sort) return;

  const values = (select: HTMLSelectElement) => Array.from(select.options)
    .map((option) => option.value).filter(Boolean);
  const options = {
    years: values(year),
    types: values(type),
    sorts: values(sort),
    topics: topics.map((input) => input.value),
  };
  const records = Array.from(list.querySelectorAll<HTMLElement>('[data-publication]')).map((element) => ({
    element,
    year: Number(element.dataset.year),
    type: element.dataset.type ?? '',
    tags: (element.dataset.tags ?? '').split(/\s+/).filter(Boolean),
    title: element.dataset.title ?? '',
    search: element.dataset.search ?? element.textContent ?? '',
  }));

  const readControls = () => normalizeFilters({
    q: search.value,
    year: year.value,
    type: type.value,
    sort: sort.value,
    topics: topics.filter((input) => input.checked).map((input) => input.value),
  }, options);

  function restoreControls(filters: ReturnType<typeof normalizeFilters>) {
    search.value = filters.q;
    year.value = filters.year;
    type.value = filters.type;
    sort.value = filters.sort;
    for (const input of topics) input.checked = filters.topics.includes(input.value);
  }

  function applyFilters(filters: ReturnType<typeof normalizeFilters>, updateUrl = true) {
    const matches = filterPublications(records, filters);
    const visible = new Set(matches);
    const focused = document.activeElement instanceof HTMLElement && list!.contains(document.activeElement)
      ? document.activeElement : null;
    for (const record of records) record.element.hidden = !visible.has(record);

    // Existing elements keep their links and event handlers. Appending a
    // fragment changes their order without rebuilding article HTML.
    const fragment = document.createDocumentFragment();
    for (const record of matches) fragment.append(record.element);
    list!.append(fragment);
    if (focused && !focused.closest('[hidden]') && document.activeElement !== focused) {
      focused.focus({preventScroll: true});
    }
    count!.textContent = matches.length === records.length
      ? `${records.length} publications`
      : `${matches.length} of ${records.length} publications`;
    empty!.hidden = matches.length > 0;

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.search = serializeFilters(filters, options, url.searchParams).toString();
      if (url.href !== window.location.href) {
        window.history.replaceState(window.history.state, '', url);
      }
    }
  }

  function clearFilters() {
    const filters = normalizeFilters({}, options);
    restoreControls(filters);
    applyFilters(filters);
  }

  form.addEventListener('input', (event) => {
    if (event.target === search) applyFilters(readControls());
  });
  form.addEventListener('change', (event) => {
    if (event.target !== search) applyFilters(readControls());
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters(readControls());
  });
  form.addEventListener('reset', (event) => {
    event.preventDefault();
    clearFilters();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-clear-filters]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      clearFilters();
      // The empty-state button disappears after reset; move focus to a useful,
      // visible control rather than leaving it inside a hidden element.
      if (button.closest('[hidden]')) search.focus({preventScroll: true});
    });
  });
  window.addEventListener('popstate', () => {
    const filters = parseFilters(window.location.search, options);
    restoreControls(filters);
    applyFilters(filters, false);
  });

  const initial = parseFilters(window.location.search, options);
  restoreControls(initial);
  applyFilters(initial);
  // Until all data and controls are ready, static HTML displays the full list.
  form.hidden = false;
}

enhancePublications();
