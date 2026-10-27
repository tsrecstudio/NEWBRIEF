"""
Реальные вакансии hh.ru, найденные по открытым источникам 27.10.2026.

`source="real"` — запись с реальной страницы вакансии hh.ru (проверяется по url).
`source="synthetic"` — карточка, восстановленная по агрегированным исследованиям
(Хабр 34 053 ИТ-вакансии, Хабр 154 930 вакансий, vc.ru 4 894 AI-вакансии), когда
в источнике опубликованы дословные формулировки требований, но не отдельная ссылка.
Такие записи нужны, чтобы демо-прогон показывал полную картину ниши; в отчёте они
не выдаются за конкретные вакансии.
"""

# id, name, employer, area, salary_from, salary_to, experience, employment, url, key_skills, description, source
RECORDS = [
    # ------------------------------ РЕАЛЬНЫЕ ------------------------------
    dict(
        id="137471009", source="real",
        name="Интегратор / специалист по автоматизации / no-code / low-code",
        employer="ИП Тужик Евгений Вадимович", area="Москва",
        salary_from=40000, salary_to=120000, currency="RUR",
        experience="1–3 года", employment="частичная занятость, ГПХ / самозанятый / ИП",
        url="https://hh.ru/vacancy/137471009", published_at="2026-09-17",
        key_skills="n8n, Make, Zapier, Albato, webhook, Telegram, amoCRM, Bitrix24",
        description=(
            "Настраивать и дорабатывать CRM-системы под бизнес-процессы клиентов. "
            "Интегрировать CRM с сайтами, мессенджерами, телефонией, рекламными кабинетами "
            "и внешними сервисами. Настраивать автоматизации через n8n, Make, Zapier, Albato "
            "и аналогичные инструменты. Создавать чат-ботов и автоматические сценарии "
            "коммуникации. Обязательный минимум: n8n, Make, Zapier или Albato; опыт построения "
            "сценариев из нескольких сервисов; понимание webhook и HTTP-запросов. "
            "Боты: Leadteh, Salesbot или аналогичные платформы; опыт создания Telegram-ботов."),
    ),
    dict(
        id="128710465", source="real",
        name="Low-Code/No-Code Automation Specialist (n8n)",
        employer="4 Partners", area="Москва (удалённо)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="https://hh.ru/vacancy/128710465", published_at="2025-12-12",
        key_skills="n8n, JavaScript, REST API, SQL, 1С, Telegram Bot API, Google Sheets, Git",
        description=(
            "Проектировать, разрабатывать и внедрять автоматизированные workflow в n8n для "
            "оптимизации рутинных операций. Интегрировать сервисы: CRM, мессенджеры (Telegram, "
            "Slack), базы данных, 1С, Google Workspace, email-рассылки. Создавать и поддерживать "
            "чат-ботов для внутренних задач (уведомления, сбор заявок, справки). Автоматизировать "
            "ETL данных из разных источников (API, БД, файлы). Настраивать регулярную генерацию и "
            "отправку отчетов в таблицы, BI-системы, на почту. Требования: базовый JavaScript, "
            "HTTP-запросы REST API, авторизация API (API Key, Bearer Token, OAuth, Basic Auth), "
            "простые SQL-запросы (SELECT, JOIN, WHERE), понимание структуры данных 1С и форматов "
            "JSON/XML. Будет плюсом: amoCRM, Bitrix24, Telegram Bot API, Google Sheets, Notion, "
            "Git для версионирования workflow. Мы ЗА использование ИИ."),
    ),
    dict(
        id="131059164", source="real",
        name="No Code developer",
        employer="WB—Tech", area="Москва (удалённо)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="https://hh.ru/vacancy/131059164", published_at="2026-04-06",
        key_skills="n8n, Make, Zapier, Airtable, API, webhooks, Google Sheets",
        description=(
            "Разработка и поддержка автоматизаций n8n и Make. Разработка и поддержка автоматизаций "
            "Airtable. Организация мониторинга всего спектра автоматизаций. Технические навыки: "
            "опыт коммерческой разработки на n8n от 1 года, опыт работы с Airtable, Make и Zapier, "
            "опыт работы с api и Webhooks, умение работать с формулами и сводными таблицами в "
            "Google Sheets. Умение планировать и распределять время, системный подход к самообучению."),
    ),
    dict(
        id="133337220", source="real",
        name="IT-специалист по автоматизации и разработке (n8n, AI, Python/JS)",
        employer="FlowAI (ИП Зяблицев С.М.)", area="Екатеринбург (удалённо)",
        salary_from=30000, salary_to=150000, currency="RUR",
        experience="1–3 года", employment="проект или разовое задание, ГПХ / самозанятый / ИП",
        url="https://hh.ru/vacancy/133337220", published_at="2026-05-21",
        key_skills="n8n, Make, Python, JavaScript, LLM, OpenAI, Claude, Groq, промпт-инжиниринг, Telegram, Google Sheets",
        description=(
            "Мы — команда FlowAI, строим AI-системы для автоматизации бизнес-процессов. "
            "Разработка и настройка автоматизаций в n8n / Make. Написание скриптов на Python и/или "
            "JavaScript. Интеграция AI-инструментов (LLM, Groq, OpenAI, Claude). Работа с API "
            "сторонних сервисов (Telegram, HH.ru, WhatsApp, Google Sheets). Промпт-инжиниринг и "
            "настройка AI-агентов. Требования: опыт с n8n или Make обязательно, Python/JavaScript "
            "на уровне рабочего кода, понимание REST API, webhook, JSON, опыт с LLM-моделями, "
            "промптами и агентами, самостоятельность: берёт задачу и доводит до результата. "
            "Плюсом: Google Sheets API, Telegram Bot API, Docker, VPS, nginx, портфолио "
            "реализованных автоматизаций. Оплата от 30 000 до 150 000 руб/мес. Первый проект — "
            "тестовое задание с оплатой."),
    ),
    dict(
        id="131585016", source="real",
        name="AI / No-code специалист по внедрению в бизнес-процессы (операционная эффективность)",
        employer="Точно", area="Москва (удалённо)",
        salary_from=70000, salary_to=None, currency="RUR",
        experience="1–3 года", employment="частичная занятость, проектный формат",
        url="https://hh.ru/vacancy/131585016", published_at="2026-04-22",
        key_skills="AI, no-code, автоматизация бизнес-процессов, кейсы, внедрение",
        description=(
            "Внедрение AI и no-code решений в бизнес-процессы, операционная эффективность. "
            "Подойдёт, если ты: не делаешь «ботов ради ботов», не любишь сложные решения вместо "
            "работающих, не больше про теорию, чем про внедрение, можешь показать реальные кейсы. "
            "Проектный формат / part-time, возможен рост до постоянной загрузки, удалённо плюс "
            "иногда участие во встречах с клиентом. Оплата: фикс плюс бонус, оплата за проекты, "
            "процент от внедрений. Ориентир от 70 000 ₽ и выше в зависимости от уровня и результата. "
            "На этапе отбора будет простое кейс-задание: посмотреть на процесс и предложить решения."),
    ),
    dict(
        id="130307332", source="real",
        name="Специалист по n8n / автопостинг",
        employer="Коста Рус", area="Москва (удалённо)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="проект или разовое задание, ГПХ / самозанятый / ИП",
        url="https://hh.ru/vacancy/130307332", published_at="2026-03-09",
        key_skills="n8n, Telegram Bot API, MAX API, автопостинг, прокси, логирование",
        description=(
            "Цель — выстроить устойчивую систему автопостинга и разработать бота для общения с "
            "покупателями. n8n уже развёрнут и работает на нашем сервере: нужно не «поставить», "
            "а грамотно спроектировать и настроить процессы. Автопостинг контента примерно в 40 "
            "каналов Telegram и MAX: продуманная архитектура workflow, масштабируемость, защита от "
            "ошибок и флуда, обработка ошибок API, недоступных каналов, лимитов. Разработка бота в "
            "MAX: ответы на типовые вопросы, работа по сценариям (FAQ, шаблоны, условия), интеграция "
            "с n8n. Требования: реальные проекты в n8n, не «смотрел туториалы». Плюсом: опыт "
            "поддержки и оптимизации workflow, работа с прокси и антифлуд-логикой, логирование и "
            "мониторинг автоматизаций, решения «на вырост». Возможна дальнейшая поддержка после "
            "запуска."),
    ),
    dict(
        id="132299575", source="real",
        name="N8n Developer / Разработчик автоматизаций / n8n инженер",
        employer="Муравейник", area="Россия (удалённо)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="проект или разовое задание, ГПХ / самозанятый / ИП",
        url="https://hh.ru/vacancy/132299575", published_at="2026-04-20",
        key_skills="n8n, парсинг, HTML, CSS, автоматизация бизнес-процессов",
        description=(
            "Ищем специалиста, который поможет настроить и поддерживать автоматизацию "
            "бизнес-процессов в маркетинговом агентстве. Нужен человек, который умеет строить "
            "сложные сценарии в n8n и превращать хаотичные ручные операции в отлаженные системы. "
            "Проект: генератор одностраничных сайтов — парсинг данных с выдачи по запросу (первые 3 "
            "страницы в ТОП 10), агрегирование результата и удаление дублей, создание сайта "
            "html + css. Требования: практическая работа с n8n от 2–3 лет, опыт в разработке или "
            "системном администрировании, способность самостоятельно разбираться в технической "
            "документации. Проектная оплата — обсудим ваши расценки и формат (почасовая/за проект). "
            "В отклике опишите 1–2 самых сложных сценария в n8n и ваши зарплатные ожидания за час."),
    ),
    dict(
        id="128986603", source="real",
        name="Python-разработчик Telegram-ботов",
        employer="ИП Евстигнеев Сергей Сергеевич", area="Калининград (удалённо)",
        salary_from=30000, salary_to=500000, currency="RUR",
        experience="не требуется", employment="полная занятость, свободный график",
        url="https://kaliningrad.hh.ru/vacancy/128986603", published_at="2025-12-23",
        key_skills="Python, aiogram, Telegram Mini Apps, OpenAI, Grok, YooKassa, HTML, JS",
        description=(
            "Доработка кода бота на Python (aiogram). Настройка мини-приложения в Telegram "
            "(HTML/JS для WebApp). Интеграция внешних API (Grok/xAI для Vision и чата, YooKassa для "
            "платежей). Добавление функций: тарифы с лимитами, рефералка, генерация фото, "
            "уведомления о штрафах и платежах. Зарплата 25–35 тыс. руб/мес фиксировано плюс 10% от "
            "чистой прибыли проекта (бот прибыльный с первого месяца)."),
    ),
    dict(
        id="130949391", source="real",
        name="Инженер по автоматизации (n8n, Python, SQL, Planfix)",
        employer="ГБУ МО УТНКР", area="Москва",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="полная занятость",
        url="https://hh.ru/vacancy/130949391", published_at="2026-04-01",
        key_skills="Python, n8n, PostgreSQL, MySQL, Telegram Bot API, aiogram, REST API, webhook, BI, SQL",
        description=(
            "Развивать интеграции и автоматические сценарии вокруг CRM Planfix и внутренних "
            "сервисов, обеспечивать цифровизацию внутренних бизнес-процессов учреждения. "
            "Разрабатывать и сопровождать автоматизации на Python и n8n: workflow, триггеры, "
            "расписания, обработка ошибок, логирование. Разрабатывать и внедрять цифровые сервисы "
            "с использованием ИИ-агентов. Интегрировать Planfix с внешними сервисами через REST API. "
            "Настраивать webhook: маршрутизация событий, защита секретами и подписями, ретраи, "
            "контроль дублей. Администрировать PostgreSQL для n8n и MySQL: доступы, мониторинг, "
            "резервное копирование, оптимизация запросов. Писать Telegram-ботов на Python: "
            "уведомления, команды, статусы задач. Оптимизировать отчетность через BI-инструменты. "
            "Документировать интеграции и workflow."),
    ),
    dict(
        id="132113662", source="real",
        name="Маркетолог / Разработчик ботов для BotHelp (CRM, чат-боты, автоматизация)",
        employer="СМАРТТЕХ 24", area="Москва",
        salary_from=80000, salary_to=None, currency="RUR",
        experience="1–3 года", employment="полная занятость",
        url="https://hh.ru/vacancy/132113662", published_at="2026-05-08",
        key_skills="BotHelp, чат-боты, CRM, автоматизация маркетинга",
        description=(
            "Разработка и настройка чат-ботов и воронок в BotHelp, интеграция с CRM, автоматизация "
            "маркетинговых коммуникаций и обработки заявок."),
    ),
    dict(
        id="137842709", source="real",
        name="Бизнес-аналитик по автоматизации процессов",
        employer="Цифровой семейный офис", area="Москва",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="https://hh.ru/vacancy/137842709", published_at="2026-09-28",
        key_skills="Bitrix24, Python, Telegram Bot API, VK API, HR-tech, бизнес-процессы",
        description=(
            "Опыт настройки бизнес-процессов в трекере задач. Умение самостоятельно разбираться в "
            "бизнес-процессе и предлагать решение, а не только фиксировать требования. Опыт "
            "внедрения CRM в бизнес-процессы (Bitrix24 или аналогичной CRM). Опыт внедрения HR-tech "
            "решений (модули целей, KPI, performance review). Знание Python на уровне написания "
            "скриптов и ботов. Опыт разработки чат-ботов (Telegram Bot API, VK API). Опыт участия в "
            "постановке ПО в реестр Минцифры и получение патента."),
    ),
    dict(
        id="127934931", source="real",
        name="Разработчик чат-ботов",
        employer="МАКСИМА", area="Москва (удалённо или гибрид)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="https://hh.ru/vacancy/127934931", published_at="2025-11-21",
        key_skills="Telegram, MAX, API, MVP, архитектура",
        description=(
            "Полный цикл создания чат-ботов для платформ Telegram и MAX — от проектирования "
            "архитектуры и написания кода до запуска и поддержки. Техническая реализация гипотез: "
            "быстрое прототипирование и создание MVP для проверки продуктовых гипотез. Активная "
            "работа с внешними API для подключения сторонних сервисов и данных. Участие в "
            "формировании дорожной карты продукта."),
    ),
    dict(
        id="130316029", source="real",
        name="AI-инженер",
        employer="X5, Управляющая компания", area="Москва (удалённо или гибрид)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="https://hh.ru/vacancy/130316029", published_at="2026-02-10",
        key_skills="Prompt Engineering, LangChain, LlamaIndex, n8n, langflow, RAG, Python, OpenAI API",
        description=(
            "Инженер по разработке и внедрению ИИ решений. Разрабатывать и внедрять решения по "
            "автоматизации с использованием Генеративного ИИ для автоматизации рутинных процессов, "
            "повышения качества и скорости работы бизнес-аналитиков и PM. Разработка и оптимизация "
            "промптов (Prompt Engineering): создание сложных промптов для анализа, классификации, "
            "суммирования и генерации текстовой документации (брифы, требования, ТЗ, аналитические "
            "записки). Проектирование LLM-приложений, интегрированных в рабочий процесс аналитиков, "
            "с использованием API локальных моделей и фреймворков (LangChain, LlamaIndex). Знание "
            "фреймворков n8n, langflow, ADK. Умение строить RAG и работать с векторными базами "
            "знаний. Задачи: «Генератор шаблонной документации» — автоматизация создания ТЗ, "
            "бизнес-функциональных требований и других артефактов проектного управления; «Умный "
            "поиск по базе знаний ИБ» — RAG-система, которая позволяет аналитикам на естественном "
            "языке задавать вопросы по внутренним политикам, стандартам и прошлым проектам."),
    ),
    dict(
        id="131622365", source="real",
        name="AI-инженер (LLM, RAG, ML)",
        employer="Банк ПСБ, ИТ", area="Москва",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="https://hh.ru/vacancy/131622365", published_at="2026-04-08",
        key_skills="RAG, LangChain, LLM, векторные базы данных, эмбеддинги, ML",
        description=(
            "Проектировать и разрабатывать RAG-пайплайны (Retrieval-Augmented Generation) для задач "
            "question-answering, поиска и суммаризации документов. Интегрировать LLM (локальные "
            "модели) с использованием фреймворков (LangChain). Работать с векторными базами данных "
            "для эффективного хранения и поиска эмбеддингов."),
    ),
    dict(
        id="129860777", source="real",
        name="AI-инженер (LLM, Prompt, Eval)",
        employer="HeadHunter:: IT", area="Москва",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="полная занятость",
        url="https://hh.ru/vacancy/129860777", published_at="2026-02-20",
        key_skills="LLM, Prompt, Eval, оценка качества",
        description=(
            "Разработка и развитие LLM-приложений: промпт-инжиниринг, построение оценки качества "
            "(eval) ответов моделей, поддержка качества продуктов на базе больших языковых моделей."),
    ),
    dict(
        id="132531359", source="real",
        name="AI No-code/Low-code разработчик автоматизации процессов",
        employer="Freedom Finance Technologies LTD", area="Кипр (удалённо)",
        salary_from=None, salary_to=1500, currency="EUR",
        experience="1–3 года", employment="полная занятость",
        url="https://cyprus.hh.ru/vacancy/132531359", published_at="2026-04-27",
        key_skills="AI, no-code, low-code, автоматизация процессов",
        description=(
            "Разработка и внедрение автоматизаций бизнес-процессов на no-code/low-code платформах "
            "с применением AI-инструментов. Оплата в евро."),
    ),
    dict(
        id="117964583", source="real",
        name="Специалист по созданию telegram бота программист",
        employer="АНО Центр Поддержки Семьи и Детства «В Кругу Семьи»", area="Москва (удалённо)",
        salary_from=None, salary_to=None, currency="RUR",
        experience="1–3 года", employment="проект или разовое задание",
        url="https://hh.ru/vacancy/117964583", published_at="2025-03-03",
        key_skills="Telegram Bot API, AI, реферальная система, архитектура",
        description=(
            "Разработка Telegram-бота с интеграцией искусственного интеллекта и реферальной "
            "системой. Проектирование архитектуры бота, выбор технологий и инструментов для "
            "реализации. Тестирование, отладка и оптимизация функционала. Поддержка."),
    ),

    # --------------------- ВОССТАНОВЛЕННЫЕ ПО ИССЛЕДОВАНИЯМ ---------------------
    dict(
        id="synthetic-vibe-python", source="synthetic",
        name="Инженер-разработчик (Python, Vibe Coding)",
        employer="Ак Барс Цифровые Технологии", area="Россия",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="", published_at="2026-08-01",
        key_skills="Python, Cursor, Claude Code, vibe coding",
        description=(
            "Ваша главная задача — ускорять доставку функционала (Time-to-Market), используя "
            "практики Vibe Coding. Практический опыт использования AI-инструментов в разработке: "
            "Cursor, Copilot, Claude Code, Devin, CrewAI и аналогичных."),
    ),
    dict(
        id="synthetic-vibe-lead", source="synthetic",
        name="Tech Lead по Vibe-coding (AI-инженер / ML-архитектор)",
        employer="", area="Россия (удалённо)",
        salary_from=300000, salary_to=425000, currency="RUR",
        experience="более 6 лет", employment="полная занятость, удалённо",
        url="", published_at="2026-08-15",
        key_skills="Claude Code, Cursor, MCP, harness, мультиагентные системы, A2A",
        description=(
            "Применять агентные инструменты разработки (Claude Code, Cursor) и писать "
            "skills/инструкции для агентов. Построение агентов и мультиагентных систем: harness "
            "(OpenClaw, Hermes), инструменты, MCP, A2A-протоколы."),
    ),
    dict(
        id="synthetic-harness", source="synthetic",
        name="AI Engineer (harness, MCP, агенты)",
        employer="", area="Москва",
        salary_from=250000, salary_to=350000, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="", published_at="2026-09-01",
        key_skills="LLM, MCP, агенты, code review, RAG",
        description=(
            "Мы строим harness-системы вокруг LLM: агентов с инструментами, автоматизацию code "
            "review, ассистентов для написания DAG-ов. Нужен опыт построения агентных систем, "
            "MCP-серверов и оценки качества ответов (evals, наблюдаемость)."),
    ),
    dict(
        id="synthetic-rag-legal", source="synthetic",
        name="AI Engineer / RAG Engineer (документы)",
        employer="", area="Россия (удалённо)",
        salary_from=200000, salary_to=450000, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="", published_at="2026-09-10",
        key_skills="RAG, LangChain, векторные базы, чанки, метаданные, SQL",
        description=(
            "Юристам нужны ответы из 4000 договоров. Нужно разбивать документы на фрагменты, искать "
            "ближайшие по смыслу и вклеивать их в промпт. Построение RAG-пайплайна: векторная база, "
            "LangChain, чанки, метаданные, оценка качества ответов. SQL для выгрузки данных."),
    ),
    dict(
        id="synthetic-forward-deployed", source="synthetic",
        name="Forward-Deployed AI Product Engineer",
        employer="", area="Россия",
        salary_from=None, salary_to=None, currency="RUR",
        experience="3–6 лет", employment="полная занятость",
        url="", published_at="2026-09-20",
        key_skills="AI-агенты, интеграции API, SQL, метрики, общение с заказчиком",
        description=(
            "Сидеть внутри бизнес-юнита и превращать ручной процесс в автоматический. Половина "
            "работы не код: сесть рядом с командой на два дня, потому что процесс в вики не равен "
            "реальному. Автоматизировать извлечение данных, спорные поля отправлять человеку, "
            "мерить минуты на заявку, а не точность. Интеграция API, SQL, работа с документами и "
            "заявками."),
    ),
    dict(
        id="synthetic-integrator-ai", source="synthetic",
        name="Специалист по внедрению AI (AI Integrator)",
        employer="", area="Россия (удалённо)",
        salary_from=120000, salary_to=220000, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="", published_at="2026-09-25",
        key_skills="AI, внедрение, бизнес-процессы, документооборот, CRM, обучение команды",
        description=(
            "Настройка и внедрение готовых AI-решений в бизнес-процессы компании: документооборот "
            "и обработка заявок, первая линия поддержки, отчётность. Обучение команды работе с "
            "инструментами, подбор подходящих решений, сопровождение после запуска. Широкая вилка "
            "зарплаты: работодатель сам не знает, кого найдёт."),
    ),
    dict(
        id="synthetic-support-rag", source="synthetic",
        name="AI-инженер поддержки (RAG по базе знаний)",
        employer="", area="Россия (удалённо)",
        salary_from=150000, salary_to=250000, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="", published_at="2026-10-01",
        key_skills="RAG, Telegram, чат-бот, LangChain, оценка качества, логирование",
        description=(
            "Нужен ассистент первой линии поддержки по внутренней базе знаний: чат-бот в Telegram, "
            "ответы на типовые вопросы клиентов и сотрудников, эскалация сложных случаев оператору. "
            "RAG по регламентам и инструкциям, логирование диалогов, мониторинг и оценка качества "
            "ответов, обработка ошибок и лимитов."),
    ),
    dict(
        id="synthetic-docflow", source="synthetic",
        name="Разработчик автоматизации документооборота (IDP)",
        employer="", area="Россия",
        salary_from=180000, salary_to=300000, currency="RUR",
        experience="1–3 года", employment="полная занятость",
        url="", published_at="2026-10-05",
        key_skills="OCR, LLM, Python, 1С, ЭДО, PostgreSQL, извлечение данных",
        description=(
            "Автоматизация обработки входящих документов: классификация файлов, извлечение полей и "
            "реквизитов в учётную систему (1С), сверка счетов со сметами и актами, формирование "
            "резюме документа для сотрудника, маршруты согласования договоров. Python, OCR, LLM, "
            "PostgreSQL, интеграция с ЭДО и 1С."),
    ),
    dict(
        id="synthetic-lead-bot", source="synthetic",
        name="Специалист по автоматизации отдела продаж (CRM + AI-бот)",
        employer="", area="Россия (удалённо)",
        salary_from=90000, salary_to=180000, currency="RUR",
        experience="1–3 года", employment="частичная занятость, самозанятый",
        url="", published_at="2026-10-10",
        key_skills="amoCRM, Bitrix24, n8n, Telegram, webhook, лиды, рассылки, отчётность",
        description=(
            "Менеджеры теряют заявки в Excel. Нужно: приём заявок с сайта и мессенджеров через "
            "webhook в CRM, квалификация лидов с помощью LLM, автоответы и follow-up, рассылки, "
            "отчётность по воронке в Google Sheets и дашборд для собственника. amoCRM или Битрикс24, "
            "n8n, Telegram."),
    ),
    dict(
        id="synthetic-reporting", source="synthetic",
        name="Инженер по отчётности и интеграциям (ETL, BI)",
        employer="", area="Россия (удалённо)",
        salary_from=120000, salary_to=200000, currency="RUR",
        experience="1–3 года", employment="полная занятость, удалённо",
        url="", published_at="2026-10-15",
        key_skills="ETL, SQL, Python, Google Sheets, BI, дашборды, API, 1С",
        description=(
            "Отчёт для собственника готовится три дня. Нужно собирать данные из CRM, 1С, рекламных "
            "кабинетов и Google Sheets, приводить к одному формату и автоматически формировать "
            "управленческую отчётность и дашборды. ETL-пайплайны на Python и n8n, SQL, планировщик, "
            "обработка ошибок и логирование."),
    ),
]


def as_rows():
    """Возвращает список словарей в схеме анализатора."""
    rows = []
    for rec in RECORDS:
        rows.append({
            "id": rec["id"],
            "name": rec["name"],
            "employer": rec["employer"],
            "area": rec["area"],
            "salary_from": rec["salary_from"],
            "salary_to": rec["salary_to"],
            "currency": rec["currency"],
            "experience": rec["experience"],
            "employment": rec["employment"],
            "schedule": "",
            "published_at": rec["published_at"],
            "alternate_url": rec["url"],
            "key_skills": rec["key_skills"],
            "professional_roles": "",
            "description": rec["description"],
            "source": rec["source"],
        })
    return rows
