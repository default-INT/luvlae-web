# DTC bundles: задачи и журнал выполнения

Начало: 2026-11-06. Пользователь поручил выполнить декомпозицию и делегировать работу более простым моделям, после каждого этапа проводить независимые browser MCP QA и code review.

Основание: [technical solution](dtc-bundles-technical-solution.md), [implementation plan](dtc-bundles-implementation-plan.md). Это журнал фактического прогресса; непроверенные пункты не считаются выполненными.

## Роли

- Координатор: основной агент — зависимости, интеграция, исправления, проверки и коммуникация.
- `implement`: `gpt-6-luna`, high reasoning — реализация ограниченных задач по одному этапу.
- `browser_light`: `gpt-6-luna`, low reasoning — фактическая функциональная проверка через MCP browser после каждого этапа.
- `review_medium`: `gpt-6.1-sol`, medium reasoning — независимое ревью изменённого кода после каждого этапа.
- `content`: `gpt-6.1-sol`, low reasoning — независимая подготовка новых файлов About для S6; не редактирует общие YAML/routes до интеграции. Подготовка идёт параллельно, проверка/включение — на S6.
- `commerce`: `gpt-6.1-sol`, low reasoning — следующий исполнитель серверных задач S2/S3 после закрытия S1. Владение кодом передаётся явно; implement сохраняет исправления S1 до закрытия ревью.

Один исполнитель меняет код этапа; ревьюеры читают и тестируют. Следующий этап начинается после рассмотрения обоих отчётов и исправления существенных замечаний. Если среда не позволяет провести часть проверки, это фиксируется как непроверенное, а не pass. Независимые серверные задачи могут продолжаться после code-review PASS при явно зарегистрированном инфраструктурном блокере браузера; финальная приёмка и выпуск требуют закрытия оставшихся QA-проверок.

## Декомпозиция

| ID | Задачи | Зависимость | Статус |
| --- | --- | --- | --- |
| S0 | Baseline tests; карта quantity consumers; отдельная локальная QA DB; shipping spike | — | Закрыт: code review PASS, browser QA PASS; shipping proof остаётся release gate |
| S1 | Offers/storefront/inventory model; legacy adapters; additive validators/migration; DTO | S0 + review | Код/tests/review PASS; MCP storefront regression PASS 2026-11-09 |
| S2 | Calculator/resolver; offers CRUD; stock adjustments и versions; admin API/audit | S1 + review | Код/review PASS; итоговый suite202/202; MCP catalog/stock/offer CRUD PASS |
| S3 | Quote/reserve/Stripe/mock; физические количества; order/refund/restock/email compatibility | S2 + review | S3A/S3B code-review PASS; checkout address/recovery tests PASS; реальный Stripe sandbox остаётся gate |
| S4 | Admin catalog/stock/offers/storefront формы; preview; конфликты/refresh | S2 API; order panel после S3 | Код/review PASS; MCP stock/catalog/offer CRUD PASS |
| S5 | Home SSR/cards; PDP query/selector; cart v3/cleanup/legacy pending | S4 + review | Код/review PASS; cart27/27; MCP Home/PDP/cart/address navigation PASS |
| S6 | Home/About copy; Shipping/Returns/guarantee; YAML/metadata | Content после S0; финальная интеграция S5 | Код/review PASS; dictionary runtime test PASS; MCP About/Shipping/Returns PASS |
| S7 | SEO/events; полные tests/build; browser journey; regression fixes | S6 + review | Локальные code/review/tests/build PASS; remote runtime/provider/mobile gates остаются |
| S8 | Catalog provisioning tool и migration/rollout/rollback runbook; готовность к выпуску | S7 + review | Скрипт/runbook/review PASS; remote apply/deploy не выполнялись |

Развёртывание в production, изменение внешней DB/провайдеров и реальные платежи не выполняются автоматически. Локальная разработка и QA используют синтетические данные; внешняя почта не отправляется. Внешняя warehouse/Amazon синхронизация не входит в текущую версию.

## Проверка каждого этапа

1. Исполнитель сообщает изменённые файлы, commands/tests, ограничения.
2. Browser light проверяет доступный локальный функционал через MCP и записывает evidence.
3. Medium reviewer проверяет конкретный diff/инварианты; findings с файлами/строками.
4. Исполнитель исправляет существенные findings; затронутые проверки повторяются.
5. Координатор фиксирует итог и разрешает следующий этап.

## Отчёты

S0 запущен: baseline/локальная среда у implement; browser light готовит surfaces/checklist; medium reviewer проверяет проект решения и текущие риски.

### S0: baseline и среда

- Node.js 22.22.2, loopback MongoDB replica и server suite: 143/145 pass. Исходные failures: `checkout-session.test.ts` ожидает automatic_tax=false при включённом automatic tax; `email-config.test.ts` ожидает один trigger при fetch+scheduled. Это baseline, не новые regressions.
- Первый sandbox запуск не мог открыть MongoDB ports; разрешённый localhost запуск устранил EPERM. Sandbox curl без разрешения также не доказывает недоступность локального сервера.
- Временный launcher `/tmp/luvlae-dtc-local-qa.mjs`: authenticated in-memory replica, локальный синтетический catalog/admin, Next на `http://localhost:3022`, development env, Stripe disabled, Stripe/Resend keys blank. Данные и credentials не копируются в durable notes.
- Проверены catalog/admin HTTP API; medium-review исправленного harness: PASS, P1/P2 findings нет. Ранние проблемы SKU/auth/launch исправлены до этапа модели. Browser QA повторно выполняется на исправленной среде.
- Shipping restriction по штатам не доказана текущим country allowlist; остаётся release gate. Active->draft не поддерживается: active редактируется/архивируется, archive допускает копирование в новый draft.
- Финальная browser MCP проверка PASS: Home, PDP $19.99/in stock, add/remove cart и reload cart=0, synthetic admin login/product list stock12/reserved0/available12. Никаких checkout, платежей или внешней почты.
- S1 передан implement после обоих отчётов. Изменения ограничены моделью/validators/migration/adapters/DTO; pack lifecycle подключается позже.

### Shipping feasibility review (read-only)

Medium reviewer установил по установленным Stripe v23 типам: server-only `permissions.update_shipping_details` поддерживается для `ui_mode=elements`, а callback текущего embedded checkout deprecated. Рекомендуемый путь для последующей реализации: предварительно собрать/валидировать shipping на сервере; заморозить адрес в order/attempt/fingerprint; dedicated Stripe Customer на attempt с этим shipping; оставить embedded payment, но без editable shipping collection. Customer creation и Session request требуют отдельных durable idempotency/recovery состояний. Contacts reconciliation должна сохранять frozen shipping, а не требовать отсутствующее Stripe-collected shipping. Официальный источник tax hierarchy: [Stripe](https://docs.stripe.com/tax/checkout/page).

Это техническая рекомендация, не доказательство provider sandbox. Реальные valid/invalid-address, billing-change, concurrent-tab, retry/recovery и restricted-key permissions проверки пока не выполнены; release gate сохраняется.

### S1: первая проверка

- Добавлены модель offers/storefront/inventory version, client-safe snapshot normalizer, compatible DTOs и migration008; focused tests 2/2, direct Node22 TypeScript и targeted ESLint проходят.
- Medium review обнаружил P2: strict pricingPolicy validators не разрешали новый optional catalog marker; исправляется исполнителем с regression test перед закрытием.
- Browser QA сначала не смог подключиться после завершения процесса субагента. Координатор перезапустил изолированный fixture как собственный persistent process; browser regression повторяется.
- About slice подготовлен независимо четырьмя новыми файлами; TypeScript/ESLint проходят, но route/YAML не подключены. S6 не считается завершённым до интеграции и обоих reviews.
- P2 исправлен и подтверждён medium reviewer: финальный S1 code-review PASS, новых P1/P2 нет; direct Node22 typegen/tsc, lint и focused tests2/2 PASS.
- Browser MCP S1 заблокирован `Debugger unattached` и признаком locked machine. Пользователю отправлен запрос разблокировать компьютер/Chrome; browser PASS не заявлен. S2 серверных задач передан commerce с явным сохранением QA-долга.

### S2 и параллельная подготовка

- S2 code-review PASS без P1/P2: offer CRUD и publication rules, stable IDs/idempotency, separate inventory/catalog versions, guarded APIs, active-only public projection, atomic home refs cleanup. Suite149/151 PASS; только 2 baseline failures. Node22 lint/typegen/tsc PASS. [Реализованные контракты](dtc-bundles-s2.md).
- S6 подготовленный контент/About/YAML прошёл medium review без P1/P2, typecheck/lint PASS. Home trust keys ещё должен отрисовать владелец S5; не считать полной приёмкой S6.
- Изолированный PurchaseOffers компонент готов и typecheck/lint PASS, но пока не подключён к HomePage.
- Commerce выполняет S3A pack lifecycle. Content выполняет S4 product admin UI на готовых S2 API; order panel зависит от S3 projections.

### Ограничение MCP browser QA

Повторные CUA попытки: desktop locked / Debugger unattached. Дополнительная попытка MCP Node REPL: временный playwright-core установлен только в `/tmp`, но процесс Chromium из MCP не запускается (SIGABRT/EPERM), а подключение к координаторскому isolated headless CDP отвергается MCP sandbox с `connect EPERM`. Это инфраструктурный блокер, не результат теста приложения.

Координатор держит localhost Next/Mongo и отдельный Chrome с временным чистым профилем; профиль пользователя не используется. Light QA поручен дополнительный headless CLI прогон с явным отличием от MCP. Он не закрывает MCP gate; результаты фиксируются отдельно, пока пользовательская разблокировка/доступ не восстановлены.

## Возобновление — 2026-11-07

Предыдущие worker turns прерваны лимитом использования; пользователь поручил продолжить. Сохранённый код и test logs проверены, локальная QA API отвечает200. Пользователь сообщил, что компьютер разблокирован.

- S3A: full suite157/159 (2 baseline failures), scoped lint/TypeScript PASS; medium reviewer самостоятельно выполнил lifecycle7/7 и дал PASS без P1/P2. Shipping enforcement/salesTerms activation не выдаются за выполненные.
- S6: дополнительный headless CLI прогон нашёл P1 global HTTP500 из-за About YAML arrays. Исправлено на keyed records/Object.values без изменения loader; добавлен реальный dictionary-runtime test1/1. Medium reviewer независимо повторил тест и восстановил code PASS. Дополнительный CLI: Home/PDP/cart/admin reads/About/mobile/policies HTTP200, pageErrors нет; это не MCP pass.
- S4: medium reviewer обнаружил P1 повторного stock delta после lost response/rebase. Исправление замораживает exact request/operationId, блокирует edits/rebase до разрешения, отделяет accepted write/readback failure от uncertain write. Shared global mutation hook не изменён. Regression3/3 самостоятельно подтверждены reviewer; S4 code PASS.
- Новый browser_light_2 (`gpt-6-luna`, low) возобновил MCP: Home/PDP19.99/in stock и cart add/reload/remove подтверждены фактически. Admin input оказался stale, browser detached до About/policies. Эти проверки остаются неполными. Назначена native Chrome MCP fallback проверка и локальная S4 CRUD/stock journey; при невозможности MCP дополнительные CLI результаты маркируются отдельно.
- S3B: выбран новый packs-v2 для новых checkout с серверно нормализованным/замороженным shipping, dedicated per-attempt Stripe Customer и frozen requests. Legacy/v1 допускают exact replay/resume, но не новое создание в обход проверки адреса. Дополнительная009migration; внешних provider вызовов нет.
- Reviewer подтвердил pre-existing inclusive-tax defect: positive включённый tax отвергался как ненулевая доплата. S3B сохраняет gross quote/total, хранит observed includedTax отдельно и не меняет immutable attempts. Реальный Stripe sandbox positive-tax/subtotal proof остаётся release gate.
- Content выполняет S5 UI и order labels на готовых S3A/S3B contracts; commerce — S3B server/validators/recovery/tests. Владение общими entity projections остаётся у commerce, YAML/frontend — у content.

## Возобновление и итоговая локальная проверка — 2026-11-09

- Повторно делегированы S5 frontend (`frontend_finish`, gpt-6.1-sol low), S7 analytics (`commerce`, low), S8 provisioning (`implement`, gpt-6-luna high). Независимый medium reviewer проверил каждый изменённый scope; light browser QA выполнялся через MCP после восстановления Chrome. Все найденные P1/P2 исправлены и перепроверены.
- S3B final code-review PASS: deadline проверяется транзакционно до первого frozen Session request; lookup-only resolve не создаёт заказ/провайдера и не считает отсутствие доказательством безопасной отмены. S5 интегрирует resolve-first cancellation, exact persisted request recovery и сохранение неопределённого pending state.
- S5 code-review PASS: invalid/archived/duplicate query → standard с пояснением; sold-out остаётся выбранным; explicit cart replacement объединяет одинаковые строки атомарно по общему stock/99boxes; cancel gate до edits. Все прежние14 cart tests сохранены, с pack cases27/27.
- S7 code-review PASS: Home visible-card impressions/select_item имеют offerId, позицию и цену комплекта, без суммирования альтернатив. PDP initial view_item и add/remove/view_cart используют выбранный offerId/pack price. Production/origin/GA gating и PII/query sanitization сохранены; реальных GA отправок не было. Исправлены исходные stale automatic-tax/email-trigger assertions с проверкой фактических контрактов, без изменения runtime ради теста.
- Дополнена активация salesTerms для новых Stripe и mock заказов: явные version/effectiveAt, blank defaults, строгая проверка пары, будущая дата не активирует условия, exact replay сохраняет старые snapshots. Admin показывает snapshot. Turbo env hashing/forwarding и Cloudflare artifact comparison включают настройки; stale --skip-build артефакт отвергается. Дата и применимость к прежним заказам не выдуманы.
- S8 code-review PASS: общий read-only planner для dry-run/apply, stable audited steps, обнаружение manual drift/untracked offers, защита от перезаписи черновика после частичного выполнения и version guards между чтением и mutation. Локальные provisioning regressions5/5; stock/reserved/order/attempt/provider не изменяются этим инструментом.
- Финальная регрессия Node22: **202/202** (`tests/*.test.ts`), **3/3** (`scripts/cloudflare.test.mjs`), полный ESLint PASS, штатный Next typegen + tsc PASS, git diff --check PASS. Cloudflare stage Vite build PASS с пустыми DB/provider credentials, checkout paused; manifest и noindex headers проверены штатным verifyArtifact. Это build-only, не remote deploy или runtime proof.
- Первый вызов build wrapper выбрал установленный pnpm12, который автоматически перелинковал node_modules по существующему lockfile и остановился на ignored build scripts. Tracked package manifests/lockfile не менялись. Итоговая сборка выполнена напрямую установленным Vite/Node22, artifact metadata/headers выставлены по существующему wrapper и проверены verifyArtifact; повторные lint/tests/typecheck прошли после relink. Обновление зависимостей не выполнялось.
- MCP light фактически подтвердил Home3prices/View Product, preselected3-Pack39.99, invalidquery fallback19.99+notice, Back/Forward, cartreplace1→2Pack, mixed2+1 subtotal49.98, reload/header3boxes, точную кнопку Checkout→/checkout, required field/malformed ZIP validation. About/Shipping/Returns загружаются с согласованными условиями. Synthetic admin catalog edit/restore и stock+1/-1 восстановили stock12/reserved0. Предыдущее наблюдение неудачного перехода checkout не воспроизвелось при точном выборе кнопки. Responsive viewport не доступен в текущем MCP; real Stripe payment не выполнялся.

Оставшиеся условия выпуска: реальные Stripe sandbox Customer/restricted-key/address-lock/inclusive-tax/recovery проверки и stage runtime, responsive visual QA; согласованные policy effective date/legacy applicability и текст badge2-Pack; remote backup/migrations/deploy/provisioning и post-release smoke по runbook. Это не препятствует завершению локального кода, но выпуск не объявляется выполненным.

### Финальный S4 MCP lifecycle — 2026-11-09

Light reviewer создал в synthetic admin draft4boxes/$49.99, изменил total на$48.99, опубликовал и архивировал; затем дублировал archived offer в новый draft и архивировал копию. Финальное UI состояние: оба новых4-box предложения archived, homepage slots standard/2/3 и highlight2-Pack BestValue сохранены, stock12. Агент вышел из admin. Активного4-Pack, checkout/payment/email действий не осталось. Это фактический MCP PASS для admin offer lifecycle, не только API или CLI проверка.
