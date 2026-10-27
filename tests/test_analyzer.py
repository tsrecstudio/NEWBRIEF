#!/usr/bin/env python3
"""
Тесты market_scan. Запуск: python3 -m unittest discover -s tests -v

Тестируется реальный код: analyzer.analyze(), analyzer.render_report(),
fetch.parse_clip_text(), fetch.parse_search_html(), fetch._parse_salary_line()
и паттерны таксономии на настоящих текстах вакансий.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from market_scan import analyzer, fetch, sample_data, taxonomy  # noqa: E402


class TestSalaryParsing(unittest.TestCase):
    def test_salary_line_variants(self):
        self.assertEqual(fetch._parse_salary_line("от 40000 до 120000"), (40000, 120000))
        self.assertEqual(fetch._parse_salary_line("от 70000"), (70000, None))
        self.assertEqual(fetch._parse_salary_line("до 1500"), (None, 1500))
        self.assertEqual(fetch._parse_salary_line("не указана"), (None, None))
        self.assertEqual(fetch._parse_salary_line(""), (None, None))
        # пробелы-разделители тысяч
        self.assertEqual(fetch._parse_salary_line("от 120 000 до 220 000"), (120000, 220000))

    def test_money_and_mid(self):
        self.assertEqual(analyzer.money("120 000"), 120000.0)
        self.assertIsNone(analyzer.money(None))
        self.assertEqual(
            analyzer.salary_mid({"salary_from": 40000, "salary_to": 120000}), 80000.0)
        self.assertEqual(analyzer.salary_mid({"salary_from": 70000}), 70000.0)


class TestClean(unittest.TestCase):
    def test_strips_html(self):
        raw = "<p>Опыт&nbsp;с&nbsp;<b>n8n</b></p>"
        self.assertEqual(analyzer.clean(raw), "Опыт с n8n")


class TestTaxonomyOnRealTexts(unittest.TestCase):
    """Паттерны проверяются на настоящих текстах вакансий из sample_data."""

    def _text(self, vac_id):
        row = next(r for r in sample_data.as_rows() if r["id"] == vac_id)
        return analyzer.vacancy_text(row)

    def test_n8n_detected(self):
        hits = [n for n, rx in taxonomy.SKILLS_RE
                if rx.search(self._text("137471009"))]
        self.assertIn("n8n", hits)
        self.assertIn("Make (Integromat)", hits)
        self.assertIn("Zapier", hits)
        self.assertIn("Webhook", hits)

    def test_rag_and_prompt_detected(self):
        hits = [n for n, rx in taxonomy.SKILLS_RE
                if rx.search(self._text("130316029"))]
        self.assertIn("RAG", hits)
        self.assertIn("Промпт-инжиниринг", hits)
        self.assertIn("LangChain / LlamaIndex", hits)

    def test_telegram_bot_detected(self):
        hits = [n for n, rx in taxonomy.SKILLS_RE
                if rx.search(self._text("128986603"))]
        self.assertIn("aiogram", hits)
        self.assertIn("Telegram Mini Apps", hits)

    def test_make_not_confused_with_verb(self):
        """Слово 'make' в английском тексте не должно давать ложный Make."""
        text = "You have to make a decision and make it fast"
        self.assertFalse(taxonomy.SKILLS_RE and
                         next(rx for n, rx in taxonomy.SKILLS_RE
                              if n == "Make (Integromat)").search(text))


class TestArchetypes(unittest.TestCase):
    def test_nocode_archetype(self):
        row = next(r for r in sample_data.as_rows() if r["id"] == "137471009")
        archetypes = [n for n, rx in taxonomy.ARCHETYPES_RE
                      if rx.search(analyzer.vacancy_text(row))]
        self.assertTrue(any(a.startswith("A.") for a in archetypes),
                        f"ожидали архетип A, получили {archetypes}")

    def test_ai_engineer_archetype(self):
        row = next(r for r in sample_data.as_rows() if r["id"] == "131622365")
        archetypes = [n for n, rx in taxonomy.ARCHETYPES_RE
                      if rx.search(analyzer.vacancy_text(row))]
        self.assertTrue(any(a.startswith("C.") for a in archetypes),
                        f"ожидали архетип C, получили {archetypes}")


class TestBusinessProblems(unittest.TestCase):
    def test_documents_problem(self):
        row = next(r for r in sample_data.as_rows() if r["id"] == "synthetic-docflow")
        probs = [n for n, rx in taxonomy.PROBLEMS_RE
                 if rx.search(analyzer.vacancy_text(row))]
        self.assertTrue(any("Документы" in p for p in probs), f"получили {probs}")

    def test_support_problem(self):
        row = next(r for r in sample_data.as_rows() if r["id"] == "synthetic-support-rag")
        probs = [n for n, rx in taxonomy.PROBLEMS_RE
                 if rx.search(analyzer.vacancy_text(row))]
        self.assertTrue(any("поддержка" in p.lower() for p in probs), f"получили {probs}")

    def test_reporting_problem(self):
        row = next(r for r in sample_data.as_rows() if r["id"] == "synthetic-reporting")
        probs = [n for n, rx in taxonomy.PROBLEMS_RE
                 if rx.search(analyzer.vacancy_text(row))]
        self.assertTrue(any("Отчётность" in p for p in probs), f"получили {probs}")


class TestAnalyzeAggregation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = analyzer.analyze(sample_data.as_rows())

    def test_counts_all_records(self):
        self.assertEqual(self.res["count"], len(sample_data.RECORDS))
        self.assertGreater(self.res["count"], 20)

    def test_salary_sample_nonempty(self):
        self.assertGreater(self.res["with_salary"], 5)
        self.assertIsNotNone(self.res["salary_median"])
        self.assertGreater(self.res["salary_median"], 50000)

    def test_n8n_is_top_skill(self):
        skills = dict(self.res["skills"])
        self.assertIn("n8n", skills)
        # n8n — самая частая технология ниши в этой выборке
        self.assertGreaterEqual(skills["n8n"], 6)

    def test_every_row_got_archetype(self):
        for row in self.res["rows"]:
            self.assertTrue(row["_archetypes"], f"нет архетипа у {row.get('name')}")

    def test_flags_detected(self):
        flags = dict(self.res["flags"])
        self.assertIn("просят портфолио / реальные кейсы", flags)
        self.assertIn("поддержка после запуска (рекуррентный доход)", flags)

    def test_report_renders_all_sections(self):
        report = analyzer.render_report(self.res, title="Тестовый срез")
        for heading in ["## 1. Кого ищут", "## 2. Что именно автоматизируют",
                        "## 3. Стек", "## 4. Что учить", "## 5. Формат работы",
                        "## 6. Все вакансии"]:
            self.assertIn(heading, report)
        self.assertIn("n8n", report)


class TestClipParsing(unittest.TestCase):
    BLOB = """Заголовок: Интегратор / специалист по автоматизации
Работодатель: ООО Тест
Город: Москва
Опыт: 1–3 года
Занятость: частичная занятость
Зарплата: от 40000 до 120000
Ссылка: https://hh.ru/vacancy/137471009
Текст: Настраивать n8n, Make, Zapier. Создавать Telegram-ботов. Понимание webhook.
=====
Заголовок: AI-инженер RAG
Работодатель: Банк
Зарплата: не указана
Текст: RAG-пайплайны на LangChain, векторные базы данных, оценка качества ответов.
"""

    def test_parses_two_records(self):
        rows = fetch.parse_clip_text(self.BLOB)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["name"], "Интегратор / специалист по автоматизации")
        self.assertEqual(rows[0]["id"], "137471009")
        self.assertEqual((rows[0]["salary_from"], rows[0]["salary_to"]), (40000, 120000))
        self.assertEqual(rows[1]["salary_from"], None)
        self.assertIn("RAG-пайплайны", rows[1]["description"])

    def test_analyzed_end_to_end(self):
        res = analyzer.analyze(fetch.parse_clip_text(self.BLOB))
        self.assertEqual(res["count"], 2)
        self.assertIn("n8n", dict(res["skills"]))
        self.assertIn("RAG", dict(res["skills"]))


class TestHtmlParsing(unittest.TestCase):
    HTML = """<html><body>
    <script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"vacancies":[
      {"vacancyId":"111","title":"Специалист по автоматизации n8n",
       "employer":{"name":"Ромашка"},
       "salary":{"from":50000,"to":150000,"currency":"RUR"},
       "experience":"1–3 года","employment":"проект",
       "snippet":"<p>Опыт с n8n, webhook, Telegram-боты</p>",
       "url":"https://hh.ru/vacancy/111"}
    ]}}}
    </script></body></html>"""

    def test_parses_next_data(self):
        rows = fetch.parse_search_html(self.HTML)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], "111")
        self.assertEqual(rows[0]["salary_from"], 50000)
        self.assertNotIn("<p>", rows[0]["description"])
        self.assertIn("n8n", rows[0]["description"])
        res = analyzer.analyze(rows)
        self.assertIn("n8n", dict(res["skills"]))

    def test_missing_next_data_raises_helpful_error(self):
        with self.assertRaises(fetch.HHAccessError) as ctx:
            fetch.parse_search_html("<html><body>капча</body></html>")
        self.assertIn("__NEXT_DATA__", str(ctx.exception))


class TestApiErrorSurface(unittest.TestCase):
    def test_403_message_explains_what_to_do(self):
        err = fetch.HHAccessError("403 Forbidden от api.hh.ru")
        self.assertIn("403", str(err))

    def test_user_agent_is_ascii_encodable(self):
        """HTTP-заголовки кодируются в latin-1: кириллица в User-Agent роняет запрос."""
        fetch.USER_AGENT.encode("latin-1")  # не должно бросать
        self.assertTrue(fetch.USER_AGENT.isascii())

    def test_network_failure_raises_hhaccesserror(self):
        """Недоступный хост -> HHAccessError, а не сырой traceback."""
        with self.assertRaises(fetch.HHAccessError):
            fetch._request("https://api.hh.invalid/vacancies", timeout=1)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestRegressions(unittest.TestCase):
    """Регрессии на баги, найденные при первом прогоне отчёта."""

    def test_eur_salary_converted_to_rub(self):
        """Вилка в евро не должна попадать в рублёвую медиану как 1500 ₽."""
        row = {"salary_from": None, "salary_to": 1500, "currency": "EUR"}
        mid = analyzer.salary_mid(row)
        self.assertGreater(mid, 100000, f"ожидали пересчёт в рубли, получили {mid}")
        res = analyzer.analyze([
            row,
            {"name": "x", "salary_from": 100000, "salary_to": 200000, "currency": "RUR"},
        ])
        self.assertGreater(res["salary_median"], 50000)

    def test_title_wins_over_description_for_archetype(self):
        """«AI-инженер» с n8n в тексте — это AI-инженер, а не no-code интегратор."""
        row = {"name": "AI-инженер", "description": "знание n8n, Make, Zapier будет плюсом"}
        arch = analyzer.detect_archetypes(row)
        self.assertTrue(any(a.startswith("C.") for a in arch), f"получили {arch}")
        self.assertFalse(any(a.startswith("A.") for a in arch), f"получили {arch}")

    def test_nocode_title_still_detected(self):
        row = {"name": "Интегратор / специалист по автоматизации / no-code",
               "description": "n8n, Make, Zapier"}
        arch = analyzer.detect_archetypes(row)
        self.assertTrue(any(a.startswith("A.") for a in arch), f"получили {arch}")

    def test_forward_deployed_detected(self):
        row = {"name": "Forward-Deployed AI Product Engineer", "description": ""}
        arch = analyzer.detect_archetypes(row)
        self.assertTrue(any(a.startswith("D.") for a in arch), f"получили {arch}")

    def test_no_false_positive_on_payment(self):
        """«Оплата обсуждается» и «проектная оплата» — не про приём платежей."""
        for text in ["Оплата обсуждается индивидуально",
                     "Проектная оплата — обсудим ваши расценки",
                     "Зарплата и оплата труда два раза в месяц"]:
            pat = next(p for n, p in taxonomy.PROBLEMS_RE
                       if n == "Приём оплат / биллинг / тарифы")
            self.assertFalse(pat.search(text), f"ложное срабатывание на: {text}")

    def test_real_payment_still_detected(self):
        pat = next(p for n, p in taxonomy.PROBLEMS_RE
                   if n == "Приём оплат / биллинг / тарифы")
        self.assertTrue(pat.search("Интеграция YooKassa для приёма платежей"))
        self.assertTrue(pat.search("подключить эквайринг к сайту"))

    def test_format_detected_from_employment_field(self):
        row = {"name": "Специалист", "description": "задачи",
               "employment": "проект или разовое задание, удалённо",
               "experience": "1–3 года"}
        res = analyzer.analyze([row])
        fmts = dict(res["formats"])
        self.assertIn("удалённо", fmts)
        self.assertIn("проект / разовое задание", fmts)

    def test_messenger_max_not_fired_on_english(self):
        pat = next(p for n, p in taxonomy.SKILLS_RE if n == "MAX (мессенджер)")
        self.assertFalse(pat.search("set max retries to 10 and max length"))
        self.assertTrue(pat.search("Автопостинг в MAX и Telegram"))
