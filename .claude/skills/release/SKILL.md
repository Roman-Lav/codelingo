---
name: release
description: Выпустить новую версию CodeLingo — поднять версию, прогнать тесты, собрать dist/ и опубликовать на GitHub Pages; также подсказать, как установить приложение на iPhone/Android. Используй, когда просят «выкатить», «опубликовать», «собрать», «релиз», «как поставить на телефон».
---

# Релиз CodeLingo

Все команды — из корня репозитория.

1. Версия: если файлы приложения менялись после прошлого релиза и версия не поднята — `tools/bump-version.sh` (patch) или `tools/bump-version.sh minor`.
2. Тесты: `codelingo/tests/run.sh` → должен быть `PASS`. При FAIL — не публиковать, отдать проблемы в цикл `feature-cycle`.
3. Сборка: `tools/verify-build.sh` → `PASS`. Получаются:
   - `dist/web/` — PWA для HTTPS-хостинга;
   - `dist/codelingo.html` — один автономный файл (для компьютера/Android; на iPhone файл из «Файлов» открывается в Quick Look без JS — там только через https).
4. Публикация (действие наружу — **сначала спросить пользователя**):
   - `git add -A && git commit -m "Release vX.Y.Z" && git push`. Workflow `.github/workflows/pages.yml` сам прогонит тесты и выложит `dist/web/` на GitHub Pages.
   - Если remote ещё нет — дай пользователю команды из `docs/PLAYBOOK.md` → «Публикация».
5. Сообщи: URL `https://<user>.github.io/<repo>/`, что обновление на телефоне появится со второго запуска (service worker), и что прогресс хранится на устройстве (экспорт в Настройках).

Пути установки на устройство — `docs/PLAYBOOK.md` → «Установка на устройство».
