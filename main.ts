import { processRat } from "./rat-processor.ts";
import { scrapeJooonUrls } from "./jooon-scraper.ts";

async function downloadCFR() {
  try {
    await Deno.stat("/tmp/cfr.jar");
    console.log("CFR already downloaded");
  } catch {
    console.log("Downloading CFR decompiler...");
    const response = await fetch(
      "https://github.com/leibnitz27/cfr/releases/latest/download/cfr-0.152.jar",
    );
    if (!response.ok)
      throw new Error(`Failed to download CFR: ${response.status}`);
    const cfrBuffer = await response.arrayBuffer();
    await Deno.writeFile("/tmp/cfr.jar", new Uint8Array(cfrBuffer));
    console.log("CFR downloaded successfully");
  }
}

async function processUrl(url: string): Promise<void> {
  console.log(`\n=== Processing ${url} ===`);

  const result = await processRat(url);

  const { found, alreadyInactive, newlyNuked, errors } = result.webhooks;
  const breakdown = [
    `${found.length} found`,
    `${newlyNuked.length} ✅ nuked`,
    `${alreadyInactive.length} ⚠️ inactive`,
    `${errors.length} ❌ errors`,
  ].filter((x) => !x.startsWith("0"));
  console.log(`\nResults for ${url}: ${breakdown.join(", ")}`);

  // Print each webhook only once with its most specific status
  const printed = new Set();
  [
    ...newlyNuked.map((w) => ({ webhook: w, status: "✅" })),
    ...alreadyInactive.map((w) => ({ webhook: w, status: "⚠️" })),
    ...errors.map((w) => ({ webhook: w, status: "❌" })),
    ...found.map((w) => ({ webhook: w, status: "" })),
  ].forEach(({ webhook, status }) => {
    if (!printed.has(webhook)) {
      console.log(`  ${status} ${webhook}`);
      printed.add(webhook);
    }
  });
}

async function scanAndProcess(): Promise<void> {
  console.log("🔍 Starting jooon.xyz scan and rat processing...");

  await downloadCFR();

  const urls = await scrapeJooonUrls();

  if (urls.length === 0) {
    console.log("No mod URLs found on jooon.xyz");
    return;
  }

  console.log(`Found ${urls.length} URLs to process`);

  for (const url of urls) {
    await processUrl(url);
    // Small delay to be respectful
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function processSpecificUrl(url: string): Promise<void> {
  console.log(`🔍 Processing specific URL: ${url}`);

  await downloadCFR();
  await processUrl(url);
}

const args = Deno.args;

if (args.length === 0 || args[0] === "scan") {
  await scanAndProcess();
} else if (args[0] === "process" && args[1]) {
  await processSpecificUrl(args[1]);
} else {
  console.log("Usage:");
  console.log(
    "  deno task scan          - Scan jooon.xyz and process all found mods",
  );
  console.log("  deno task process <url> - Process a specific mod URL");
}
