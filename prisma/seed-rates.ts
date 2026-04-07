/**
 * One-time seed script: imports clean_rates.csv into the DB
 * for Chiniot General Hospital / Pak Qatar Family Takaful.
 *
 * Run:  npx tsx prisma/seed-rates.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Category mapping by code prefix ──────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  "01-01": "Service Charges",        // OPD consultancy
  "01-02": "Ward Charges",
  "02-01": "Radiology - Ultrasound",
  "03-01": "Radiology - X-Ray",
  "04-01": "Radiology - CT Scan",
  "05-01": "Service Charges",        // ETT
  "06-01": "Service Charges",        // Physiotherapy
  "07-01": "Service Charges",        // Gynae surgery
  "07-02": "Service Charges",        // ENT surgery
  "07-03": "Service Charges",        // Ortho surgery
  "07-04": "Service Charges",        // General surgery
  "07-05": "Service Charges",        // Neuro surgery
  "07-06": "Service Charges",        // Consultant visits
  "07-07": "Service Charges",        // Nursing & pharmacy
  "07-08": "Service Charges",        // ICU / NICU / PICU
  "07-12": "Service Charges",        // Medical consumables
  "09-01": "Radiology - Doppler",
  "10-01": "Service Charges",        // Dental
  "11-01": "Service Charges",        // Plaster / ortho support
  "12-01": "Service Charges",        // Dermatology
  "13-01": "Service Charges",        // Misc procedures
  "15-01": "Service Charges",        // Audiology
  "210":   "Service Charges",        // Dialysis (exact code)
  "G0":    "Laboratory",
  "T0":    "Laboratory",
};

function getCategory(code: string): string {
  // Exact match first (e.g. "210")
  if (CATEGORY_MAP[code]) return CATEGORY_MAP[code];
  // Alpha prefix (G0, T0)
  if (/^[A-Za-z]/.test(code)) {
    const prefix = code.substring(0, 2);
    return CATEGORY_MAP[prefix] ?? "Service Charges";
  }
  // Numeric prefix: first two dash-separated segments
  const prefix = code.split("-").slice(0, 2).join("-");
  return CATEGORY_MAP[prefix] ?? "Service Charges";
}

// ── Minimal CSV parser (handles quoted fields) ──────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { fields.push(cur); cur = ""; continue; }
      cur += ch;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

/**
 * Pre-pass: for any (code, description) pair that appears more than once,
 * mark the row index with the HIGHEST revisedRate as "Direct/ER Charges".
 * Returns a Set of row indices (0-based, excluding header) that should use
 * "Direct/ER Charges" instead of their normal category.
 */
function buildEROverrideSet(dataRows: string[][]): Set<number> {
  // group row indices by normalised key
  const groups = new Map<string, { idx: number; revised: number }[]>();
  dataRows.forEach(([code, description, , revisedRateStr], idx) => {
    if (!code?.trim() || !description?.trim()) return;
    const key = `${code.trim().toLowerCase()}|${description.trim().toLowerCase()}`;
    const revised = parseFloat(revisedRateStr ?? "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ idx, revised: isNaN(revised) ? -Infinity : revised });
  });

  const erIndices = new Set<number>();
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    // sort descending by revised rate; highest → ER
    entries.sort((a, b) => b.revised - a.revised);
    erIndices.add(entries[0].idx);
  }
  return erIndices;
}

async function main() {
  const ORG_NAME    = "Pak Qatar Family Takaful";
  const HOSPITAL    = "Chiniot General Hospital";
  const PARTY       = "Pak Qatar Family Takaful";
  const CSV_PATH    = path.join(__dirname, "..", "clean_rates.csv");

  // ── Find org ──────────────────────────────────────────────────
  const org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) {
    console.error(`❌  Organization "${ORG_NAME}" not found. Create it via the Super Admin UI first.`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`✓  Org: ${org.name} (${org.id})`);

  // ── Find a user in this org to use as createdById ─────────────
  const adminUser = await prisma.user.findFirst({
    where: { orgId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) {
    console.error(`❌  No active users found in org "${ORG_NAME}". Create an admin user first.`);
    process.exit(1);
  }
  console.log(`✓  Acting as: ${adminUser.email}`);

  // ── Upsert Hospital ───────────────────────────────────────────
  const hospital = await prisma.hospital.upsert({
    where: { orgId_name: { orgId, name: HOSPITAL } },
    create: { orgId, name: HOSPITAL },
    update: {},
  });
  console.log(`✓  Hospital: ${hospital.name}`);

  // ── Upsert Party ──────────────────────────────────────────────
  const party = await prisma.party.upsert({
    where: { orgId_name: { orgId, name: PARTY } },
    create: { orgId, name: PARTY },
    update: {},
  });
  console.log(`✓  Party: ${party.name}`);

  // ── Read & parse CSV ─────────────────────────────────────────
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const [, ...dataRows] = parseCSV(raw); // skip header
  console.log(`✓  Rows to process: ${dataRows.length}`);

  // ── Pre-pass: find highest-rate duplicates → Direct/ER Charges ──
  const erOverrides = buildEROverrideSet(dataRows);
  console.log(`✓  Direct/ER Charges overrides (highest-rate duplicates): ${erOverrides.size}`);

  // ── Category cache ────────────────────────────────────────────
  const categoryCache = new Map<string, string>(); // name → id

  async function getOrCreateCategory(name: string): Promise<string> {
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const cat = await prisma.category.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name },
      update: {},
    });
    categoryCache.set(name, cat.id);
    return cat.id;
  }

  // ── Process rows ──────────────────────────────────────────────
  let inserted = 0;
  let skipped  = 0;
  const effectiveStart = new Date();

  for (let i = 0; i < dataRows.length; i++) {
    const [code, description, oldRateStr, revisedRateStr] = dataRows[i];
    if (!code?.trim() || !description?.trim()) { skipped++; continue; }

    const revisedRate = parseFloat(revisedRateStr ?? "");
    const oldRate     = parseFloat(oldRateStr ?? "");

    // Skip rows with no usable rate
    if (isNaN(revisedRate) && isNaN(oldRate)) { skipped++; continue; }

    const rate     = isNaN(oldRate)     ? revisedRate : oldRate;
    const revised  = isNaN(revisedRate) ? null        : revisedRate;

    // Highest-rate duplicate → Direct/ER Charges; otherwise normal mapping
    const categoryName = erOverrides.has(i) ? "Direct/ER Charges" : getCategory(code.trim());
    const categoryId   = await getOrCreateCategory(categoryName);

    // Upsert Service
    const service = await prisma.service.upsert({
      where: { code_categoryId: { code: code.trim(), categoryId } },
      create: { code: code.trim(), description: description.trim(), categoryId },
      update: { description: description.trim() },
    });

    // Upsert RateCard — match on hospital+party+service+effectiveStart date
    // Since db.push may not have created the composite unique on RateCard,
    // we use findFirst + create/update pattern.
    const existing = await prisma.rateCard.findFirst({
      where: { hospitalId: hospital.id, partyId: party.id, serviceId: service.id },
    });

    if (existing) {
      await prisma.rateCard.update({
        where: { id: existing.id },
        data: { rate, revisedRate: revised },
      });
    } else {
      await prisma.rateCard.create({
        data: {
          hospitalId:          hospital.id,
          partyId:             party.id,
          serviceId:           service.id,
          rate,
          revisedRate:         revised,
          effectiveStartDate:  effectiveStart,
          createdById:         adminUser.id,
        },
      });
    }

    inserted++;
    if (inserted % 100 === 0) process.stdout.write(`  … ${inserted} rows processed\n`);
  }

  console.log(`\n✅  Done. Inserted/updated: ${inserted} | Skipped: ${skipped}`);

  // ── Summary by category ───────────────────────────────────────
  console.log("\nCategory breakdown:");
  for (const [name, id] of categoryCache.entries()) {
    const count = await prisma.service.count({ where: { categoryId: id } });
    console.log(`  ${name}: ${count} services`);
  }
}

main()
  .catch((e) => { console.error("❌  Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
