# Мобильное приложение

Подробности (плагины, скиллы, экономия токенов, публикация, установка на устройства): `docs/PLAYBOOK.md`. Читай его только когда нужно.

## Рабочий цикл
Каждая фича проходит цикл из трёх агентов (`.claude/agents/`), порядок — в скилле `feature-cycle`:

1. **mobile-builder** — реализует фичу по `SPEC.md`.
2. **mobile-tester** (Sonnet) — пишет и запускает тесты, проверяет сборку и крайние случаи.
3. **mobile-reviewer** (Sonnet) — сверяет результат с `SPEC.md` и ищет неточности.

tester и reviewer запускай параллельно. Если tester вернул `FAIL` или reviewer нашёл расхождения, только список проблем уходит к mobile-builder (продолжай того же агента через SendMessage). Цикл повторяется, пока tester не вернёт `PASS`, а у reviewer не останется ❌ и ⚠️ (или они не будут осознанно приняты владельцем). Релиз — скилл `release`.

## Проект
Приложение — PWA `codelingo/` на чистом HTML/CSS/JS без сборщика и зависимостей. Курсы лежат в `codelingo/courses/*.js` (формат описан в `courses/_core.js`), строки интерфейса — в `i18n.js` (en/ru/uk/cs).

## Команды
- Тесты: `codelingo/tests/run.sh [фильтр]` (например `app:`). Выход 0 = PASS. Печатает только упавшие тесты и итог; полный лог — `VERBOSE=1`.
- Группы: `data:` (задания и переводы), `i18n:`, `files:` (precache, manifest, версия), `app:` (UI в iframe размером с iPhone).
- После изменения любого файла приложения: `tools/bump-version.sh` (поднимает `VERSION` в app.js и `CACHE` в sw.js вместе; проверяет тест `files:`).
- Сборка: `tools/verify-build.sh` → `dist/web/` (PWA для хостинга) и `dist/codelingo.html` (один файл), обе проверяются в headless Chrome.
- Нужны `python3` и Google Chrome. Системный `/usr/local/bin/node` не запускается на macOS 13.2; рабочий Node 22 лежит в проекте: `export PATH="$PWD/.tools/node/bin:$PATH"` (папка `.tools/` в .gitignore).

## Git и GitHub
- Репозиторий: https://github.com/Roman-Lav/codelingo, сайт: https://roman-lav.github.io/codelingo/ (деплой из `main` через `.github/workflows/pages.yml`, перед деплоем гоняются тесты).
- `gh` лежит в проекте: `.tools/gh/bin/gh` (вход выполнен, токен в связке ключей macOS). `git push` авторизуется через него (credential helper настроен только для этого репозитория).
- Одна задача — одна ветка (`feat/…`, `fix/…`, `chore/…`), в `main` через PR. Прямо в `main` не коммить.
- Автокоммит: `.claude/hooks/autocommit.sh` коммитит все изменения после каждого ответа Claude и каждого агента; на `main` сначала создаёт ветку `task/auto-…`. Выключить: `touch .claude/autocommit.off`. Перед началом задачи создай свою ветку, чтобы автокоммиты попадали в неё.
- Ручная проверка: `python3 -m http.server 8000 --directory codelingo` → http://localhost:8000. Service worker — только по https.

## Экономия токенов
- Ищи `grep -n`, не читай файлы целиком; `courses/*.js` — точечно. `dist/` и `icons/` не читай.
- Агентам — конкретные файлы, строки и ожидаемое поведение, ответ коротко.

## ТЗ
Требования хранятся в `SPEC.md`: что делает приложение, список экранов, требования к каждому экрану, целевые платформы и минимальные версии ОС. Неясные моменты записываются в раздел «Открытые вопросы».
