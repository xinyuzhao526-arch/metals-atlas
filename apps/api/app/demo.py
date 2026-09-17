from io import BytesIO

from openpyxl import load_workbook

from app.excel import build_template


def build_demo_workbook() -> bytes:
    """Build a clearly marked fixture workbook. Values are synthetic, not mining facts."""
    workbook = load_workbook(BytesIO(build_template(["CHL", "USA"])))
    workbook["sources"].append([None, None, "DEMO-BHP-FY", "BHP", "Phase 1A Demo Fixture — Escondida", "https://example.invalid/demo/escondida", "2026-09-01", "demo_fixture", "2026-09-16", True, "Synthetic values; awaiting human verification against an official report."])
    workbook["sources"].append([None, None, "DEMO-FCX-CY", "Freeport-McMoRan", "Phase 1A Demo Fixture — Morenci", "https://example.invalid/demo/morenci", "2026-09-01", "demo_fixture", "2026-09-16", True, "Synthetic values; awaiting human verification against an official report."])
    workbook["companies"].append([None, None, "BHP", "BHP Group Limited", "CHL", "https://www.bhp.com/", 7])
    workbook["companies"].append([None, None, "Freeport-McMoRan", "Freeport-McMoRan Inc.", "USA", "https://www.fcx.com/", 1])
    workbook["projects"].append([None, None, "escondida", "Escondida", "CHL", "BHP", -24.268, -69.071, "operating", "primary"])
    workbook["projects"].append([None, None, "morenci", "Morenci", "USA", "Freeport-McMoRan", 33.083, -109.365, "operating", "primary"])
    workbook["ownership"].append([None, None, "escondida", "BHP", 57.5, "2025-07-01", None])
    workbook["ownership"].append([None, None, "morenci", "Freeport-McMoRan", 72, "2025-01-01", None])
    workbook["production"].append([None, None, "escondida", "Cu", "DEMO-BHP-FY", "escondida-fy2026-production", 123.456, "kt", 123.456, "kt", None, "2025-07-01", "2026-06-30", "2026-06-30", "fiscal_year", "FY2026", 7, "annual", "project_100", "mine_contained_metal", "2026-09-01", "fixture:production:1", "2026-09-16", True, False, "DEMO / 非真实生产数值"])
    workbook["production"].append([None, None, "morenci", "Cu", "DEMO-FCX-CY", "morenci-2025-production", 78.9, "kt", 78.9, "kt", None, "2025-01-01", "2025-12-31", "2025-12-31", "calendar_year", None, None, "annual", "equity", "mine_contained_metal", "2026-09-01", "fixture:production:2", "2026-09-16", True, False, "DEMO / 非真实生产数值"])
    workbook["guidance"].append([None, None, "escondida", "Cu", "DEMO-BHP-FY", "escondida-fy2026-guidance", 120, 140, "kt", "kt", None, "2025-07-01", "2026-06-30", "2025-07-01", "fiscal_year", "FY2026", 7, "annual", "project_100", "mine_contained_metal", "2026-09-01", "fixture:guidance:1", "2026-09-16", "initial", None, None, "DEMO / 非真实指引"])
    workbook["guidance"].append([None, None, "morenci", "Cu", "DEMO-FCX-CY", "morenci-2025-guidance", None, None, "kt", "kt", "not_disclosed", "2025-01-01", "2025-12-31", "2025-01-01", "calendar_year", None, None, "annual", "equity", "mine_contained_metal", "2026-09-01", "fixture:guidance:2", "2026-09-16", "initial", None, None, "DEMO / 待补字段"])
    workbook["reserves"].append([None, None, "escondida", "Cu", "DEMO-BHP-FY", "escondida-fy2026-reserve", None, "kt", "kt", "awaiting_verification", "2026-06-30", "2026-06-30", "2026-06-30", "fiscal_year", "FY2026", 7, "annual", "project_100", "mine_contained_metal", "2026-09-01", "fixture:reserves:1", "2026-09-16", "reserve", "proved_and_probable", None, None, "DEMO / 等待人工核验"])
    workbook["reserves"].append([None, None, "morenci", "Cu", "DEMO-FCX-CY", "morenci-2025-reserve", None, "kt", "kt", "awaiting_verification", "2025-12-31", "2025-12-31", "2025-12-31", "calendar_year", None, None, "annual", "project_100", "mine_contained_metal", "2026-09-01", "fixture:reserves:2", "2026-09-16", "reserve", "proved_and_probable", None, None, "DEMO / 等待人工核验"])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
