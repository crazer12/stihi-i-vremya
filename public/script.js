/* =========================================================================
   ИНТЕРАКТИВНОСТЬ САЙТА (версия с подгрузкой данных через API)
   - Загружает стихи и категории с сервера через /api/poems
   - Рендеринг карточек, фильтрация, модальное окно
   - poems.js больше не используется
   ========================================================================= */

(function () {
  'use strict';

  let POEMS = [];
  let CATEGORIES = {};
  let activeCategory = 'all';

  const grid       = document.getElementById('poems-grid');
  const empty      = document.getElementById('poems-empty');
  const filtersNav = document.getElementById('filters');
  const modal      = document.getElementById('poem-modal');
  const mTitle     = document.getElementById('modal-title');
  const mDate      = document.getElementById('modal-date');
  const mCategory  = document.getElementById('modal-category');
  const mText      = document.getElementById('modal-text');
  const mLink      = document.getElementById('modal-link');
  const mPlaceholder = document.getElementById('modal-placeholder');

  /* ---------- Загрузка данных ---------- */
  async function loadData() {
    try {
      const res = await fetch('/api/poems', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить стихи');
      const data = await res.json();
      POEMS = data.poems || [];
      CATEGORIES = data.categories || {};
    } catch (e) {
      console.error('Ошибка загрузки данных:', e);
      grid.innerHTML = '<p class="poems-empty">Не удалось загрузить стихи. Попробуйте обновить страницу.</p>';
      throw e;
    }
  }

  /* ---------- Фильтры ---------- */
  function buildFilters() {
    filtersNav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'filter is-active';
    allBtn.dataset.cat = 'all';
    allBtn.innerHTML = `Все&nbsp;стихи <span class="filter__count">(${POEMS.length})</span>`;
    filtersNav.appendChild(allBtn);

    Object.entries(CATEGORIES).forEach(([key, info]) => {
      const count = POEMS.filter(p => p.category === key).length;
      if (count === 0) return;
      const btn = document.createElement('button');
      btn.className = 'filter';
      btn.dataset.cat = key;
      btn.innerHTML = `${info.short || info.name} <span class="filter__count">(${count})</span>`;
      filtersNav.appendChild(btn);
    });

    filtersNav.querySelectorAll('.filter').forEach(btn => {
      btn.addEventListener('click', () => {
        filtersNav.querySelectorAll('.filter').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeCategory = btn.dataset.cat;
        render();
      });
    });

    const statEl = document.getElementById('stat-poems');
    if (statEl) statEl.textContent = POEMS.length;
  }

  /* ---------- Сортировка и рендер ---------- */
  function sortByDate(list) {
    return [...list].sort((a, b) => {
      const da = a.date.split('.').reverse().join('-');
      const db = b.date.split('.').reverse().join('-');
      return db.localeCompare(da);
    });
  }

  function makeCard(poem, index) {
    const card = document.createElement('button');
    card.className = 'poem-card';
    card.style.animationDelay = `${Math.min(index * 40, 600)}ms`;

    const cat = CATEGORIES[poem.category] || { name: 'Без рубрики', short: 'Без рубрики' };

    card.innerHTML = `
      <p class="poem-card__category" data-cat="${escapeAttr(poem.category)}">${escapeHtml(cat.short || cat.name)}</p>
      <h3 class="poem-card__title">${escapeHtml(poem.title)}</h3>
      <div class="poem-card__footer">
        <time class="poem-card__date">${escapeHtml(poem.date)}</time>
        <span class="poem-card__arrow" aria-hidden="true">→</span>
      </div>
    `;
    card.addEventListener('click', () => openModal(poem));
    return card;
  }

  function render() {
    const filtered = activeCategory === 'all'
      ? POEMS
      : POEMS.filter(p => p.category === activeCategory);

    grid.innerHTML = '';

    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    sortByDate(filtered).forEach((poem, i) => grid.appendChild(makeCard(poem, i)));
  }

  /* ---------- Модальное окно ---------- */
  function openModal(poem) {
    const cat = CATEGORIES[poem.category] || { name: 'Без рубрики' };
    mCategory.textContent = cat.name;
    mTitle.textContent    = poem.title;
    mDate.textContent     = poem.date;
    mLink.href            = poem.url || 'https://stihi.ru/avtor/cab83mailru';

    if (poem.text && poem.text.trim().length > 0) {
      mText.textContent = poem.text;
      mText.style.display = 'block';
      mPlaceholder.style.display = 'none';
    } else {
      mText.textContent = '';
      mText.style.display = 'none';
      mPlaceholder.style.display = 'block';
    }

    // Скрываем кнопку «Открыть на Стихи.ру», если ссылки нет
    mLink.style.display = poem.url ? 'inline-flex' : 'none';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  modal.querySelectorAll('[data-close]').forEach(el =>
    el.addEventListener('click', closeModal)
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ---------- Утилиты ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(str) { return escapeHtml(str); }

  /* ---------- Год в подвале ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Запуск ---------- */
  (async function init() {
    try {
      await loadData();
      buildFilters();
      render();
    } catch (e) {
      // Ошибка уже показана в loadData()
    }
  })();
})();
