/* ───────────────────────────────────────────────────────────────
   СЕРВЕР АДМИНКИ stihi-i-vremya.ru
   Node.js + Express. Запускается за nginx (reverse proxy).

   Что делает:
   - Раздаёт страницу /redaktor (логин и редактор стихов)
   - Проверяет пароль через bcrypt
   - Хранит сессию в подписанной httpOnly cookie
   - Защищает изменяющие запросы CSRF-токеном
   - Ограничивает попытки входа (5 за 15 минут с одного IP)
   - CRUD по стихам (GET /api/poems, POST/PUT/DELETE с авторизацией)
   - Делает бэкап poems.json перед каждой записью
   ─────────────────────────────────────────────────────────────── */

const path = require('path');
const fs = require('fs').promises;
const fssync = require('fs');
const crypto = require('crypto');

// Загружаем переменные из .env (простой парсер без зависимости dotenv)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fssync.existsSync(envPath)) {
    console.error('ОШИБКА: файл .env не найден. Скопируйте .env.example в .env и заполните.');
    process.exit(1);
  }
  const content = fssync.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}
loadEnv();

const express        = require('express');
const session        = require('express-session');
const cookieParser   = require('cookie-parser');
const bcrypt         = require('bcryptjs');
const rateLimit      = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');

// ───── Проверка обязательных переменных окружения ─────
const REQUIRED_ENV = ['ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'CSRF_SECRET', 'DATA_FILE', 'BACKUP_DIR'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key].includes('замените') || process.env[key].includes('ЗДЕСЬ')) {
    console.error(`ОШИБКА: переменная ${key} в .env не задана или не настроена.`);
    process.exit(1);
  }
}

const PORT         = parseInt(process.env.PORT || '3000', 10);
const DATA_FILE    = process.env.DATA_FILE;
const BACKUP_DIR   = process.env.BACKUP_DIR;
const IS_PROD      = process.env.NODE_ENV === 'production';
const COOKIE_NAME  = process.env.SESSION_COOKIE_NAME || 'siv_sid';

const app = express();

// За reverse-proxy nginx нужно доверять X-Forwarded-* заголовкам — иначе
// rate-limit и secure cookies работать не будут.
app.set('trust proxy', 1);

app.use(express.json({ limit: '500kb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ───── Сессии в httpOnly cookie ─────
app.use(session({
  name: COOKIE_NAME,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // продлеваем срок жизни при каждом запросе
  cookie: {
    httpOnly: true,
    secure: IS_PROD,    // только по HTTPS в продакшене
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 часов
  }
}));

// ───── CSRF-защита ─────
const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  getSessionIdentifier: req => req.sessionID || '',
  cookieName: IS_PROD ? '__Host-csrf' : 'csrf-token',
  cookieOptions: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/'
  },
  size: 64,
  getCsrfTokenFromRequest: req => req.headers['x-csrf-token']
});

// ───── Защита от перебора пароля ─────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5,                    // 5 попыток
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Общий лимит на API: 200 запросов в минуту с одного IP — защита от DDoS-ботов
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// ───── Middleware: проверка авторизации ─────
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Не авторизован' });
}

// ───── Работа с файлом данных ─────
async function readPoems() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Файл не существует — создаём пустую структуру
      return { categories: {}, poems: [] };
    }
    throw e;
  }
}

async function writePoems(data) {
  // Бэкап перед записью
  try {
    await fs.access(DATA_FILE);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `poems-${ts}.json`);
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.copyFile(DATA_FILE, backupPath);
    // Чистим старые бэкапы — оставляем 30 последних
    const files = (await fs.readdir(BACKUP_DIR))
      .filter(f => f.startsWith('poems-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const f of files.slice(30)) {
      await fs.unlink(path.join(BACKUP_DIR, f));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Ошибка бэкапа:', e.message);
  }

  // Атомарная запись: пишем в .tmp, потом переименовываем
  const tmpPath = DATA_FILE + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, DATA_FILE);
}

// ───── Валидация входных данных ─────
function validatePoem(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['Некорректные данные'];
  }
  const { title, date, category, url, text } = body;

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 300) {
    errors.push('Название обязательно (до 300 символов)');
  }
  if (typeof date !== 'string' || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
    errors.push('Дата должна быть в формате ДД.ММ.ГГГГ');
  }
  if (typeof category !== 'string' || category.trim().length === 0 || category.length > 50) {
    errors.push('Категория обязательна');
  }
  if (url !== undefined && url !== '' && (typeof url !== 'string' || url.length > 500)) {
    errors.push('Некорректная ссылка');
  }
  if (url && !/^https?:\/\//i.test(url)) {
    errors.push('Ссылка должна начинаться с http:// или https://');
  }
  if (typeof text !== 'string' || text.length > 50000) {
    errors.push('Текст слишком длинный (максимум 50000 символов)');
  }

  return errors;
}

// Очистка от потенциально опасных управляющих символов
function sanitize(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// ─────────────────────────────────────────────────────────────────
// МАРШРУТЫ
// ─────────────────────────────────────────────────────────────────

// Главная страница админки
app.get('/redaktor', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public-admin', 'admin.html'));
});

// Получить CSRF-токен (фронт запрашивает после загрузки)
app.get('/api/csrf-token', (req, res) => {
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
});

// Логин
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
      return res.status(400).json({ error: 'Введите пароль' });
    }

    const ok = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!ok) {
      // Небольшая задержка, чтобы усложнить таймовые атаки
      await new Promise(r => setTimeout(r, 500));
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    // Регенерация ID сессии при входе — защита от session fixation
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Ошибка сессии' });
      req.session.isAdmin = true;
      req.session.loginAt = Date.now();
      res.json({ success: true });
    });
  } catch (e) {
    console.error('Ошибка логина:', e);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Выход
app.post('/api/logout', requireAuth, doubleCsrfProtection, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });
});

// Проверка авторизации (для фронта при загрузке страницы)
app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// Получить все стихи (нужно и для админки, и для самого сайта)
app.get('/api/poems', async (req, res) => {
  try {
    const data = await readPoems();
    res.json(data);
  } catch (e) {
    console.error('Ошибка чтения:', e);
    res.status(500).json({ error: 'Не удалось загрузить стихи' });
  }
});

// Добавить новый стих
app.post('/api/poems', requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const errors = validatePoem(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const data = await readPoems();
    const newPoem = {
      id: crypto.randomBytes(8).toString('hex'),
      title:    sanitize(req.body.title).trim(),
      date:     req.body.date,
      category: sanitize(req.body.category).trim(),
      url:      req.body.url ? sanitize(req.body.url).trim() : '',
      text:     sanitize(req.body.text)
    };
    data.poems.push(newPoem);
    await writePoems(data);
    res.json({ success: true, poem: newPoem });
  } catch (e) {
    console.error('Ошибка добавления:', e);
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

// Изменить стих
app.put('/api/poems/:id', requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const errors = validatePoem(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const data = await readPoems();
    const idx = data.poems.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Стих не найден' });

    data.poems[idx] = {
      ...data.poems[idx],
      title:    sanitize(req.body.title).trim(),
      date:     req.body.date,
      category: sanitize(req.body.category).trim(),
      url:      req.body.url ? sanitize(req.body.url).trim() : '',
      text:     sanitize(req.body.text)
    };
    await writePoems(data);
    res.json({ success: true, poem: data.poems[idx] });
  } catch (e) {
    console.error('Ошибка изменения:', e);
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

// Удалить стих
app.delete('/api/poems/:id', requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const data = await readPoems();
    const idx = data.poems.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Стих не найден' });

    data.poems.splice(idx, 1);
    await writePoems(data);
    res.json({ success: true });
  } catch (e) {
    console.error('Ошибка удаления:', e);
    res.status(500).json({ error: 'Не удалось удалить' });
  }
});

// Получить/изменить категории
app.get('/api/categories', async (req, res) => {
  try {
    const data = await readPoems();
    res.json(data.categories || {});
  } catch (e) {
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

app.put('/api/categories', requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const cats = req.body;
    if (!cats || typeof cats !== 'object') {
      return res.status(400).json({ error: 'Некорректные данные' });
    }
    // Валидация: каждая категория = { name, short }
    for (const [key, val] of Object.entries(cats)) {
      if (!/^[a-z0-9_]{1,30}$/i.test(key)) {
        return res.status(400).json({ error: `Некорректный ключ категории: ${key}` });
      }
      if (!val || typeof val.name !== 'string' || typeof val.short !== 'string' ||
          val.name.length > 100 || val.short.length > 50) {
        return res.status(400).json({ error: `Некорректные данные категории ${key}` });
      }
    }
    const data = await readPoems();
    data.categories = cats;
    await writePoems(data);
    res.json({ success: true });
  } catch (e) {
    console.error('Ошибка категорий:', e);
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

// ───── Обработка ошибок ─────
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || (err.message && err.message.includes('csrf'))) {
    return res.status(403).json({ error: 'CSRF-токен недействителен. Перезагрузите страницу.' });
  }
  console.error('Необработанная ошибка:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ───── Запуск ─────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Админка слушает 127.0.0.1:${PORT}`);
  console.log(`Режим: ${IS_PROD ? 'production' : 'development'}`);
  console.log(`Данные: ${DATA_FILE}`);
});
