import json
from pathlib import Path
from collections import Counter
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]

EXPECTED_INDUSTRIES = {
    "健身运动": 8,
    "美容美发医美": 8,
    "汽车4S及服务": 8,
    "教育培训": 8,
    "家居地产": 6,
    "财税法务企业服务": 5,
    "口腔体检养老": 4,
    "电商物流同城配送": 3,
}
ALLOWED_STREETS = {
    "大王庄", "大直沽", "中山门", "富民路", "春华", "唐家口",
    "常州道", "上杭路", "东新", "鲁山道", "二号桥", "向阳楼",
}
ALLOWED_OPPORTUNITIES = {
    "企业宽带", "专线", "组网", "云计算", "网络安全", "工作手机",
    "物联网", "呼叫中心", "数字化应用",
}


def read_json(relative_path):
    with (ROOT / relative_path).open(encoding="utf-8") as data_file:
        return json.load(data_file)


class DataContractTests(unittest.TestCase):
    def test_required_data_files_exist(self):
        self.assertTrue((ROOT / "data/crm-leads.json").exists())
        self.assertTrue((ROOT / "data/yunxi-products.json").exists())

    def test_hedong_pool_has_exactly_50_leads_with_expected_industries(self):
        leads = read_json("data/crm-leads.json")
        self.assertEqual(len(leads), 50)
        self.assertEqual(Counter(lead["industry"] for lead in leads), EXPECTED_INDUSTRIES)

    def test_hedong_leads_are_safe_teaching_records(self):
        leads = read_json("data/crm-leads.json")
        self.assertEqual(len({lead["id"] for lead in leads}), len(leads))
        for lead in leads:
            with self.subTest(lead=lead["id"]):
                self.assertEqual(lead["city"], "天津市")
                self.assertEqual(lead["district"], "河东区")
                self.assertIn(lead["street"], ALLOWED_STREETS)
                self.assertIn("模拟", lead["company"])
                self.assertIn("模拟", lead["contact"])
                self.assertRegex(lead["phone"], r"^1\*\*-\*\*\*\*-\d{4}$")
                self.assertEqual(lead["source"], "教学模拟")
                self.assertEqual(lead["verifiedAt"], "2026-09-12")
                self.assertTrue(lead["signal"])
                self.assertTrue(lead["score"] >= 0)
                self.assertTrue(lead["opportunity"])
                self.assertTrue(
                    set(lead["opportunity"].split(" + ")).issubset(ALLOWED_OPPORTUNITIES)
                )
