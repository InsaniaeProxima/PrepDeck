#!/usr/bin/env node
/**
 * fetch-providers.ts — Fetches the current provider list from ExamTopics.
 *
 * Usage:
 *   npx tsx scripts/fetch-providers.ts
 *   npx tsx scripts/fetch-providers.ts > /tmp/providers.json
 *
 * The output is a JSON array of { label, value } objects.
 * Review the output and manually update lib/providers.ts as needed.
 *
 * Requires Node.js 18+ (built-in fetch). No extra dependencies.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function main() {
  const url = "https://www.examtopics.com/discussions/";

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      process.stderr.write(`ERROR: Fetch failed with status ${res.status}\n`);
      process.exit(1);
    }
    html = await res.text();
  } catch (err) {
    process.stderr.write(`ERROR: Network error: ${String(err)}\n`);
    process.exit(1);
  }

  // Extract provider slugs from href="/discussions/{slug}/" links
  const regex = /href="\/discussions\/([a-z0-9][a-z0-9-]*)\/"/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    seen.add(match[1]);
  }

  if (seen.size === 0) {
    process.stderr.write(
      "ERROR: No providers found. The page may have changed layout or returned a Cloudflare challenge.\n"
    );
    process.exit(1);
  }

  const providers = Array.from(seen)
    .sort()
    .map((slug) => ({ label: slugToLabel(slug), value: slug }));

  process.stdout.write(JSON.stringify(providers, null, 2) + "\n");
  process.stderr.write(`Found ${providers.length} providers.\n`);
}

main();
