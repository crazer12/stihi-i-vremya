/* ───────────────────────────────────────────────────────────────
   ГЕНЕРАТОР ХЕША ПАРОЛЯ
   Запуск: node generate-password.js
   Спросит пароль, выведет bcrypt-хеш для вставки в .env
   ─────────────────────────────────────────────────────────────── */

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Отключаем эхо ввода — пароль не светится в терминале
function askPassword(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let password = '';
    stdin.on('data', function onData(char) {
      const c = char.toString('utf8');
      if (c === '\r' || c === '\n' || c === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') { // Ctrl+C
        process.exit(1);
      } else if (c === '\u007f' || c === '\b') { // backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += c;
        process.stdout.write('*');
      }
    });
  });
}

(async () => {
  console.log('Генерация хеша пароля для админки.');
  console.log('Пароль должен быть длинным (минимум 12 символов), уникальным.');
  console.log('');

  const password = await askPassword('Введите пароль: ');

  if (password.length < 8) {
    console.error('Ошибка: пароль слишком короткий (минимум 8 символов).');
    process.exit(1);
  }

  const password2 = await askPassword('Повторите пароль: ');

  if (password !== password2) {
    console.error('Ошибка: пароли не совпадают.');
    process.exit(1);
  }

  console.log('Считаю хеш... (это занимает несколько секунд)');
  const hash = await bcrypt.hash(password, 12);

  console.log('');
  console.log('Готово! Скопируйте эту строку в файл .env:');
  console.log('');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('');
  rl.close();
})();
