from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.demo import build_demo_workbook  # noqa: E402


target = ROOT / "fixtures" / "demo" / "phase1a-demo.xlsx"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(build_demo_workbook())
print(target)

