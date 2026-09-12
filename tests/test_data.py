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
    def test_shipping_content_has_no_private_data_or_unrelated_products(self):
        shipping = [ROOT / 'index.html', ROOT / 'README.md']
        shipping += [path for folder in ('assets', 'data') for path in (ROOT / folder).rglob('*')
                     if path.suffix in {'.html', '.css', '.js', '.json'}]
        forbidden = [r'AI\s*数悉', r'aTrust', r'\b(?:DNS|VPN|proxy)\b',
                     r'远程(?:访问|接入|控制)', r'回写|回填|联动\s*CRM|CRM\s*联动|协同方案',
                     r'(?<!\d)1[3-9]\d{9}(?!\d)',
                     r'https?://(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)',
                     r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                     r'\b(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,})',
                     r'''(?:password|api[_-]?key|secret|access[_-]?token)\s*[:=]\s*["'][^"']+["']''']
        for path in shipping:
            for pattern in forbidden:
                with self.subTest(file=str(path.relative_to(ROOT)), pattern=pattern):
                    self.assertIsNone(re.search(pattern, path.read_text(encoding='utf-8'), re.I))

    def test_yunxi_has_exactly_five_named_products(self):
        self.assertTrue((ROOT / "data/yunxi-products.json").exists(), "云犀数据文件缺失")
        products = read_json("data/yunxi-products.json")
        self.assertEqual(len(products), 5)
        self.assertEqual({item['id']: item['name'] for item in products}, {
            'cloud-card': '云名片', 'call-control': '呼叫控制', 'ai-analytics': 'AI 数析',
            'ai-assistant': 'AI 助手', 'ai-sales': 'AI 助销',
        })
        for forbidden in ('AI 数悉', 'AI数悉'):
            self.assertNotIn(forbidden, json.dumps(products, ensure_ascii=False))

    def test_yunxi_materials_have_complete_teaching_fields_and_verified_sources(self):
        self.assertTrue((ROOT / "data/yunxi-products.json").exists(), "云犀数据文件缺失")
        verified_ids = {
            'jW7BFTQ1q1MDGvbHA1kWxx4oWwRCUnEH9', 'xwJ64QXrK1MwVXw2a4UHrxr6AG96diBdg',
            'NqzZzVds5rMSSFmjak1uxxDwRjHk5GcfE', 'mN4b1TgaJrMnYsVNp1qE1xJR5UqP66xF1',
            'Pmizux972xMDRGyCRACp1xJkMvnN7nhjs', 'AJDtCQpVMrMrBiZYtZWY1x3ELky3ZzALZ',
        }
        for product in read_json('data/yunxi-products.json'):
            with self.subTest(product=product['id']):
                for field in ('positioning', 'audience', 'before', 'during', 'after',
                              'limitations', 'teachingPoints', 'sourceRefs'):
                    self.assertTrue(product.get(field), field)
                for source in product['sourceRefs']:
                    self.assertIn(source['documentId'], verified_ids)
                    self.assertEqual(source['verifiedAt'], '2026-09-12')
                    self.assertEqual(source['platform'], '金山文档')
                    self.assertNotIn('url', source)

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
