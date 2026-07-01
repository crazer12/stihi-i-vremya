/* ───────────────────────────────────────────────────────────────
   Логика админки.
   Работает с тем же сервером, что и отдаёт страницу.
   ─────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ─── Состояние ───
  const state = {
    csrfToken: null,
    poems: [],
    categories: {},
    selectedId: null,
    search: '',
    filterCategory: '',
    dirty: false
  };

  // ─── Элементы ───
  const $ = id => document.getElementById(id);
  const screenLogin  = $('screen-login');
  const screenEditor = $('screen-editor');
  const loginForm    = $('login-form');
  const loginError   = $('login-error');
  const loginBtn     = $('login-btn');
  const poemList     = $('poem-list');
  const poemForm     = $('poem-form');
  const formEmpty    = $('form-empty');
  const formError    = $('form-error');
  const formSuccess  = $('form-success');
  const searchInput  = $('search-input');
  const filterCat    = $('filter-category');
  const fieldCat     = $('field-category');
  const counter      = $('poem-counter');
  const charCounter  = $('char-counter');
  const confirmModal = $('confirm-modal');
  const confirmText  = $('confirm-text');
  const categoriesBtn = $('categories-btn');
  const categoriesModal = $('categories-modal');
  const catList      = $('cat-list');
  const catNewName   = $('cat-new-name');
  const catAddBtn    = $('cat-add-btn');
  const catError     = $('cat-error');
  const catSuccess   = $('cat-success');

  // ─── API helper ───
  async function api(path, options = {}) {
    const opts = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: { ...(options.headers || {}) }
    };
    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    if (opts.method !== 'GET' && state.csrfToken) {
      opts.headers['X-CSRF-Token'] = state.csrfToken;
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* пусто */ }
    if (!res.ok) {
      const err = new Error((data && (data.error || (data.errors || []).join('; '))) || `Ошибка ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function refreshCsrf() {
    const data = await api('/api/csrf-token');
    state.csrfToken = data.csrfToken;
  }

  // ─── Логин ───
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Вход…';
    try {
      const password = $('login-password').value;
      await refreshCsrf();
      await api('/api/login', { method: 'POST', body: { password } });
      // После логина обновляем CSRF (сессия пересоздана)
      await refreshCsrf();
      await loadEditor();
    } catch (e) {
      loginError.textContent = e.message;
      loginError.hidden = false;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Войти';
      $('login-password').value = '';
    }
  });

  // ─── Загрузка редактора ───
  async function loadEditor() {
    const data = await api('/api/poems');
    state.poems = data.poems || [];
    state.categories = data.categories || {};

    fillCategorySelects();
    renderPoemList();
    updateCounter();

    screenLogin.hidden = true;
    screenEditor.hidden = false;
  }

  function fillCategorySelects() {
    // Селект фильтра в боковой панели
    filterCat.innerHTML = '<option value="">Все категории</option>';
    // Селект в форме редактирования
    fieldCat.innerHTML = '';
    const entries = Object.entries(state.categories);
    if (entries.length === 0) {
      fieldCat.innerHTML = '<option value="other">Без рубрики</option>';
      return;
    }
    for (const [key, info] of entries) {
      const opt1 = document.createElement('option');
      opt1.value = key; opt1.textContent = info.name || key;
      filterCat.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = key; opt2.textContent = info.name || key;
      fieldCat.appendChild(opt2);
    }
  }

  function updateCounter() {
    const total = state.poems.length;
    const withText = state.poems.filter(p => p.text && p.text.trim()).length;
    counter.textContent = `${total} стих${plural(total, 'отворение', 'отворения', 'отворений')} (${withText} с текстом)`;
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ─── Список стихов ───
  function renderPoemList() {
    const filtered = filterPoems();
    poemList.innerHTML = '';
    if (filtered.length === 0) {
      poemList.innerHTML = '<p class="empty-state">Ничего не найдено</p>';
      return;
    }
    const sorted = [...filtered].sort((a, b) => {
      const da = parseDate(a.date), db = parseDate(b.date);
      return db - da;
    });
    for (const poem of sorted) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'poem-item';
      if (poem.id === state.selectedId) btn.classList.add('is-active');
      if (!poem.text || !poem.text.trim()) btn.classList.add('no-text');

      const catInfo = state.categories[poem.category];
      const catShort = catInfo ? (catInfo.short || catInfo.name) : poem.category;

      btn.innerHTML = `
        <span class="poem-item__title"></span>
        <span class="poem-item__meta">
          <span class="poem-item__category"></span>
          <span class="poem-item__date"></span>
        </span>
      `;
      btn.querySelector('.poem-item__title').textContent = poem.title;
      btn.querySelector('.poem-item__category').textContent = catShort;
      btn.querySelector('.poem-item__date').textContent = poem.date;
      btn.addEventListener('click', () => selectPoem(poem.id));
      poemList.appendChild(btn);
    }
  }

  function parseDate(d) {
    const m = String(d).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return 0;
    return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  }

  function filterPoems() {
    const q = state.search.trim().toLowerCase();
    return state.poems.filter(p => {
      if (state.filterCategory && p.category !== state.filterCategory) return false;
      if (q) {
        const hay = (p.title + ' ' + (p.text || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderPoemList();
  });
  filterCat.addEventListener('change', (e) => {
    state.filterCategory = e.target.value;
    renderPoemList();
  });

  // ─── Форма ───
  function selectPoem(id) {
    if (state.dirty && !confirm('Несохранённые изменения будут потеряны. Продолжить?')) return;
    const poem = state.poems.find(p => p.id === id);
    if (!poem) return;
    state.selectedId = id;
    showForm(poem);
    renderPoemList();
  }

  function showForm(poem) {
    $('poem-id').value     = poem.id || '';
    $('field-title').value = poem.title || '';
    $('field-date').value  = poem.date || '';
    $('field-category').value = poem.category || Object.keys(state.categories)[0] || 'other';
    $('field-url').value   = poem.url || '';
    $('field-text').value  = poem.text || '';

    formEmpty.hidden = true;
    poemForm.hidden = false;
    $('delete-btn').hidden = !poem.id;
    updateCharCounter();
    clearMessages();
    state.dirty = false;
  }

  function clearForm() {
    state.selectedId = null;
    poemForm.hidden = true;
    formEmpty.hidden = false;
    state.dirty = false;
    renderPoemList();
  }

  $('new-poem-btn').addEventListener('click', () => {
    if (state.dirty && !confirm('Несохранённые изменения будут потеряны. Продолжить?')) return;
    state.selectedId = null;
    const today = new Date();
    const dateStr = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()}`;
    showForm({ id: '', title: '', date: dateStr, category: Object.keys(state.categories)[0] || 'other', url: '', text: '' });
    renderPoemList();
    $('field-title').focus();
  });

  function pad(n) { return String(n).padStart(2, '0'); }

  $('cancel-btn').addEventListener('click', clearForm);

  // Отслеживание изменений
  poemForm.addEventListener('input', () => {
    state.dirty = true;
    if (event && event.target && event.target.id === 'field-text') updateCharCounter();
  });

  function updateCharCounter() {
    const len = $('field-text').value.length;
    charCounter.textContent = `${len.toLocaleString('ru-RU')} символ${plural(len, '', 'а', 'ов')}`;
  }

  // Сохранение
  poemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    const id = $('poem-id').value;
    const body = {
      title:    $('field-title').value.trim(),
      date:     $('field-date').value.trim(),
      category: $('field-category').value,
      url:      $('field-url').value.trim(),
      text:     $('field-text').value
    };
    const saveBtn = $('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение…';
    try {
      let result;
      if (id) {
        result = await api(`/api/poems/${encodeURIComponent(id)}`, { method: 'PUT', body });
      } else {
        result = await api('/api/poems', { method: 'POST', body });
      }
      // Обновляем локальный список
      const updated = result.poem;
      if (id) {
        const idx = state.poems.findIndex(p => p.id === id);
        if (idx !== -1) state.poems[idx] = updated;
      } else {
        state.poems.push(updated);
      }
      state.selectedId = updated.id;
      state.dirty = false;
      formSuccess.textContent = 'Сохранено';
      formSuccess.hidden = false;
      setTimeout(() => { formSuccess.hidden = true; }, 2500);
      $('delete-btn').hidden = false;
      $('poem-id').value = updated.id;
      renderPoemList();
      updateCounter();
    } catch (e) {
      formError.textContent = e.message;
      formError.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  });

  // Удаление с подтверждением
  $('delete-btn').addEventListener('click', () => {
    const id = $('poem-id').value;
    if (!id) return;
    const poem = state.poems.find(p => p.id === id);
    if (!poem) return;
    confirmText.textContent = `Стихотворение «${poem.title}» будет удалено безвозвратно.`;
    confirmModal.hidden = false;
    $('confirm-ok').onclick = () => doDelete(id);
  });
  $('confirm-cancel').addEventListener('click', () => { confirmModal.hidden = true; });
  document.querySelector('.confirm-modal__backdrop').addEventListener('click', () => { confirmModal.hidden = true; });

  async function doDelete(id) {
    confirmModal.hidden = true;
    try {
      await api(`/api/poems/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.poems = state.poems.filter(p => p.id !== id);
      clearForm();
      updateCounter();
    } catch (e) {
      formError.textContent = e.message;
      formError.hidden = false;
    }
  }

  // Выход
  $('logout-btn').addEventListener('click', async () => {
    if (state.dirty && !confirm('Несохранённые изменения будут потеряны. Выйти?')) return;
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  });

  function clearMessages() {
    formError.hidden = true;
    formSuccess.hidden = true;
  }

  // Защита от случайного закрытия с несохранёнными данными
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ─────────────────────────────────────────────────────────────
  // УПРАВЛЕНИЕ КАТЕГОРИЯМИ
  // ─────────────────────────────────────────────────────────────

  // Транслитерация для автогенерации ключа новой категории (civic, love, и т.д.)
  const TRANSLIT_MAP = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  function makeCategoryKey(name) {
    const base = name.toLowerCase().split('').map(ch => TRANSLIT_MAP[ch] ?? ch).join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'category';
    // Гарантируем уникальность ключа
    let key = base, i = 2;
    while (state.categories[key]) { key = `${base}_${i}`; i++; }
    return key;
  }

  function poemCountInCategory(key) {
    return state.poems.filter(p => p.category === key).length;
  }

  function renderCategoriesModal() {
    catList.innerHTML = '';
    const entries = Object.entries(state.categories);
    if (entries.length === 0) {
      catList.innerHTML = '<p class="empty-state">Категорий пока нет.</p>';
      return;
    }
    for (const [key, info] of entries) {
      const count = poemCountInCategory(key);
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <input type="text" value="${escapeAttr(info.name || key)}" data-key="${escapeAttr(key)}" maxlength="100" />
        <span class="cat-row__count">${count} стих${plural(count, '', 'а', 'ов')}</span>
        <button type="button" class="cat-row__delete" title="${count > 0 ? 'Нельзя удалить: есть стихи' : 'Удалить категорию'}" ${count > 0 ? 'disabled' : ''} data-key="${escapeAttr(key)}">✕</button>
      `;
      catList.appendChild(row);
    }

    // Переименование по blur (когда убрали фокус с поля)
    catList.querySelectorAll('input[type="text"]').forEach(input => {
      const originalValue = input.value;
      input.addEventListener('blur', async () => {
        const newName = input.value.trim();
        if (!newName || newName === originalValue) {
          input.value = originalValue || newName;
          return;
        }
        await renameCategory(input.dataset.key, newName);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });

    // Удаление
    catList.querySelectorAll('.cat-row__delete').forEach(btn => {
      btn.addEventListener('click', () => deleteCategory(btn.dataset.key));
    });
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function clearCatMessages() {
    catError.hidden = true;
    catSuccess.hidden = true;
  }

  async function saveCategoriesToServer() {
    await api('/api/categories', { method: 'PUT', body: state.categories });
  }

  async function renameCategory(key, newName) {
    clearCatMessages();
    const prevName = state.categories[key].name;
    state.categories[key] = {
      ...state.categories[key],
      name: newName,
      short: newName.length > 20 ? newName.slice(0, 20) : newName
    };
    try {
      await saveCategoriesToServer();
      catSuccess.textContent = `Категория переименована в «${newName}»`;
      catSuccess.hidden = false;
      fillCategorySelects();
      buildFilters();
      renderPoemList();
    } catch (e) {
      state.categories[key].name = prevName; // откат при ошибке
      catError.textContent = e.message;
      catError.hidden = false;
      renderCategoriesModal();
    }
  }

  async function addCategory() {
    clearCatMessages();
    const name = catNewName.value.trim();
    if (!name) {
      catError.textContent = 'Введите название категории';
      catError.hidden = false;
      return;
    }
    if (name.length > 100) {
      catError.textContent = 'Слишком длинное название';
      catError.hidden = false;
      return;
    }
    const key = makeCategoryKey(name);
    state.categories[key] = { name, short: name.length > 20 ? name.slice(0, 20) : name };
    catAddBtn.disabled = true;
    try {
      await saveCategoriesToServer();
      catNewName.value = '';
      catSuccess.textContent = `Категория «${name}» добавлена`;
      catSuccess.hidden = false;
      fillCategorySelects();
      buildFilters();
      renderCategoriesModal();
    } catch (e) {
      delete state.categories[key]; // откат при ошибке
      catError.textContent = e.message;
      catError.hidden = false;
    } finally {
      catAddBtn.disabled = false;
    }
  }

  async function deleteCategory(key) {
    clearCatMessages();
    if (poemCountInCategory(key) > 0) return; // защита на всякий случай, кнопка и так disabled
    const info = state.categories[key];
    if (!confirm(`Удалить категорию «${info.name}»? Стихов в ней нет, действие безопасно.`)) return;

    const backup = state.categories[key];
    delete state.categories[key];
    try {
      await saveCategoriesToServer();
      fillCategorySelects();
      buildFilters();
      renderCategoriesModal();
    } catch (e) {
      state.categories[key] = backup; // откат
      catError.textContent = e.message;
      catError.hidden = false;
      renderCategoriesModal();
    }
  }

  function openCategoriesModal() {
    clearCatMessages();
    catNewName.value = '';
    renderCategoriesModal();
    categoriesModal.hidden = false;
  }
  function closeCategoriesModal() {
    categoriesModal.hidden = true;
  }

  categoriesBtn.addEventListener('click', openCategoriesModal);
  $('cat-close-btn').addEventListener('click', closeCategoriesModal);
  categoriesModal.querySelectorAll('[data-cat-close]').forEach(el =>
    el.addEventListener('click', closeCategoriesModal)
  );
  catAddBtn.addEventListener('click', addCategory);
  catNewName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
  });

  // ─── Старт ───
  (async function init() {
    try {
      const me = await api('/api/me');
      if (me.authenticated) {
        await refreshCsrf();
        await loadEditor();
      } else {
        screenLogin.hidden = false;
      }
    } catch (e) {
      screenLogin.hidden = false;
    }
  })();

})();
