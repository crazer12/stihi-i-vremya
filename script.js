/* =========================================================================
   ИНТЕРАКТИВНОСТЬ САЙТА
   - Рендеринг карточек стихов
   - Фильтрация по категориям
   - Модальное окно с полным текстом
   ========================================================================= */

(function () {
  'use strict';

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

  let activeCategory = 'all';

  /* ----- Генерация кнопок фильтров на основе CATEGORIES из poems.js -----
     Кнопки создаются автоматически: одна на "Все стихи" плюс по одной
     на каждую категорию, в которой есть хотя бы одно стихотворение.
     Порядок кнопок — такой же, как порядок категорий в объекте CATEGORIES.
     Чтобы изменить порядок или названия фильтров, редактируйте CATEGORIES
     в файле poems.js, а не этот файл.
  */
  function buildFilters() {
    filtersNav.innerHTML = '';

    // Кнопка "Все стихи"
    const allBtn = document.createElement('button');
    allBtn.className = 'filter is-active';
    allBtn.dataset.cat = 'all';
    allBtn.innerHTML = `Все&nbsp;стихи <span class="filter__count">(${POEMS.length})</span>`;
    filtersNav.appendChild(allBtn);

    // Кнопки категорий — только те, в которых реально есть стихи
    Object.entries(CATEGORIES).forEach(([key, info]) => {
      const count = POEMS.filter(p => p.category === key).length;
      if (count === 0) return; // пропускаем пустые категории

      const btn = document.createElement('button');
      btn.className = 'filter';
      btn.dataset.cat = key;
      btn.innerHTML = `${info.short} <span class="filter__count">(${count})</span>`;
      filtersNav.appendChild(btn);
    });

    // Обработчики кликов
    filtersNav.querySelectorAll('.filter').forEach(btn => {
      btn.addEventListener('click', () => {
        filtersNav.querySelectorAll('.filter').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeCategory = btn.dataset.cat;
        render();
      });
    });

    // Общее количество стихов в шапке "Об авторе"
    const statEl = document.getElementById('stat-poems');
    if (statEl) statEl.textContent = POEMS.length;
  }

  /* ----- Сортировка стихов: новые первыми ----- */
  function sortByDate(list) {
    return [...list].sort((a, b) => {
      const da = a.date.split('.').reverse().join('-');
      const db = b.date.split('.').reverse().join('-');
      return db.localeCompare(da);
    });
  }

  /* ----- Создание карточки ----- */
  function makeCard(poem, index) {
    const card = document.createElement('button');
    card.className = 'poem-card';
    card.style.animationDelay = `${Math.min(index * 40, 600)}ms`;
    card.dataset.index = POEMS.indexOf(poem);

    const cat = CATEGORIES[poem.category] || CATEGORIES.other;

    card.innerHTML = `
      <p class="poem-card__category" data-cat="${poem.category}">${cat.short}</p>
      <h3 class="poem-card__title">${escapeHtml(poem.title)}</h3>
      <div class="poem-card__footer">
        <time class="poem-card__date">${poem.date}</time>
        <span class="poem-card__arrow" aria-hidden="true">→</span>
      </div>
    `;

    card.addEventListener('click', () => openModal(poem));
    return card;
  }

  /* ----- Рендеринг сетки ----- */
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

    sortByDate(filtered).forEach((poem, i) => {
      grid.appendChild(makeCard(poem, i));
    });
  }

  /* ----- Модальное окно ----- */
  function openModal(poem) {
    const cat = CATEGORIES[poem.category] || CATEGORIES.other;
    mCategory.textContent = cat.name;
    mTitle.textContent    = poem.title;
    mDate.textContent     = poem.date;
    mLink.href            = poem.url;

    if (poem.text && poem.text.trim().length > 0) {
      mText.textContent = poem.text;
      mText.style.display = 'block';
      mPlaceholder.style.display = 'none';
    } else {
      mText.textContent = '';
      mText.style.display = 'none';
      mPlaceholder.style.display = 'block';
    }

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

  /* ----- Утилиты ----- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ----- Текущий год в подвале ----- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ----- Запуск ----- */
  buildFilters();
  render();
})();