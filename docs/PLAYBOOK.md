# CodeLingo — Playbook

Всё про процесс разработки, инструменты Claude Code, сборку и установку в одном месте.
Короткая выжимка, которую Claude читает в каждой сессии, лежит в `CLAUDE.md`. Здесь подробности.

---

## 1. Что подключено к проекту

### Плагины (`.claude/settings.json` → `enabledPlugins`, проверены Anthropic)
| Плагин | Зачем | Постоянная цена* |
|---|---|---|
| `frontend-design` | качество UI/вёрстки при новых экранах | ~80 ток |
| `session-report` | HTML-отчёт: куда ушли токены, кэш, дорогие запросы | ~70 ток |
| `claude-md-management` | `/revise-claude-md`, аудит CLAUDE.md, чтобы он оставался коротким | ~180 ток |

\* Постоянная цена — описание скилла в каждой сессии; полный текст грузится только при вызове.
Плагины ставятся автоматически, когда проект открывают в Claude Code и доверяют папке. Вручную: `/plugin` → Installed.

### Скиллы проекта (`.claude/skills/`)
| Скилл | Вызов | Что делает |
|---|---|---|
| `feature-cycle` | авто или `/feature-cycle` | цикл builder → tester ∥ reviewer с короткими промптами и максимум 3 итерациями |
| `release` | авто или `/release` | бамп версии → тесты → сборка → публикация → инструкция по установке |
| `caveman` | «caveman mode» | сверхкраткие ответы, меньше выходных токенов (скачан из github.com/akramsystems/caveman, MIT) |
| `responsive-check` | авто | скриншоты страницы в нескольких размерах + поиск переполнения (скачан из github.com/petrovicistefan/claude-code-plugins, MIT; Python + Chrome, без npm) |
| `design-critique` | авто или `/design-critique` | разбор дизайна: иерархия, консистентность, удобство (из плагина Anthropic Design, без его 9 MCP-коннекторов) |
| `accessibility-review` | авто или `/accessibility-review` | аудит WCAG 2.1 AA: контраст, зоны нажатия, клавиатура, screen reader (оттуда же) |
| `ios-application-dev` | только `/ios-application-dev` | справочник UIKit/SwiftUI/HIG. Для PWA нужен редко, поэтому автозагрузка отключена и он не тратит токены |

Глобальный скилл `phone-pwa` (`~/.claude/skills/`) уже покрывает особенности PWA на iPhone. Проект ему соответствует.

### Встроенные команды, которые стоит использовать
`/code-review` (баги в диффе), `/simplify` (чистка кода), `/security-review`, `/fewer-permission-prompts`, `/compact`, `/clear`, `/context`, `/cost`.

### Что смотрели и не поставили
| Кандидат | Почему нет |
|---|---|
| `code-review`, `pr-review-toolkit`, `code-simplifier`, `claude-security` (плагины) | дублируют встроенные `/code-review`, `/simplify`, `/security-review` |
| Token Shield | 22 КБ текста при вызове + Python MCP-сервер; его полезные правила перенесены в раздел 2 |
| Плагин Design (Anthropic) целиком | тянет 9 MCP-серверов (Slack, Figma, Linear, Gmail…) и ~620 ток в каждую сессию — взяты только 2 нужных скилла |
| ux-ui-audit, consistent-ui | 18–21 КБ при вызове, пробы ux-ui-audit требуют браузерного MCP; основное покрывают layout-check + design-critique |
| Superpowers | большой набор общих скиллов (TDD и т. п.), постоянная нагрузка выше пользы для проекта такого размера |
| Axe Accessibility, Perf Profiler, Responsive Check | нужны Node/npm или MCP-сервер, а Node на этом Mac не запускается; доступность и 320 px уже проверяют тесты `app:` |
| expo, Flutter-плагины | проект не на React Native или Flutter |

Если понадобится: `claude plugin install <имя> --scope project`, проверить цену — `claude plugin details <имя>`.

---

## 2. Экономия токенов: правила

Чем больше влияние, тем выше пункт.

1. **Модель по задаче.** `mobile-tester` и `mobile-reviewer` работают на Sonnet (`model: sonnet` во frontmatter), `mobile-builder` — на основной модели. Простые вопросы задавайте в той же сессии, без агентов.
2. **Не ломать кэш.** Кэш — это совпадение префикса: смена модели, effort, CLAUDE.md или набора MCP посреди сессии пересчитывает весь контекст. Настройки меняйте между сессиями.
3. **Короткие сессии по задаче.** Новая фича — `/clear`. Длинная сессия → `/compact` с указанием, что сохранить.
4. **Агенты продолжать, а не запускать заново.** Повторная итерация builder идёт через SendMessage тому же агенту, с одним списком проблем.
5. **Точные промпты агентам:** файлы, строки, ожидаемое поведение. Расплывчатый промпт = агент читает весь проект.
6. **Не читать лишнее.** `grep -n` вместо чтения файла целиком; `courses/*.js` открывать точечно; `dist/` и иконки не читать (это сборка и бинарники).
7. **Компактный вывод тестов.** `codelingo/tests/run.sh` печатает только упавшие тесты и итог; полный лог — `VERBOSE=1`.
8. **Отключить лишние MCP.** У аккаунта подключены Adobe, Shopify, Gmail, Drive, Firecrawl, Composio и др. — к PWA они не относятся. Их схемы в основном отложенные (ToolSearch), но имена всё равно попадают в контекст. Выключите ненужное в `/mcp` и в настройках коннекторов claude.ai.
9. **Замер.** `/cost`, `/context`, скилл `session-report` — смотрите, где реально уходит.

### Разрешения (рекомендуется добавить вручную)
Агент не может сам расширять свои права, поэтому этот блок нужно вставить в `.claude/settings.json` самостоятельно (или запустить `/fewer-permission-prompts`). Тогда команды проекта не будут прерываться подтверждениями:
```json
"permissions": {
  "allow": [
    "Bash(codelingo/tests/run.sh*)", "Bash(VERBOSE=1 codelingo/tests/run.sh*)",
    "Bash(tools/verify-build.sh)", "Bash(python3 tools/build.py)", "Bash(tools/bump-version.sh*)",
    "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)"
  ],
  "deny": ["Read(./dist/**)", "Read(./codelingo/icons/**)"]
}
```

---

## 3. Рабочий цикл
1. Требование → `SPEC.md`. Неясное → «Открытые вопросы».
2. `feature-cycle`: builder → (tester ∥ reviewer) → правки → повтор, пока не PASS и нет ❌/⚠️.
3. `release`.

## 4. Сборка
| Команда | Результат |
|---|---|
| `codelingo/tests/run.sh [фильтр]` | тесты в headless Chrome (data:, i18n:, files:, app:) |
| `tools/bump-version.sh [patch\|minor\|major\|X.Y.Z]` | поднимает `VERSION` и `CACHE` вместе |
| `python3 tools/build.py` | `dist/web/` (PWA для хостинга) + `dist/codelingo.html` (один файл, всё встроено) |
| `tools/verify-build.sh` | сборка + проверка, что обе версии реально запускаются |
| `python3 tools/layout-check.py [--devices se1,ipad] [--dark] [--code l] [--lang cs]` | раскладка всех экранов на 10 устройствах (320 px … iPad, альбомная, десктоп) с эмуляцией выреза/home indicator: переполнение, safe area, перекрытия, обрезанный текст, зоны нажатия; скриншоты в `dist/layout/` |

Зависимости: только `python3` и Google Chrome. Node и npm не нужны.

---

## 5. Публикация (GitHub Pages, бесплатно)
`.github/workflows/pages.yml` при каждом push в `main` прогоняет тесты, собирает и выкладывает `dist/web/`.

Первый раз (терминал, из корня проекта):
```bash
git add -A && git commit -m "CodeLingo 1.0"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
Затем: GitHub → репозиторий → **Settings → Pages → Source: GitHub Actions**. Через 1–2 минуты приложение доступно по адресу `https://<user>.github.io/<repo>/`.

Без git: **Netlify Drop** — перетащить папку `dist/web` на https://app.netlify.com/drop, адрес https выдаётся сразу. Также подходит Cloudflare Pages.

Страница публичная. Обновление на телефоне подхватывается со второго запуска после деплоя.

---

## 6. Установка на устройство

| Способ | Устройство | Что нужно | Офлайн |
|---|---|---|---|
| **A. PWA с https-адреса** (рекомендуется) | iPhone, Android, ПК | адрес из раздела 5 | ✅ |
| B. APK для Android (PWABuilder, TWA) | Android | адрес из раздела 5 | ✅ |
| C. Google Play | Android | B + аккаунт разработчика $25 разово | ✅ |
| D. App Store | iPhone | Apple Developer $99/год + свежий Xcode | ✅ |
| E. Один файл `dist/codelingo.html` | ПК, Android | ничего | ✅ |
| F. Локальная сеть (для теста) | любое | Mac и телефон в одной Wi-Fi | ❌ |

**A. iPhone:** открыть адрес в **Safari** (не в Chrome) → «Поделиться» → **«На экран Домой»** → «Добавить».
**A. Android:** открыть в **Chrome** → меню ⋮ → **«Установить приложение»** (или «Добавить на главный экран»).
**A. ПК:** Chrome/Edge → значок установки в адресной строке.

**B. APK:** https://www.pwabuilder.com → вставить адрес → *Package for stores* → **Android** → скачать zip (внутри подписанный `.apk` для установки и `.aab` для Play, плюс ключ подписи — **сохраните его**). На телефоне: передать `.apk` → разрешить «Установка из неизвестных источников» → установить.
Чтобы не было адресной строки, файл `assetlinks.json` из zip должен лежать в `https://<домен>/.well-known/assetlinks.json`, то есть в корне домена. Для `<user>.github.io/<repo>` это не работает: нужен репозиторий `<user>.github.io` или свой домен. Без этого приложение работает, но с полосой браузера сверху.

**C. Google Play:** загрузить `.aab` в Play Console (аккаунт $25), заполнить карточку и политику конфиденциальности (данных не собираем — так и указать).

**D. App Store:** PWABuilder → *iOS* → Xcode-проект. Нужны Mac с актуальной macOS и Xcode (на этом Mac стоит macOS 13.2 — для текущего Xcode систему придётся обновить), аккаунт Apple Developer $99/год. Apple часто отклоняет «обёртки сайта» (guideline 4.2), так что вариант A для iPhone практичнее. Для себя без App Store: Xcode → запуск на своём iPhone с бесплатным Apple ID (приложение живёт 7 дней).

**E. Один файл:** отправить `dist/codelingo.html` и открыть в браузере. На ПК и Android работает полностью. **На iPhone не работает**: файл из «Файлов» или AirDrop открывается в Quick Look с выключенным JavaScript, там только вариант A.

**F. Локальная сеть:** `python3 -m http.server 8000 --directory dist/web`, IP Mac — `ipconfig getifaddr en0`, на телефоне открыть `http://<IP>:8000`. Это только для проверки: без https нет офлайна и полноценной установки.

**Важно:** прогресс хранится на устройстве. На iOS он удаляется вместе с иконкой. Перенос — «Настройки → Экспорт/Импорт прогресса».
