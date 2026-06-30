/* ───────────────────────────────────────────────────────────────
   МИГРАЦИЯ poems.js → poems.json
   Запуск: node migrate.js /путь/к/poems.js /путь/к/poems.json
   ─────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [,, srcArg, dstArg] = process.argv;
if (!srcArg || !dstArg) {
  console.error('Использование: node migrate.js <poems.js> <poems.json>');
  console.error('Пример: node migrate.js ./poems.js /var/www/stihi-i-vremya/data/poems.json');
  process.exit(1);
}

const src = path.resolve(srcArg);
const dst = path.resolve(dstArg);

if (!fs.existsSync(src)) {
  console.error('Исходный файл не найден:', src);
  process.exit(1);
}

// Выполняем JS-файл в изолированной области, чтобы получить POEMS и CATEGORIES
const code = fs.readFileSync(src, 'utf8');
const sandbox = { POEMS: null, CATEGORIES: null };
const wrapped = `(function() {
  ${code.replace(/^\s*const\s+/gm, 'var ')}
  if (typeof POEMS !== 'undefined') sandbox.POEMS = POEMS;
  if (typeof CATEGORIES !== 'undefined') sandbox.CATEGORIES = CATEGORIES;
})()`;

try {
  const fn = new Function('sandbox', wrapped);
  fn(sandbox);
} catch (e) {
  console.error('Не удалось разобрать poems.js:', e.message);
  process.exit(1);
}

if (!Array.isArray(sandbox.POEMS)) {
  console.error('В файле не найдена константа POEMS как массив');
  process.exit(1);
}

// Добавляем уникальные ID каждому стиху
const poems = sandbox.POEMS.map(p => ({
  id: crypto.randomBytes(8).toString('hex'),
  title:    String(p.title || ''),
  date:     String(p.date || ''),
  category: String(p.category || 'other'),
  url:      String(p.url || ''),
  text:     String(p.text || '')
}));

const data = {
  categories: sandbox.CATEGORIES || {},
  poems
};

// Создаём папку назначения, если её нет
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify(data, null, 2), 'utf8');

console.log(`Готово! Перенесено ${poems.length} стихов и ${Object.keys(data.categories).length} категорий.`);
console.log(`Файл сохранён: ${dst}`);
