# DTC storefront: техническое решение

Дата: 2026-11-06. Пользователь согласовал принцип модели: один физический товар, общий stock, редактируемые предложения и создание акций по шаблону «количество / общая стоимость». Детали ниже — спецификация реализации, а не описание внедрённого функционала.

Этот документ заменяет предварительные варианты архитектуры из [первичной оценки](dtc-bundles-plan.md). Связанные материалы: [план реализации](dtc-bundles-implementation-plan.md), [английские тексты](dtc-bundles-copy.en.md).

## 1. Цель, scope и решения

Повысить конверсию и средний чек, сохранив текущие изображения, дизайн и DTC-позиционирование. Все первоначальные пункты ТЗ входят в работу, вместе с управлением предложениями и stock через `/admin`.

| Требование | Решение |
| --- | --- |
| Усилить первый экран | Обновить `home.promo`: Berberine Patches, преимущества формата, 60 patches per box; сохранить изображение и View Product |
| Три предложения на главной | Блок из серверных данных; стартовые 1/2/3 коробки за $19.99/$29.99/$39.99; выбираемые в admin позиции |
| Выбор перед переходом на PDP | Ссылка `?offer=<stable-id>`, серверный начальный выбор; корзина меняется только после Add to Cart на PDP |
| Корректные количество и цена | Комплект — единица продажи; коробка — складская единица; серверный расчёт и immutable snapshots |
| Актуальный stock | Один остаток на SKU; транзакционный резерв/списание; отдельные административные корректировки |
| Редактирование и создание акций | Массив предложений внутри Product; draft/active/archived; форма «количество коробок / общая цена» |
| Бесплатная доставка | Краткие условия Home/PDP и уточнение Shipping Policy; доплата за standard shipping 0 |
| Гарантия всего первого заказа | Обновить Home/PDP/Returns; support проверяет условия, возврат по фактически оплаченной сумме |
| About Luvlae | Отдельная композиция `/about` с новой английской текстовкой, без вымышленной истории и сертификатов |
| Сохранить существующую систему | Совместимость старых cart/order/session, текущие Stripe webhook/refund/email механизмы |

Не входят: Amazon/FBA/3PL sync, подписки, промокоды, автоматическое объединение коробок в наиболее дешёвый комплект, таймеры акций, новые платёжные методы, автоматическое определение household, новая CMS. Внешний источник stock пользователь не указал: первая версия включает ручные операции в admin и автоматический учёт собственных заказов; внешняя синхронизация остаётся отдельной интеграцией.

## 2. Исходная реализация

Проверен локальный код, без чтения/изменения production DB:

- Product содержит `price`, `inventory.stockQuantity`, `inventory.reservedQuantity`, `salesEnabled`, `version`; цена в USD cents.
- Quote и reserve умножают цену одной коробки на quantity; скидок комплектов нет.
- Cart объединяется по SKU; quantity одновременно означает коробки и единицы продажи.
- Stripe line items строятся из сохранённого quote; provider request сохраняется до внешнего вызова.
- Stock резервируется при создании checkout, коммитится после подтверждённой оплаты; исходный механизм защищает повторные события.
- Admin ProductEditor отправляет цену и stock одной формой. Это нужно разделить, чтобы не сохранять устаревший stock вместе с изменением предложения.
- Restock использует первую строку заказа по SKU. При нескольких предложениях одного SKU требуется агрегация физических количеств всех строк.
- Главная статическая; PDP request-rendered; остальная авторская текстовка в основном в YAML. About сейчас в общем InformationPage/TS.

Основные источники: [models](../apps/web/src/_app/commerce/models.ts), [products](../apps/web/src/_app/commerce/products.server.ts), [reservations](../apps/web/src/_app/commerce/reservations.server.ts), [Stripe persistence](../apps/web/src/_app/commerce/stripe-checkout-persistence.server.ts), [orders/restock](../apps/web/src/_app/commerce/orders.server.ts), [ProductEditor](../apps/web/src/_pages/admin/ui/ProductEditor/ProductEditor.tsx), [cart store](../apps/web/src/features/shopping-cart/model/store.ts).

## 3. Product и предложения

Одна складская единица SKU `LUVLAE-BERBERINE-60` — коробка, содержащая 60 патчей. Один Product продолжает владеть складом.

Целевая форма существенных полей (псевдоданные, не production stock):

```ts
{
  sku: 'LUVLAE-BERBERINE-60',
  price: { currency: 'USD', unitAmount: 1999 },
  inventory: { stockQuantity: 100, reservedQuantity: 6, version: 1 },
  offers: [{
    id: '<server-generated-uuid>',
    unitsPerPack: 2,
    price: { currency: 'USD', unitAmount: 2999 },
    status: 'active',
    sortOrder: 10,
    createdAt: '<date>',
    updatedAt: '<date>',
  }],
  storefront: {
    homeOfferIds: ['standard', '<two-pack-uuid>', '<three-pack-uuid>'],
    highlightedOfferId: '<two-pack-uuid>',
    highlightBadge: 'bestValue',
  },
  version: 1,
}
```

### 3.1 Базовое предложение

`standard` — зарезервированный виртуальный ID покупки одной коробки. Цена берётся только из существующей `product.price`. Базовое предложение не дублируется в `offers`; его доступность зависит от общего salesEnabled и stock. Это сохраняет один источник базовой цены и упрощает legacy compatibility.

Дополнительные предложения используют `offers`, не отдельные products и не отдельные stock. Публичная проекция возвращает standard и опубликованные предложения в одном формате. Не поддерживать одновременно `offers` и прежнее рабочее имя `packOffers`.

### 3.2 Валидация и жизненный цикл

- `id`: сгенерированный сервером UUID, неизменяемый; не выводится из цены, количества или названия.
- `unitsPerPack`: целое от 1 до 99; общая сумма — положительные целые cents USD; действуют текущие ограничения суммы Checkout.
- `status`: `draft | active | archived`. Создание/копирование дают draft. Archived можно скопировать в новый draft; в первой версии не восстанавливать архивную сущность автоматически.
- `sortOrder`: ограниченное целое; одинаковые позиции сортируются стабильно по ID.
- Начальный защитный предел: 20 неархивных предложений и 100 дополнительных записей всего на Product. Это предел реализации, не требование бизнеса; достижение лимита требует явной ошибки admin, а не удаления истории. Если каталог вырастет, отдельная коллекция — последующее решение.
- Количество и цена редактируются с проверкой версии. Это меняет будущие покупки; созданные заказы хранят прежний состав/цену.
- Полное удаление опубликованных предложений не используется; архивирование скрывает их из новых покупок. Ссылки старых заказов не требуют живого offer.
- Новый шаблон — общая форма, а не коллекция templates. Название `N-Pack`, число коробок и патчей формируются из данных и словаря. Дата старта/окончания и произвольный маркетинговый HTML не добавляются.
- Опубликовать предложение можно и при недостаточном текущем stock: статус публикации и фактическая доступность различаются. Такое предложение отображается недоступным.

### 3.3 Публикация на главной

`homeOfferIds`: до трёх уникальных ID, включая standard. Admin назначает порядок; IDs должны быть standard или active offers. `highlightedOfferId` должен входить в homeOfferIds; badge — локализуемый enum, без свободного HTML. При архивировании предложение удаляется из homeOfferIds и highlight той же транзакцией.

Публикация новой акции делает её доступной на PDP; для главной администратор явно выбирает позицию. Отсутствие stock не снимает публикацию автоматически. При общем salesEnabled=false покупка всех предложений закрыта.

Исходное ТЗ требует Best Value на 2-Pack; это остаётся целевой настройкой из ТЗ, не доказанным выводом о минимальной цене. 3-Pack дешевле за коробку. Не переключать badge молча: перед публичным выпуском требуется решить между исходной меткой и рекомендованным `Recommended` для 2-Pack. Не использовать Most Popular без данных.

## 4. Stock и конкурентные изменения

`stockQuantity` — учётный остаток непроданных коробок, включая временно зарезервированные. Это не обещание физического on-hand склада: оплаченные, но ещё не отправленные заказы уже списаны. `reservedQuantity` — сумма действующих удержаний. Инвариант: `0 <= reservedQuantity <= stockQuantity`.

`availableBoxes = stockQuantity - reservedQuantity`; `availablePacks = floor(availableBoxes / unitsPerPack)`. В Product не сохраняется производный остаток каждого предложения.

| Событие | Изменение stock | Изменение reserved |
| --- | --- | --- |
| Add to Cart | 0 | 0 |
| Создан checkout для 2 × 3-Pack | 0 | +6 |
| Первая подтверждённая оплата | −6 | −6 |
| Подтверждённая неоплаченная отмена/expiry | 0 | −6 |
| Refund после отправки | 0 | 0 |
| Подтверждённая отмена оплаченного заказа до отправки | +6 один раз после успешного возврата | 0 |

Сумма физического запроса агрегируется по productId/SKU до проверки/reserve, включая разные предложения. Удержание и создание order/attempt — одна транзакция. Внешний Stripe вызов остаётся за её пределами.

### 4.1 Версии и admin stock

- Существующая `product.version` отвечает за каталог: базовая цена, предложения, публикация и настройки storefront. Клиенты checkout передают её как productVersion. Глобальная версия сохраняет простую совместимость; изменение другого предложения может потребовать обновления текущей корзины — приемлемое поведение первой версии.
- Добавляется `inventory.version`. Все writers reserve/commit/release/mock/cancellation/restock/admin adjustment увеличивают её при изменении stock/reserved. Stock-only операции не повышают catalog version и не меняют цены.
- Catalog mutations используют атомарные `$set/$inc` по разрешённым полям, не заменяют весь Product и не отправляют inventory обратно из offer-формы.
- Ручная операция stock принимает `mode: delta | set`, delta либо целевой учётный остаток, `expectedInventoryVersion`, operationId и reason. Устаревшая версия даёт 409 и требует пересмотра; stock нельзя установить ниже текущего резерва.
- `set` означает корректировку учётного непроданного остатка, а не загрузку физического склада без сверки оплаченных неотправленных заказов. Подпись admin поясняет это.
- Audit и изменение stock выполняются в одной транзакции. Повтор операции с тем же operationId не применяет delta второй раз.
- Старое совмещённое PATCH с stock не должно обходить защиту: stock-write требует inventory version либо отклоняется с требованием обновить форму. Новый admin использует отдельный endpoint.

Admin обновляет inventory после операции, по focus и каждые 30 секунд, пока вкладка видима; refresh не сбрасывает несохранённые поля предложений. Витрина получает актуальный snapshot при SSR; окончательная доступность всегда проверяется при checkout. WebSocket и фоновый polling корзины не нужны.

## 5. Серверный расчёт, корзина и snapshots

Новый cart item: `{ sku, offerId, quantity }`. Quantity — число продаваемых комплектов. Ключ строки — `(sku, offerId)`. Повторное добавление объединяет только одинаковое предложение.

Инварианты строки:

```text
inventoryQuantity = quantity × unitsPerPack
lineSubtotal = quantity × unitAmount
patchCount = inventoryQuantity × 60
```

Цены — целые cents. `2 × 3-Pack`: quantity=2, unitsPerPack=3, unitAmount=3999, inventoryQuantity=6, lineSubtotal=7998. Деление $29.99 на две коробки не используется в платёжных расчётах.

Один server-only resolver в `_app/commerce` возвращает предложение и проверяет публикацию, catalog version и пределы. Один calculator используется quote/reserve/mock; reserve повторно читает и проверяет данные в транзакции. Клиент передаёт ID и количество, но не назначает price/unitsPerPack.

На SKU действует максимум 99 физических коробок в заказе; максимум строк сохраняется 20. Перед умножениями проверяются safe integers и текущие пределы Stripe. Изменение размера предложения может сделать старую корзину превышающей лимит — сервер возвращает ошибку для явного исправления.

Два standard по $19.99 остаются $39.98; автоматического превращения в 2-Pack нет. В корзине можно явно сменить предложение: заменить строку и объединить с уже существующей строкой того же offerId, проверив новый физический итог. Перед изменением активный checkout отменяется существующим безопасным flow.

### 5.1 Order item

Сохраняются существующие productId, sku, name, quantity, unitAmount, lineSubtotal, productVersion. Добавляются `offerId`, `unitsPerPack`, `inventoryQuantity`; name содержит snapshot понятного состава. Новая quantity означает комплекты. В новых строках все три поля обязательны и проверяются вместе.

Legacy строка без новых полей интерпретируется как standard, unitsPerPack=1, inventoryQuantity=quantity. Частично заполненную новую строку нельзя молча считать legacy. Adapter нормализует старые записи при чтении, не переписывает финансовую историю.

Reservation snapshot хранит агрегированные физические количества по productId. Order/guest/admin DTO и email payload сохраняют понятные обе единицы; raw internal IDs не добавляются в публичный контент.

Restock limits и автоматическое восстановление при cancellation рассчитываются по сумме inventoryQuantity всех строк SKU, с учётом restockedQuantities. Удаляется предположение «один SKU — одна строка». Paid cart cleanup и receipts учитывают offerId, чтобы не вычитать другой комплект того же SKU.

### 5.2 Stripe и refunds

Stripe line item: quantity комплектов, unit_amount за комплект, name с размером. Provider request и суммы строятся только из immutable attempt snapshot; retry не читает новые цены. Текущий tax-inclusive режим, automatic_tax, currency, reservation duration и платёжные методы сохраняются.

Комплект имеет собственную цену, не Stripe coupon: discount=0 остаётся корректным. Для нового протокола добавить необязательную policy `catalog: packs-v1` в новые snapshots. Для старых requests/fingerprints политика не меняется.

Full refund возвращает оставшуюся фактически оплаченную сумму всего подходящего заказа. Для одного 2-Pack это $29.99, для одного 3-Pack $39.99, с учётом предыдущих возвратов. Частичный возврат отдельной коробки внутри комплекта не добавляется. Existing refund state machine и reconciliation сохраняются. Описание передачи line items: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create); предел остатка возврата: [Stripe refunds](https://docs.stripe.com/api/refunds/create).

## 6. API

Существующие guards admin/auth/Origin/no-store, Zod, version checks, audit и operationId сохраняются. Названия ниже — целевые маршруты, ещё не существующие API.

| Endpoint | Назначение |
| --- | --- |
| `GET /api/products/:sku` | Сохранить базовые поля; добавить публичные active offers и производную доступность; не отдавать draft/archive/raw inventory |
| `GET /api/admin/products/:sku` | Полный товар, offers всех статусов, inventory/version и storefront |
| `PATCH /api/admin/products/:sku` | Базовые catalog поля без незащищённого изменения inventory |
| `POST /api/admin/products/:sku/offers` | Создать draft из количества и общей цены; ID генерируется сервером |
| `PATCH /api/admin/products/:sku/offers/:offerId` | Цена, количество, порядок, status; проверка допустимого перехода |
| `POST /api/admin/products/:sku/offers/:offerId/duplicate` | Скопировать поля в draft с новым ID, без публикации на главной |
| `PATCH /api/admin/products/:sku/storefront` | homeOfferIds, highlight; серверная валидация ссылок |
| `POST /api/admin/products/:sku/inventory/adjustments` | Stock delta/set, inventory version, reason, audit |
| `POST /api/checkout/quote` | Новая ветка `cartFormat: packs-v1`, items с offerId |
| `POST /api/checkout/session` | Новый формат, productVersion, те же idempotency/guest guarantees |
| `POST /api/checkout/mock` | Тот же pack calculator и физический stock; existing stage-only gate |

Catalog mutations передают текущую product version, operationId и reason. Ответ возвращает результат операции/актуальную версию; admin перезагружает данные. История операции хранит allowlisted before/after, без PII и секретов. Дублирование и создание имеют серверный ID, сохранённый в audit так, чтобы replay вернул тот же ID.

Для новых checkout явный discriminator отличает контракт от старого. Legacy запросы без discriminator продолжают покупать standard, сохраняя прежний алгоритм fingerprint/replay. Не вставлять offerId в сохранённый legacy pending payload и не пересоздавать старые Sessions с изменёнными параметрами.

## 7. Интерфейсы

### 7.1 Admin

На `/admin/products/:sku` независимые секции: базовые сведения/цена; склад; предложения; показ на главной. SKU неизменяемый. Сохранение одной секции не отправляет поля другой.

Список предложений показывает количество коробок/патчей, общую цену, вычисленную стоимость коробки, статус, порядок и доступность. Действия: создать, изменить, скопировать, опубликовать, архивировать. Create/edit — существующие UI primitives и admin styles; preview до публикации. Изменения catalog version не теряют несохранённый черновик: конфликт показывается с возможностью пересмотреть свежие значения, без слепого повторного сохранения.

### 7.2 Главная и PDP

Главная переводится на request rendering для одного серверного чтения каталога; данные цен нельзя запекать в build или брать из localStorage. Статический контент остаётся Server Components, изображения/стили сохраняются. При недоступной БД брендовый экран и обычный View Product остаются; коммерческий блок не показывает вымышленные цены.

Новый блок до lifestyle/reviews: до трёх карточек из homeOfferIds, текущие токены, один визуальный акцент, без таймеров и marketplace UI. Mobile — вертикальный список. Только View Product. Sold-out предложение имеет понятную подпись; переход на PDP допустим, добавление закрыто.

PDP получает `?offer=<id>` на сервере через awaited searchParams. Без query — standard. Неизвестный/архивный ID даёт standard и короткое объяснение недоступности прежнего предложения; active без stock остаётся выбранным и disabled. Выбор radio не добавляет товар. Back/Forward/reload синхронизируют выбор; query не передаёт цену.

Существующий счётчик коробок на PDP заменяется selector; Add to Cart добавляет один комплект. Cart quantity control редактирует число комплектов с подписью Sets, строка поясняет коробки/патчи. Header cart count показывает физические коробки с соответствующим accessible label. Нельзя молча обрезать добавление по stock: если выбранный комплект не помещается, показать ограничение без частичного добавления.

Управление предложениями не требует менять JSX при добавлении четвёртого размера: PDP строится по списку, главная по выбранным позициям. Новые ссылки используют offer ID; числовые `?pack=2` из ранней записки не являются целевым API. Если такие ссылки обнаружатся опубликованными, добавить совместимый alias только к исходным явно сопоставленным ID, не угадывать акцию по размеру.

### 7.3 Контент

Использовать [подготовленные тексты](dtc-bundles-copy.en.md); цена, количества, названия pack и ссылки формируются из каталога. Переработать первый экран `home.promo`, согласовать повторный hero/final CTA, один H1 и его aria-label.

About вынести в `_pages/about`, английские тексты в YAML; сохранить `/about` и отдельно `/about-product`. Философия и подход без выдуманных фактов об основателях/испытаниях. Формат pill-free/discreet/easy-to-apply и 60 patches per box; без медицинских обещаний, обещания 60 дней или неизвестных сертификатов. Не добавлять внутренние заметки в публичный текст.

## 8. Доставка и гарантия

Рабочие условия первой версии: standard shipping без доплаты/минимума по существующей географии contiguous US. Показать условие Home/PDP, ссылки на `/shipping`; сохранить текущие сроки как оценки, не как гарантированные даты.

### 8.1 Проверка адреса до оплаты

Текущий `allowed_countries: US` не ограничивает штаты. Для выпуска нужен server-authoritative способ отклонить адрес вне согласованной географии до оплаты. Первый этап плана включает отдельную проверку совместимости Embedded Checkout на установленной версии и sandbox.

Нельзя выбирать устаревший callback вслепую: установленный `@stripe/stripe-js` помечает `onShippingDetailsChange` deprecated в [локальных типах](../apps/web/node_modules/@stripe/stripe-js/dist/stripe-js/embedded-checkout.d.ts), а [официальный shipping guide](https://docs.stripe.com/payments/checkout/custom-shipping-options) разделяет сценарии интеграции. Наличие поля в типах не доказывает работающую блокировку в текущем `embedded_page`.

Результат проверки — конкретный поддерживаемый способ, тест недопустимого адреса и доказательство, что платёж не создаётся. Если для текущего Embedded Checkout такого способа нет, оформить отдельное изменение checkout с валидируемым/зафиксированным адресом; просто добавить предварительную форму, оставив возможность сменить shipping address на недопустимый в Stripe, недостаточно. Не менять географию текстом и не считать webhook достаточной предварительной проверкой. Это release gate, не препятствие разработке каталога/stock/admin.

### 8.2 Гарантия

Новый текст покрывает все товары/коробки первого подходящего заказа, включая несколько комплектов. Сохранить текущие 30 дней от доставки, once per customer/household, eligibility открытых коробок, отсутствие физических возвратов, рассмотрение через support и обработку одобренного refund в течение 5 рабочих дней.

В заказ добавить необязательный `salesTerms` snapshot с policyVersion и effectiveAt; новые заказы сохраняют действующую редакцию. Сам snapshot не означает автоматическое одобрение и не делает household доказуемым. Исторические заказы не переписываются; применение к старым заказам и дата действия новой редакции уточняются перед публикацией. Support проверяет первый заказ/срок/предыдущие refunds; UI admin показывает version политики и состав.

Обновить Returns, Home/PDP, Shipping и проверить Contact/FAQ/Terms на прежнее ограничение одной единицей. Не добавлять онлайн-автовозврат и не снимать отдельные права на damaged/missing/wrong items.

## 9. SEO, аналитика и производительность

- Canonical PDP остаётся `/products/berberine-patches`; offer query не попадает в sitemap. Один H1; About сохраняет canonical и Organization identity.
- Для первой версии сохранить корректный Product + Offer базовой коробки, явно присутствующей среди вариантов. Не публиковать $29.99 как стоимость одной коробки; не объявлять фиктивные SKU/GTIN или AggregateOffer ради диапазона. Полная schema мультипаков — отдельное расширение после проверки их идентичности; [Google variant guidance](https://developers.google.com/search/docs/appearance/structured-data/product-variants) само по себе не устанавливает, что эти наборы являются самостоятельными вариантами.
- HTML, public API и JSON-LD получают базовую цену/доступность из одной server projection. Нет hardcoded fallback цен. Не кодировать first-order guarantee как безусловную return-by-mail политику.
- Ecommerce item_id сохраняет SKU, item_variant хранит stable offerId; quantity/price означают комплекты. Order purchase и begin_checkout используют snapshots. Обновить явный analytics allowlist, не передавать PII, guest tokens или сырой query.
- Добавить view_item_list/select_item для главной через расширение текущего typed adapter; список имеет ID и позицию. Radio selection не порождает add_to_cart/purchase. Не дублировать view_item при каждом рендере.
- Сохранить production-only gating, live-payment eligibility и transaction_id deduplication. Количество заказов/выручка в DB — финансовый источник; browser analytics неполна.
- Baseline: paid conversion, AOV, revenue/session, pack mix, Home→PDP→cart→paid, refunds. Сравнение до/после без контроля каналов не доказывает причинность.
- SSR главной увеличивает зависимость TTFB от Atlas. Stage проверяет Workers runtime, отсутствие public price build-cache, cold/warm timings и mobile layout. ISR/cache слой не вводится без отдельного правила инвалидирования.

## 10. FSD и размещение

| Область | Размещение |
| --- | --- |
| Routing/query/metadata и новые API routes | Тонкие wrappers `app/` |
| Public offer model, server projection, schema/analytics mapping | `entities/product`, отдельные client/server public APIs |
| Selector, cart migration, cart UI и checkout клиент | `features/shopping-cart` |
| Home/About/Product композиции | `_pages/home`, `_pages/about`, `_pages/product` |
| Admin формы и preview | `_pages/admin` |
| Resolver/calculator, offers CRUD, stock adjustment, транзакции, snapshots, migration | `_app/commerce` |
| Emails/order DTO | Существующие `_app/emails`, order projections и templates |
| Словарь и общие controls | YAML/typed dictionary и существующий `shared/ui` |

Не помещать бизнес-правила комплектов в shared, не создавать новый workspace, не менять Next/vinext/Turbo/ESLint версии. Перед кодом применять [FSD rules](fsd-rules.md) и установленную документацию фреймворка.

## 11. Миграция и эксплуатация

Новая additive migration с очередным свободным номером расширяет строгие validators products/orders/attempts/notification payloads при необходимости. Старые применённые migrations не редактируются. Validators принимают legacy и новый формат, но не частично заполненные pack snapshots.

Существующим Product задать offers=[] и начальную inventory.version без изменения stock/reserved/базовой цены. Для связанных документов сохранять текущие поля/состояния. Commerce schema migration не создаёт цены/предложения и не переписывает orders или Stripe requests. Целевые цены/два initial offers и home configuration устанавливаются отдельной идемпотентной операцией через сервисы с audit, независимо для stage/production. Повтор не пополняет stock и не перезаписывает последующие admin edits.

Cart storage v3 импортирует старые строки как standard, сохраняя quantity. Старый pending request/guest token/session и receipt остаются в исходном формате до завершения или подтверждённой отмены. Новый pending содержит discriminator и offerId; paid cleanup различает оба формата.

Порядок rollout: расширить validators → выпустить совместимые readers/writers всех consumers → проверить stage → настроить предложения → публиковать новый UI/политики. Нельзя активировать offers при старых checkout/order/restock consumers. После появления bundle orders rollback возможен только на версию, умеющую читать и обрабатывать packs; старый pre-bundle backend недопустим. Остановка новых checkout использует существующий pause switch, не удаляет заказы/резервы и не отключает обработку callbacks/recovery.

Подробные задачи, проверки и release gates — в [плане реализации](dtc-bundles-implementation-plan.md). В этой работе подготовлена документация; код, DB, конфигурация провайдеров и deployment не изменены.
