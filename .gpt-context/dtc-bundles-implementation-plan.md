# DTC storefront: план реализации

Дата плана: 2026-11-06. Обновлено: 2026-11-09. Локальный код и проверки реализованы; фактическое выполнение и evidence записаны в [журнале](dtc-bundles-execution.md). Ниже исходный checklist разработки/выпуска; remote rollout и provider gates не выполнены. Основание: [техническое решение](dtc-bundles-technical-solution.md), [английские тексты](dtc-bundles-copy.en.md), согласованная пользователем модель общего stock и редактируемых предложений.

## Последовательность и зависимости

Основная цепочка: **0 → 1 → 2 → 3 → 4 → 5 → 7 → 8**. Контент этапа 6 можно готовить после 0 независимо от commerce, но публиковать вместе с проверенными условиями. Admin зависит от готовых contracts/services; UI покупки зависит от серверных сумм и snapshots. Каждый этап завершается работающим проверяемым результатом, а не только набором типов.

| Этап | Результат | Условие завершения |
| --- | --- | --- |
| 0. Подготовка | Проверенный baseline, каталог допущений, решение по адресной проверке | Известны обязательные consumers и технический путь проверки доставки |
| 1. Data model | Additive schema, DTO и legacy adapters | Старые записи читаются, новые snapshot invariants валидируются |
| 2. Services/stock/admin API | CRUD предложений, stock operations, authoritative calculator | Version/audit/idempotency/concurrency tests проходят |
| 3. Checkout/orders | Bundles проходят оплату, отмену, refunds и отображение | Суммы, коробки и replay согласованы во всех consumers |
| 4. Admin UI | Менеджер создаёт и публикует новую акцию | Действие выполняется без кода/DB-доступа, stock не перезаписывается формой цены |
| 5. Storefront/cart | Выбор с главной → PDP → cart → checkout | Правильный pack/price/count и legacy cart migration |
| 6. Content/policies | Home/About/Shipping/Returns согласованы | Нет прежнего ограничения одной коробкой и недоказанных фактов |
| 7. SEO/analytics/integration QA | Проверен полный сценарий и качество страниц | Локальные проверки + реальный stage runtime/sandbox |
| 8. Выпуск | Миграция/совместимый код/catalog/UI опубликованы в безопасном порядке | Выполнены release gates и post-release smoke |

## Этап 0. Подготовка и baseline

- [ ] Зафиксировать текущий git diff, не затрагивать пользовательские изменения; перечитать актуальные AGENTS/context и установленную Next.js документацию перед кодом.
- [ ] Составить карту использования quantity: quote, reserve, mock, Stripe request/reconcile/webhooks, cancellation, refund/restock, guest/admin DTO, email jobs/templates, analytics, cart receipts.
- [ ] Снять baseline профильных tests и отдельно зарегистрировать существующие failures. В заметках есть прежнее расхождение теста automatic_tax с кодом; воспроизвести и классифицировать, не выключать налог ради зелёного теста.
- [ ] Проверить режим homepage SSR и один запрос каталога в vinext/Cloudflare; не вводить новый cache framework.
- [ ] Выполнить sandbox spike ограничения shipping: supported pre-payment server validation, US valid/AK/HI/territory invalid, смена адреса после проверки, network error. Не опираться на deprecated callback только из-за присутствия в типах.
- [ ] Оформить выбранный способ shipping validation с тестом, что недопустимый адрес нельзя оплатить. Если требуется изменение checkout UX/режима, выделить конкретную зависимую задачу и её влияние на scope; не блокировать разработку модели/admin.
- [ ] Зафиксировать рабочий stock scope: ручной учёт в admin и собственные заказы. Внешний warehouse/Amazon sync не предполагать.

Проверяемый результат: короткий baseline и список реально затрагиваемых файлов/контрактов; известные сбои отделены от regressions; shipping spike имеет вывод и следующую задачу.

## Этап 1. Модель данных и additive migration

- [ ] Добавить Product.offers, storefront, inventory.version; standard формируется из product.price.
- [ ] Определить stable UUID, статусы/переходы, количественные пределы, money validation, сортировку, ограничения home slots/highlight.
- [ ] Добавить новые item snapshot поля и salesTerms. Написать единый legacy-normalizer; отсутствие всех pack fields допустимо только для legacy.
- [ ] Расширить public/admin/guest DTO и client-safe entities interfaces, сохранив раздельные server exports.
- [ ] Подготовить новую migration с validators, допускающими старые и новые данные; проверить также frozen notification payload contracts. Выбрать следующий свободный номер, не изменять применённые migrations.
- [ ] Идемпотентно инициализировать отсутствующие offers/inventory.version без изменения stock, reserved, prices, orders, attempts и requests. Не выполнять коммерческое seed в schema migration.
- [ ] Подготовить read-compatible код и документировать порядок применения migration до writers.

Проверки: fresh DB; существующая DB; повтор migration; исходные старые orders/attempts; отказ частично заполненным pack items; инварианты quantity/lineSubtotal/inventoryQuantity; сохранность старых финансовых snapshots и резервов.

## Этап 2. Domain services, stock и admin API

- [ ] Выделить offer resolver/calculator в `_app/commerce`; использовать одни правила для server projection, quote и reserve, без client authority на price/pack size.
- [ ] Реализовать create/edit/duplicate/publish/archive с product version, operationId и transactional audit. Повтор create/duplicate возвращает тот же ID.
- [ ] Реализовать storefront configuration: не более трёх active/standard refs, атомарное удаление refs при archive, валидный highlight.
- [ ] Реализовать отдельный inventory adjustment endpoint delta/set; expectedInventoryVersion, reason и защита stock>=reserved.
- [ ] Добавить инкремент inventory.version во ВСЕ существующие stock writers, включая mock/rollback/release/restock и отмену оплаченного заказа.
- [ ] Убрать полную замену Product из catalog edits; изменять только разрешённые поля. Закрыть legacy combined PATCH без inventory version для stock changes.
- [ ] Добавить thin routes, авторизацию/Origin guards/no-store и ошибки в typed admin copy. Public response фильтрует draft/archive и внутренние inventory поля.

Проверки: неавторизованный доступ/Origin; invalid counts/amounts/IDs/status; version conflict; duplicate operation и fingerprint conflict; stale stock form; stock correction одновременно с reservation/commit; предложение не создаёт/не копирует stock; архивирование с home refs атомарно.

Проверяемый результат: через API можно создать новую акцию и скорректировать stock с audit, не редактируя код/DB напрямую.

## Этап 3. Checkout, orders, refunds, restock и emails

- [ ] Добавить новый discriminator `cartFormat: packs-v1` в quote/session/mock; legacy branch сохраняет прежний fingerprint и payload.
- [ ] Quote/reserve агрегируют physical demand по SKU; catalog version проверяется внутри транзакции; запрос нескольких offers не обходит общий stock/лимит99.
- [ ] Создать new order/attempt snapshots и агрегированную inventoryReservation; policy catalog marker только для новых requests.
- [ ] Stripe params берутся из frozen quote/request; quantity комплектов и целые cents за комплект. Сохранить tax/payment mode и первоначальный deadline при retry.
- [ ] Обновить server state transitions, payment reconciliation и provider amount checks с pack snapshots, сохранив at-most-once stock effects.
- [ ] Исправить restock/cancellation aggregation: суммировать все order items SKU в физических коробках, соблюдать cumulative restockedQuantities.
- [ ] Обновить guest/admin order projections, order tables, fulfillment quantities, notifications/job payloads и письма. Текущая цена/название предложения не подменяют order snapshot.
- [ ] Подключить salesTerms snapshot к новым заказам и показать policy version в admin; решение eligibility остаётся у support.
- [ ] Проверить full remaining refund заказов всех pack sizes и смешанных строк; shipped refund не меняет stock. Частичные per-box refunds не добавлять.

Обязательные сценарии:

| Сценарий | Ожидание |
| --- | --- |
| 1 × standard | 1 коробка, 60 патчей, 1999 cents |
| 1 × 2-Pack | 2 коробки, 120 патчей, 2999 cents |
| 1 × 3-Pack | 3 коробки, 180 патчей, 3999 cents |
| 2 × 2-Pack | 4 коробки, 240 патчей, 5998 cents |
| 2-Pack + 3-Pack | 5 коробок, 300 патчей, 6998 cents |
| 2 × standard | 2 коробки, 3998 cents, без автоперегруппировки |
| Общего stock недостаточно для смешанных offers | Полный rollback, нет payable order и частичного резерва |
| Цена/состав изменились до checkout | Явное обновление и подтверждение; не молчаливая покупка по новым условиям |
| Предложение изменилось после создания Session | Прежние frozen сумма/состав в этом checkout |
| Webhook/retry повторён | Stock/финансовые observations применены один раз |
| Legacy pending, order и email payload | Существующий сценарий сохраняется |

Проверяемый результат: полный серверный путь поддерживает packs до активации storefront.

## Этап 4. Admin UI

- [ ] Разделить ProductEditor на независимые сохранения catalog/stock/offers/storefront; несохранённая цена не отправляет stock и наоборот.
- [ ] Склад: учётный остаток, резерв, доступно, время обновления, delta/set с ясным смыслом. Refresh после save/focus и 30 секунд при видимой вкладке; не стирать draft формы.
- [ ] Offers list: число коробок/патчей, pack price, derived price/box, статус, порядок, availability и действия.
- [ ] Create/edit form с quantity/total price; preview; duplicate в draft; явная публикация/архивирование.
- [ ] Home configuration: три позиции и выделение; валидация refs; отсутствие возможности публиковать draft через настройку главной.
- [ ] Обработать 409 без потери черновика и слепого overwrite, uncertain retries со стабильным operationId.
- [ ] Обновить admin order details/fulfillment presentation: sets и physical boxes; версия политики и фактическая сумма refund.

Приёмка: менеджер создаёт произвольный допустимый pack, сохраняет черновик, редактирует, публикует, ставит на главную и архивирует без изменения кода. Новый pack использует общий stock; stock refresh не сбрасывает ввод. Проверить keyboard/mobile и текущие auth/noindex правила.

## Этап 5. Storefront и cart v3

- [ ] Server offer projection для Home/PDP/API, без копирования цен в YAML. Home request-rendered, чтение один раз, обработка DB outage без фиктивных цен.
- [ ] Новый home block в существующей сетке/палитре/типографике, до lifestyle/reviews. Mobile vertical layout; preserve images/animations/reduced-motion.
- [ ] Ссылки `?offer=<id>`, standard без query; серверный initial selection, price/count в начальном HTML; invalid/archived/stock unavailable states.
- [ ] PDP radio group и Add to Cart одного выбранного pack; URL sync и Back/Forward, выбор не меняет корзину.
- [ ] Cart composite keys/offer snapshots, Sets controls, смена предложения с объединением совпадающей строки; физический stock cap и header box count.
- [ ] localStorage v3 migration для legacy cart/receipts. Legacy pending оставить неизменным; новый формат включает offerId/discriminator; не очищать неопределённую Session ради миграции.
- [ ] Existing cancel-checkout flow перед edits; exact-request retry; корректный paid cleanup по offerId и защита повторного вычитания.
- [ ] Запрет молчаливого partial add при недостаточном stock/лимите. Archived в сохранённой корзине требует явного выбора замены, не превращается сам в standard.

Приёмка: главная → предвыбранный PDP → cart → sandbox checkout с правильным pack; reload и старые данные сохраняются; на главной отсутствует Add to Cart; нет overflow и недоступных radio controls.

## Этап 6. Английский контент и политики

- [ ] Внести подготовленную copy в YAML и типы; сгенерировать словарь штатным script, не редактировать только generated JSON.
- [ ] Обновить первый экран promo, существующий hero и final CTA; синхронизировать видимый H1 и aria-label; preserve текущие изображения и View Product.
- [ ] Shipping/guarantee подписи на Home/PDP со ссылками. Не добавлять неизвестные условия, сроки или medical claims.
- [ ] Создать `_pages/about` composition и перенести About из общего TS content в YAML. Сохранить URL/canonical, отличать `/about-product`.
- [ ] Returns: весь первый заказ и все коробки; удалить one-unit restriction. Shipping: free standard без минимальной суммы по текущей географии. Проверить Contact/FAQ/Terms и anchors.
- [ ] Установить effective date при публикации и policy version для новых orders; определить applicability для прежних заказов. Не датировать фиктивно прошлым числом.
- [ ] Проверить badge 2-Pack: исходный Best Value конфликтует с более низкой ценой коробки у 3-Pack. Выбранная бизнесом формулировка отражается в config/copy, без тихой подмены.

Приёмка: desktop/mobile copy review, один H1, все ссылки рабочие; no internal notes/status labels; никаких вымышленных основателей, исследований или сертификатов. Доставка и guarantee соответствуют реально исполняемым условиям.

## Этап 7. SEO, аналитика и интеграционная проверка

- [ ] Сохранить canonical query-free PDP, sitemap без offer variants; metadata Home/About согласованы с новыми текстами.
- [ ] Product/Offer базовой коробки из общего серверного snapshot; stock/price соответствуют HTML. Не вводить сомнительную multipack schema или возврат по почте при no-physical-returns.
- [ ] Добавить item_variant в allowlist/mappers, list impression/select events, stable list positions; prices/quantity за комплект. Нет add_to_cart при radio change, повторного purchase или PII/query leakage.
- [ ] Запустить app-local lint/typecheck, профильные unit/integration tests и полный server suite. Проверить существующие package scripts; не менять Turbo task/config без установленной документации.
- [ ] Stage Cloudflare build и runtime: Atlas read/reserve/write, migration, SSR/no-store, valid/invalid shipping, Stripe signed webhook, cancellation/expiry/refund и emails.
- [ ] В sandbox проверить successful/declined/3DS, lost response, reload, duplicate/reordered webhook, price edit и archive во время checkout, конкурентную покупку последних коробок, повтор stock adjustment.
- [ ] Использовать контролируемые адреса/получателей stage: текущая email-система действительно отправляет письма, отдельной recipient-песочницы нет. Не считать mock безопасным способом рассылки произвольным адресатам.
- [ ] Visual/accessibility QA Home/PDP/cart/About/admin на desktop/mobile: existing design, focus, labels, contrast, price announcements, reduced-motion, no horizontal overflow.
- [ ] Сравнить cold/warm SSR timings с baseline; проверить, что admin price change виден следующему SSR без rebuild. Live GA delivery проверяется отдельно при доступе; отсутствие этого доступа обозначается, а не выдаётся за pass.

Проверяемый результат: отчёт с commit/build/env, тестами и фактически проверенными journeys; известные ограничения перечислены отдельно.

## Этап 8. Подготовка и выпуск

- [ ] Подготовить и проверить migration/rollback runbook, snapshot/backup по существующему процессу. Не выполнять provider/config изменения в составе миграции.
- [ ] Применить additive migration в stage, выпустить совместимые consumers, настроить initial offers через auditable services, выполнить stage acceptance.
- [ ] Подготовить production catalog operation с конкретным SKU/ценами/offer IDs, без stock seed. Операция идемпотентна и не перезаписывает поздние admin edits.
- [ ] В production сначала расширить validators и выпустить pack-compatible backend/readers, затем активировать offers/home UI и новые policy terms. Если backend/UI одной поставкой, публиковать offers только после успешного deploy совместимого приложения.
- [ ] Первое включение defaults: standard $19.99; 2/3 коробки $29.99/$39.99; три home slots, выделенный 2-Pack. Реальные stock/reserved не менять ради начального наполнения.
- [ ] Post-release smoke: Home/PDP SSR, переходы offer, catalog API, admin inventory/offers, поддерживаемый checkout, webhook/recovery; контролируемая live purchase только отдельным согласованным операционным действием.
- [ ] При проблеме остановить новые checkout существующим switch; callbacks/recovery и данные сохранить. Откат только на pack-compatible build. После pack orders pre-bundle code нельзя возвращать.
- [ ] Обновить architecture/database/admin/commerce runbooks фактическими именами полей, endpoints, migration и проверками. Не оставить этот план как ложное описание уже внедрённой системы.

## Условия выпуска

| Условие | Что требуется |
| --- | --- |
| Деньги/stock | Все инварианты и конкурентные сценарии пройдены; old/new snapshots работают |
| Адреса | Недопустимый shipping address отклоняется до оплаты на реальной интеграции |
| Гарантия | Зафиксированы effective date и обработка предыдущих заказов; support понимает покрытие всего заказа |
| Badge | Явно выбран текст 2-Pack, учитывая ценовой конфликт |
| Совместимость | Readers/writers/emails/refunds/recovery принимают packs; безопасный rollback известен |
| Наблюдаемость | Ошибки checkout/reserve/webhook/refund и admin audit доступны; baseline метрик сохранён |

Не требуется останавливать всю разработку в ожидании бизнес-решений о badge/старых гарантиях: эти решения нужны до публикации соответствующего обещания. Внешний stock sync не является скрытой зависимостью этой версии.

## Разбиение на изменения для review

1. **Schema и совместимость** — contracts, DTO, adapters, migration, тесты старых данных.
2. **Предложения и inventory services** — CRUD, separate stock adjustment, API, audit/version/concurrency.
3. **Commerce lifecycle** — quote/reserve/Stripe/mock, orders/refund/restock/email, безопасные snapshots.
4. **Admin** — полноценное управление новым каталогом и stock.
5. **Storefront/cart** — Home/PDP/cart v3, URL/selection и SSR.
6. **Content/SEO/analytics** — About, policies, English copy, events и schema consistency.
7. **Release preparation** — stage report, catalog operation и deployment/rollback runbook.

Review boundaries не означают, что пользователь получит частично работающий публичный pack flow: предложения активируются после готовности всей цепочки. Наиболее объёмный и рискованный блок — этап 3; оценку срока уточнять после baseline и shipping spike, не обещать фиксированные дни без этих данных.

При первоначальной подготовке этого плана код не менялся. Последующая реализация и локальные тесты отражены в [журнале выполнения](dtc-bundles-execution.md); remote операции и критерии выпуска нельзя считать выполненными по одному наличию кода.
