"""
Сбор вакансий с hh.ru.

ВАЖНО ПРО ДОСТУП (проверено на открытых источниках, октябрь 2026):
  * с 15.12.2025 hh.ru закрыл соискательскую часть API (резюме, отклики, POST /negotiations);
  * с апреля 2026 GET /vacancies отдаёт 403 для неавторизованных запросов;
  * ключи теперь выдают преимущественно работодателям и рекрутинговым сервисам после модерации.

Поэтому здесь три режима, и они честно называются своими именами:

  1. `fetch_search_api`  — официальный API. Сработает, только если у вас есть
                          зарегистрированное приложение на dev.hh.ru и модерация пройдена.
                          На 403 функция не падает молча, а возвращает понятную диагностику.
  2. `fetch_from_html`   — разбор страницы поиска, которую вы сохранили вручную
                          (Ctrl+S) или скачали сами. Никакой автоматической обхода
                          защиты: вы сами открываете страницу в своём браузере.
  3. `fetch_from_clipboard` — самый надёжный «серый» способ для личной аналитики:
                          вы копируете тексты вакансий в файл, анализатор их разбирает.

Режим 2 и 3 — про то, чтобы не нарушать правила площадки массовыми запросами.
Для личной аналитики на 200–500 вакансий их достаточно.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, List, Optional

API_BASE = "https://api.hh.ru"
# ВНИМАНИЕ: HTTP-заголовки кодируются в latin-1, кириллица здесь упадёт с
# UnicodeEncodeError. Держите эту строку ASCII-only.
USER_AGENT = "market-scan/1.0 (personal labour-market research; contact: set-your-email)"

# Запросы, которые покрывают нишу «no-code + AI-автоматизация».
# Каждый даёт до 100 результатов на страницу, до 20 страниц.
DEFAULT_QUERIES: List[str] = [
    "n8n",
    "автоматизация бизнес-процессов",
    "no-code AI",
    "разработчик Telegram-ботов",
    "AI-инженер LLM",
    "RAG",
    "интегратор CRM",
    "внедрение нейросетей",
    "промпт-инженер",
    "чат-бот разработка",
    "ai агент бизнес процессы",
    "Make Zapier автоматизация",
]


class HHAccessError(RuntimeError):
    """Доступ к API hh.ru закрыт/не авторизован."""


def _request(url: str, token: Optional[str] = None, timeout: int = 20) -> dict:
    headers = {"User-Agent": USER_AGENT, "HH-User-Agent": USER_AGENT,
               "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        if e.code == 403:
            raise HHAccessError(
                "403 Forbidden от api.hh.ru. Публичный поиск вакансий закрыт с апреля 2026: "
                "нужен токен приложения, прошедшего модерацию на dev.hh.ru "
                "(выдают в основном работодателям и рекрутинговым сервисам). "
                "Для личной аналитики используйте `save-html` / `clip` режимы. "
                f"Ответ сервера: {body}"
            ) from e
        raise HHAccessError(f"HTTP {e.code} от api.hh.ru: {body}") from e
    except urllib.error.URLError as e:
        raise HHAccessError(f"api.hh.ru недоступен из этой сети: {e.reason}") from e


def normalize_api_item(item: Dict) -> Dict:
    """Приводит элемент ответа GET /vacancies к нашей плоской схеме."""
    sal = item.get("salary") or {}
    skills = ", ".join(s.get("name", "") for s in (item.get("key_skills") or []))
    roles = ", ".join(r.get("name", "") for r in (item.get("professional_roles") or []))
    exp = (item.get("experience") or {}).get("name", "")
    emp = ", ".join(e.get("name", "") for e in (item.get("employment") or []))
    sched = ", ".join(s.get("name", "") for s in (item.get("schedule") or []))
    area = (item.get("area") or {}).get("name", "")
    employer = (item.get("employer") or {}).get("name", "")
    return {
        "id": str(item.get("id", "")),
        "name": item.get("name", ""),
        "employer": employer,
        "area": area,
        "salary_from": sal.get("from"),
        "salary_to": sal.get("to"),
        "currency": sal.get("currency", "RUR"),
        "experience": exp,
        "employment": emp,
        "schedule": sched,
        "published_at": item.get("published_at", ""),
        "alternate_url": item.get("alternate_url", ""),
        "key_skills": skills,
        "professional_roles": roles,
        "description": item.get("snippet", {}).get("requirement", "") or "",
    }


def fetch_search_api(query: str, token: Optional[str] = None,
                     pages: int = 2, per_page: int = 100,
                     area: Optional[str] = None,
                     sleep: float = 1.0) -> List[Dict]:
    """
    Официальный поиск через API. Требует рабочую авторизацию.

    area: код региона, например "1" — Москва, "2" — СПб, "113" — Россия.
    """
    collected: List[Dict] = []
    for page in range(pages):
        params = {"text": query, "page": page, "per_page": per_page,
                  "order_by": "publication_time"}
        if area:
            params["area"] = area
        url = f"{API_BASE}/vacancies?{urllib.parse.urlencode(params)}"
        data = _request(url, token=token)
        items = data.get("items") or []
        if not items:
            break
        collected.extend(normalize_api_item(i) for i in items)
        if page + 1 >= data.get("pages", 1):
            break
        time.sleep(sleep)  # не долбим площадку
    return collected


def detail_vacancy(vacancy_id: str, token: Optional[str] = None) -> Dict:
    """GET /vacancies/{id} — полный текст описания."""
    data = _request(f"{API_BASE}/vacancies/{vacancy_id}", token=token)
    row = normalize_api_item(data)
    row["description"] = data.get("description", "")
    return row


# ---------------------------------------------------------------------------
# Режим без API: разбор сохранённой страницы поиска hh.ru
# ---------------------------------------------------------------------------

# Страница выдачи hh.ru несёт состояние приложения в <script id="__NEXT_DATA__">.
# Публичный поиск там виден как JSON — это то, что вы и так видите глазами в браузере.
_NEXT_DATA = re.compile(
    r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)


def parse_search_html(html: str) -> List[Dict]:
    """
    Достаёт вакансии из сохранённой HTML-страницы поиска hh.ru.

    Если вёрстка поменяется и __NEXT_DATA__ исчезнет, функция вернёт пустой
    список и сообщит об этом — молча ничего не «угадывает».
    """
    m = _NEXT_DATA.search(html)
    if not m:
        raise HHAccessError(
            "В сохранённой странице не найден __NEXT_DATA__ — hh.ru изменил вёрстку. "
            "Используйте режим `clip` (вставка текстов вакансий вручную) — он от "
            "вёрстки не зависит."
        )
    data = json.loads(m.group(1))
    found: List[Dict] = []

    def walk(node):
        """Ищем объекты, похожие на вакансию, на любой глубине состояния."""
        if isinstance(node, dict):
            if "vacancyId" in node or ("title" in node and "employer" in node):
                found.append(node)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)

    out = []
    for card in found:
        salary = card.get("salary") or {}
        employer = card.get("employer") or {}
        out.append({
            "id": str(card.get("vacancyId") or card.get("id") or ""),
            "name": card.get("title") or card.get("name") or "",
            "employer": employer.get("name", "") if isinstance(employer, dict) else str(employer),
            "area": (card.get("area") or {}).get("name", "") if isinstance(card.get("area"), dict) else "",
            "salary_from": salary.get("from") if isinstance(salary, dict) else None,
            "salary_to": salary.get("to") if isinstance(salary, dict) else None,
            "currency": salary.get("currency", "RUR") if isinstance(salary, dict) else "RUR",
            "experience": card.get("experience", "") if isinstance(card.get("experience"), str) else "",
            "employment": card.get("employment", "") if isinstance(card.get("employment"), str) else "",
            "schedule": "",
            "published_at": card.get("publishedAt", "") or "",
            "alternate_url": card.get("url") or "",
            "key_skills": "",
            "professional_roles": "",
            "description": _strip_tags(card.get("snippet") or ""),
        })
    return out


def _strip_tags(text) -> str:
    if not isinstance(text, str):
        return ""
    return re.sub(r"<[^>]+>", " ", text)


# ---------------------------------------------------------------------------
# Режим без API и без вёрстки: ручной сбор текстов
# ---------------------------------------------------------------------------

_RECORD_SEP = re.compile(r"^={5,}\s*$", re.MULTILINE)
_FIELD = re.compile(r"^(Заголовок|Работодатель|Город|Опыт|Занятость|Зарплата|Ссылка|Текст):\s*(.*)$")


def parse_clip_text(blob: str) -> List[Dict]:
    """
    Разбирает тексты вакансий, скопированные вручную.

    Формат записи (разделитель — строка из пяти и более "="):

        Заголовок: Интегратор / специалист по автоматизации / no-code
        Работодатель: ООО Ромашка
        Город: Москва
        Опыт: 1–3 года
        Занятость: частичная занятость
        Зарплата: от 40000 до 120000
        Ссылка: https://hh.ru/vacancy/137471009
        Текст: Чем предстоит заниматься: настраивать n8n, Make, Zapier...
    """
    out: List[Dict] = []
    for chunk in _RECORD_SEP.split(blob):
        chunk = chunk.strip()
        if not chunk:
            continue
        row = {
            "id": "", "name": "", "employer": "", "area": "",
            "salary_from": None, "salary_to": None, "currency": "RUR",
            "experience": "", "employment": "", "schedule": "",
            "published_at": "", "alternate_url": "", "key_skills": "",
            "professional_roles": "", "description": "",
        }
        lines = chunk.splitlines()
        body_lines: List[str] = []
        capture_body = False
        for line in lines:
            m = _FIELD.match(line.strip())
            if not m:
                if capture_body:
                    body_lines.append(line)
                continue
            key, value = m.group(1), m.group(2).strip()
            capture_body = key == "Текст"
            if key == "Заголовок":
                row["name"] = value
            elif key == "Работодатель":
                row["employer"] = value
            elif key == "Город":
                row["area"] = value
            elif key == "Опыт":
                row["experience"] = value
            elif key == "Занятость":
                row["employment"] = value
            elif key == "Ссылка":
                row["alternate_url"] = value
                vm = re.search(r"/vacancy/(\d+)", value)
                if vm:
                    row["id"] = vm.group(1)
            elif key == "Зарплата":
                lo, hi = _parse_salary_line(value)
                row["salary_from"], row["salary_to"] = lo, hi
            elif key == "Текст":
                if value:
                    body_lines.append(value)
        row["description"] = "\n".join(body_lines).strip()
        if row["name"] or row["description"]:
            out.append(row)
    return out


def _parse_salary_line(value: str):
    """'от 40000 до 120000' / 'до 1500 €' / '70 000' -> (from, to)."""
    if not value or "не указана" in value.lower():
        return None, None
    raw = re.findall(r"\d[\d\s\xa0]{0,10}\d|\d", value)
    nums = [int(re.sub(r"\D", "", x)) for x in raw]
    nums = [x for x in nums if x]
    if not nums:
        return None, None
    if "от" in value and "до" in value and len(nums) >= 2:
        return nums[0], nums[1]
    if value.strip().lower().startswith("до") and nums:
        return None, nums[0]
    if "от" in value and nums:
        return nums[0], None
    if len(nums) >= 2:
        return nums[0], nums[1]
    return nums[0], None
