import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read_json(relative_path):
    with (ROOT / relative_path).open(encoding="utf-8") as data_file:
        return json.load(data_file)


class DataContractTests(unittest.TestCase):
    def test_required_data_files_exist(self):
        self.assertTrue((ROOT / "data/crm-leads.json").exists())
        self.assertTrue((ROOT / "data/yunxi-products.json").exists())
