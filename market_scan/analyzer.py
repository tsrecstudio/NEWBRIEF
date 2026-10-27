"""
Анализатор выборки вакансий.

На входе — список словарей-вакансий (нормализованный вид, см. model.py).
На выходе — словарь со срезами рынка и Markdown-отчёт.

Никаких внешних зависимостей: только stdlib.
"""
from __future__ import annotations

import re
import statistics
from collections import Counter, defaultdict
from typing import Dict, Iterable, List, Optional, Tuple

from . import taxonomy

# ---------------------------------------------------------------------------
# Нормализация
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")


def clean(text: Optional[str]) -> str:
    """Убирает HTML-теги и схлопывает пробелы."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
    text = text.replace("&#39;", "'").replace("&mdash;", "—")
    return _WS.sub(" ", text).strip()


# Курсы для приведения вилок к рублям. Обновите при необходимости.
FX_TO_RUB = {"RUR": 1.0, "RUB": 1.0, "EUR": 95.0, "USD": 88.0, "BYR": 0.03, "KZT": 0.18}


def money(value) -> Optional[float]:
    """'120000' / '120 000' / 'от 40 000 до 120 000 ₽' -> число или None."""
    if value in (None, "", "None"):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    digits = re.sub(r"[^\d]", "", str(value))
    if not digits:
        return None
    return float(digits)


def salary_mid(row: Dict) -> Optional[float]:
    """Среднее по вилке, приведённое к рублям (EUR/USD пересчитываются)."""
    fx = FX_TO_RUB.get((row.get("currency") or "RUR").upper(), 1.0)
    lo, hi = money(row.get("salary_from")), money(row.get("salary_to"))
    if lo and hi:
        return (lo + hi) / 2.0 * fx
    return (lo or hi or 0) * fx or None


def detect_archetypes(row: Dict) -> List[str]:
    """
    Архетип определяется сначала по заголовку и только потом по всему тексту.

    Иначе вакансия «AI-инженер», в тексте которой упомянут n8n как один из
    фреймворков, ошибочно уезжает в «no-code интеграторы».
    """
    name = clean(row.get("name"))
    by_title = [n for n, rx in taxonomy.ARCHETYPES_RE if rx.search(name)]
    if by_title:
        return by_title
    return _hits(vacancy_text(row), taxonomy.ARCHETYPES_RE) or ["? не определён"]


def vacancy_text(row: Dict) -> str:
    """Текст, по которому ищем навыки: заголовок + описание + ключевые навыки."""
    parts = [
        row.get("name") or "",
        row.get("description") or "",
        row.get("key_skills") or "",
        row.get("professional_roles") or "",
    ]
    return clean(" ".join(parts))


# ---------------------------------------------------------------------------
# Срезы
# ---------------------------------------------------------------------------

def _hits(text: str, compiled) -> List[str]:
    return [name for name, rx in compiled if rx.search(text)]


def _fmt_money(v: float) -> str:
    return f"{int(round(v)):,}".replace(",", " ") + " ₽"


def _median_label(values: List[float]) -> str:
    if not values:
        return "нет данных о зарплате"
    med = statistics.median(values)
    lo, hi = min(values), max(values)
    return f"медиана {_fmt_money(med)} (n={len(values)}, вилка {_fmt_money(lo)} – {_fmt_money(hi)})"


def analyze(vacancies: Iterable[Dict]) -> Dict:
    vacancies = list(vacancies)
    n = len(vacancies)

    skill_counter: Counter = Counter()
    problem_counter: Counter = Counter()
    archetype_counter: Counter = Counter()
    format_counter: Counter = Counter()
    flag_counter: Counter = Counter()

    # какие навыки в каких архетипах встречаются — для матрицы "что учить под что"
    archetype_skills: Dict[str, Counter] = defaultdict(Counter)
    archetype_problems: Dict[str, Counter] = defaultdict(Counter)
    archetype_salaries: Dict[str, List[float]] = defaultdict(list)
    problem_salaries: Dict[str, List[float]] = defaultdict(list)
    skill_salaries: Dict[str, List[float]] = defaultdict(list)

    salaries: List[float] = []
    rows_enriched: List[Dict] = []

    for row in vacancies:
        text = vacancy_text(row)
        mid = salary_mid(row)
        if mid:
            salaries.append(mid)

        skills = _hits(text, taxonomy.SKILLS_RE)
        problems = _hits(text, taxonomy.PROBLEMS_RE)
        archetypes = detect_archetypes(row)
        fmt_text = " ".join([
            clean(row.get("employment")), clean(row.get("schedule")),
            clean(row.get("experience")), text,
        ])
        formats = _hits(fmt_text, taxonomy.FORMATS_RE)
        flags = _hits(text, taxonomy.FLAGS_RE)

        for s in skills:
            skill_counter[s] += 1
            if mid:
                skill_salaries[s].append(mid)
        for p in problems:
            problem_counter[p] += 1
            if mid:
                problem_salaries[p].append(mid)
        for a in archetypes:
            archetype_counter[a] += 1
            if mid:
                archetype_salaries[a].append(mid)
            for s in skills:
                archetype_skills[a][s] += 1
            for p in problems:
                archetype_problems[a][p] += 1
        for f in formats:
            format_counter[f] += 1
        for f in flags:
            flag_counter[f] += 1

        rows_enriched.append({
            **row,
            "_skills": skills,
            "_problems": problems,
            "_archetypes": archetypes,
            "_formats": formats,
            "_flags": flags,
            "_salary_mid": mid,
        })

    return {
        "count": n,
        "with_salary": len(salaries),
        "salary_median": statistics.median(salaries) if salaries else None,
        "salary_all": salaries,
        "skills": skill_counter,
        "problems": problem_counter,
        "archetypes": archetype_counter,
        "formats": format_counter,
        "flags": flag_counter,
        "archetype_skills": archetype_skills,
        "archetype_problems": archetype_problems,
        "archetype_salaries": archetype_salaries,
        "problem_salaries": problem_salaries,
        "skill_salaries": skill_salaries,
        "rows": rows_enriched,
    }


# ---------------------------------------------------------------------------
# Отчёт
# ---------------------------------------------------------------------------

def _table(counter: Counter, total: int, top: int = 25,
           salary_map: Optional[Dict[str, List[float]]] = None) -> List[str]:
    lines = ["| # | Что | Вакансий | Доля | Зарплата |",
             "|---|-----|---------:|-----:|----------|"]
    for i, (name, cnt) in enumerate(counter.most_common(top), start=1):
        share = f"{cnt / total * 100:.0f}%" if total else "—"
        sal = _median_label(salary_map[name]) if salary_map and name in salary_map else "—"
        lines.append(f"| {i} | {name} | {cnt} | {share} | {sal} |")
    return lines


def render_report(res: Dict, title: str = "Срез рынка", top: int = 40) -> str:
    n = res["count"] or 1
    out: List[str] = []
    out.append(f"# {title}")
    out.append("")
    out.append(f"Вакансий в выборке: **{res['count']}**. "
               f"С открытой зарплатой: **{res['with_salary']}**. "
               f"{_median_label(res['salary_all'])}.")
    out.append("")

    out.append("## 1. Кого ищут (архетипы ролей)")
    out.append("")
    out.extend(_table(res["archetypes"], n, top, res["archetype_salaries"]))
    out.append("")

    out.append("## 2. Что именно автоматизируют (бизнес-задачи)")
    out.append("")
    out.append("Это самый важный раздел: здесь видно, за какую боль платят деньги, "
               "а не какие технологии модные.")
    out.append("")
    out.extend(_table(res["problems"], n, top, res["problem_salaries"]))
    out.append("")

    out.append("## 3. Стек: что требуют")
    out.append("")
    out.extend(_table(res["skills"], n, top * 2, res["skill_salaries"]))
    out.append("")

    out.append("## 4. Что учить под каждый архетип")
    out.append("")
    for arch, cnt in res["archetypes"].most_common():
        if arch.startswith("?"):
            continue
        top_skills = ", ".join(k for k, _ in res["archetype_skills"][arch].most_common(8)) or "—"
        top_probs = "; ".join(k for k, _ in res["archetype_problems"][arch].most_common(3)) or "—"
        out.append(f"- **{arch}** ({cnt} ваканс.)")
        out.append(f"  - стек: {top_skills}")
        out.append(f"  - задачи: {top_probs}")
        out.append(f"  - деньги: {_median_label(res['archetype_salaries'].get(arch, []))}")
    out.append("")

    out.append("## 5. Формат работы и условия")
    out.append("")
    out.extend(_table(res["formats"], n, 10))
    out.append("")
    out.append("### Сигналы в текстах вакансий")
    out.append("")
    out.extend(_table(res["flags"], n, 10))
    out.append("")

    out.append("## 6. Все вакансии выборки")
    out.append("")
    out.append("| Заголовок | Работодатель | Вилка | Опыт | Занятость | Архетип |")
    out.append("|-----------|--------------|-------|------|-----------|---------|")
    for r in res["rows"]:
        sal = "—"
        if r["_salary_mid"]:
            lo, hi = money(r.get("salary_from")), money(r.get("salary_to"))
            sal = f"{_fmt_money(lo)}–{_fmt_money(hi)}" if lo and hi else _fmt_money(r["_salary_mid"])
        arch = (r["_archetypes"][0] if r["_archetypes"] else "—").split(". ")[-1]
        out.append(
            f"| {clean(r.get('name'))[:60]} | {clean(r.get('employer'))[:28] or '—'} | {sal} "
            f"| {clean(r.get('experience')) or '—'} | {clean(r.get('employment')) or '—'} | {arch} |"
        )
    out.append("")
    return "\n".join(out)
