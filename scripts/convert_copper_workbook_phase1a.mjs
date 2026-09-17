import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const runtimeNodeModules = process.env.CODEX_SPREADSHEET_NODE_MODULES;
if (!runtimeNodeModules) {
  throw new Error("Set CODEX_SPREADSHEET_NODE_MODULES to the bundled runtime node_modules directory.");
}

const runtimeRequire = createRequire(pathToFileURL(path.join(runtimeNodeModules, "resolver.cjs")));
const artifactToolEntry = runtimeRequire.resolve("@oai/artifact-tool");
const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(artifactToolEntry).href);

const sourcePath = process.argv[2] ?? "D:/工作/资源整理/铜矿信息整理/铜矿.xlsx";
const templatePath = process.argv[3] ?? "fixtures/demo/phase1a-demo.xlsx";
const outputPath = process.argv[4] ?? "fixtures/excel/铜矿_phase1a_import.xlsx";

const countryIso3 = new Map([
  ["秘鲁", "PER"],
  ["智利", "CHL"],
  ["印度尼西亚", "IDN"],
  ["墨西哥", "MEX"],
  ["巴拿马", "PAN"],
  ["加拿大", "CAN"],
  ["中国", "CHN"],
  ["刚果（金）", "COD"],
  ["赞比亚", "ZMB"],
  ["博茨瓦纳", "BWA"],
  ["澳大利亚", "AUS"],
  ["蒙古", "MNG"],
  ["俄罗斯", "RUS"],
  ["巴西", "BRA"],
  ["塞尔维亚", "SRB"],
  ["厄瓜多尔", "ECU"],
]);

const excludedProjects = new Map([
  ["Kolwezi", "原表明确说明该名称是矿区/城市，不是可确认的单一铜矿项目"],
  ["Polar Division", "原表明确说明该名称是生产分部/矿区组合，不是可确认的单一铜矿项目"],
  ["Escondida", "当前 MetalsAtlas 数据库已存在同名稳定 slug；本次不生成更新行，避免以较少字段覆盖现有项目资料"],
]);

function projectSlug(name) {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function projectStatus(name) {
  if (name === "Cobre Panamá") return "suspended";
  if (name === "Mount Isa") return "closed";
  return "unknown";
}

const source = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sourceSheetNames = ["全球主要铜矿分布", "世界主要铜矿", "铜矿具体位置+产能"];
for (const sheetName of sourceSheetNames) {
  source.worksheets.getItem(sheetName);
}

const directoryRows = source.worksheets.getItem("世界主要铜矿").getUsedRange(true).values.slice(1);
const detailRows = source.worksheets.getItem("铜矿具体位置+产能").getUsedRange(true).values.slice(1);
if (directoryRows.length !== 47 || detailRows.length !== 47) {
  throw new Error(`Unexpected project row counts: directory=${directoryRows.length}, detail=${detailRows.length}`);
}

const directorySlugs = new Set(directoryRows.map((row) => projectSlug(String(row[2] ?? "").trim())));
const exclusions = [];
const projects = [];
for (const row of detailRows) {
  const originalCountry = String(row[0] ?? "").trim();
  const originalRegion = String(row[1] ?? "").trim();
  const originalName = String(row[2] ?? "").trim();
  if (!directorySlugs.has(projectSlug(originalName))) {
    throw new Error(`Project is missing from directory sheet: ${originalName}`);
  }
  if (excludedProjects.has(originalName)) {
    exclusions.push({ name: originalName, reason: excludedProjects.get(originalName) });
    continue;
  }
  const iso3 = countryIso3.get(originalCountry);
  if (!iso3) throw new Error(`Unmapped country: ${originalCountry}`);
  const slug = projectSlug(originalName);
  if (!slug) throw new Error(`Could not generate slug for: ${originalName}`);
  projects.push({
    recordId: null,
    rowVersion: null,
    slug,
    name: originalName,
    countryIso3: iso3,
    operatorCompany: null,
    latitude: null,
    longitude: null,
    status: projectStatus(originalName),
    rawMaterialRoute: null,
    originalCountry,
    originalRegion,
  });
}

const duplicateSlugs = projects
  .map((project) => project.slug)
  .filter((slug, index, all) => all.indexOf(slug) !== index);
if (duplicateSlugs.length) throw new Error(`Duplicate project slugs: ${duplicateSlugs.join(", ")}`);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const businessSheets = {
  projects: 10,
  companies: 7,
  ownership: 7,
  production: 26,
  guidance: 27,
  reserves: 28,
  sources: 11,
};
for (const [sheetName, columnCount] of Object.entries(businessSheets)) {
  workbook.worksheets.getItem(sheetName).getRangeByIndexes(1, 0, 499, columnCount).clear({ applyTo: "contents" });
}

const projectValues = projects.map((project) => [
  project.recordId,
  project.rowVersion,
  project.slug,
  project.name,
  project.countryIso3,
  project.operatorCompany,
  project.latitude,
  project.longitude,
  project.status,
  project.rawMaterialRoute,
]);
if (projectValues.length) {
  workbook.worksheets.getItem("projects").getRangeByIndexes(1, 0, projectValues.length, 10).values = projectValues;
}

workbook.recalculate();
const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({
  sourcePath,
  outputPath,
  sourceSheets: sourceSheetNames,
  directoryProjectRows: directoryRows.length,
  detailProjectRows: detailRows.length,
  convertedProjects: projects.length,
  exclusions,
  counts: {
    projects: projects.length,
    companies: 0,
    ownership: 0,
    production: 0,
    guidance: 0,
    reserves: 0,
    sources: 0,
  },
  unmappedContext: projects.map(({ slug, originalCountry, originalRegion }) => ({ slug, originalCountry, originalRegion })),
  formulaErrorScan: formulaErrors.ndjson,
}, null, 2));
