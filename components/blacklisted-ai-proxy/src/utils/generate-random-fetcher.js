/**
 * Lightweight generate-random.org fetcher.
 *
 * Stealth browser layer: ulixee Chrome (the secret-agent bundled Chrome).
 * Document reader: playwright (thin — goto + $$eval + close; no full
 * secret-agent plugin/replay stack unless needed).
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Config / secrets
// ---------------------------------------------------------------------------
// Do NOT hardcode long-lived secrets here. Read secrets (if any) from the
// project config/runtime env at call time. The values below are usage
// parameters, not secrets.
const BASE_URL = 'https://generate-random.org';
const ULIXEE_CHROME =
  process.env.ULIXEE_CHROME ||
  path.join(process.env.HOME || '', '.cache/ulixee/chrome/139.0.7258.154/chrome');
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/139.0.7258.154 Safari/537.36';

const LAUNCH_OPTS = {
  executablePath: ULIXEE_CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
};

// ---------------------------------------------------------------------------
// Extraction registry: slug -> how to read generated values from the page.
// All of these read the rendered <code> blocks on the page (the lightweight
// document path). If a slug needs interactive "generate" clicking, add a
// per-slug waitForSelector/click step here.
// ---------------------------------------------------------------------------
const EXTRACTORS = {
  // Generic: collect every <code>...</code> text on the page.
  // Good for: credit-cards, api-keys, oauth-tokens, uuids, passwords, strings,
  // passphrases, hashes, jwt-tokens, bearer-tokens, csrf-tokens, session-secrets,
  // webhook-secrets, encryption-keys, ssh-keys, salts, bcrypt-hashes, ibans,
  // base64-string, binary, hexadecimal-numbers, pin-codes, mac-addresses,
  // ip-addresses, phone-numbers, email, names, usernames, persons, company-names,
  // address, zip-codes, coordinates, dates, timestamps, times, numbers, integer,
  // decimal, percentage, negative-number, odd-number, even-number, prime-number,
  // octal-numbers, fractions, lorem-ipsum, words, colors, hex-color, pastel-colors,
  // qr-codes, barcodes, and most "generated data" slugs.
  default: {
    read(page) {
      return page.$$eval('code', nodes => nodes.map(n => n.textContent.trim()).filter(Boolean));
    }
  },

  // For pages that render into <pre> blocks instead of (or in addition to) <code>.
  pre: {
    read(page) {
      return page.$$eval('pre', nodes =>
        nodes.map(n => n.textContent.trim()).filter(Boolean)
      );
    }
  }
};

// Slugs whose generated values are inside a <pre> block rather than <code>.
const PRE_SLUG = new Set([
  // Add any slug observed to render primarily into <pre> here.
]);

// Slugs that need an explicit "generate" click before values appear.
const CLICK_SLUG = new Set([]); // e.g. new Set(['some-slug'])

// Slugs that render multiple separate generated items with their own labels.
// For those, return { label, value } pairs by reading a more specific selector.
const LABELLED_SLUG = new Set([]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch one generated dataset from generate-random.org/<slug>.
 *
 * @param {string} slug - path segment, e.g. 'credit-cards', 'api-keys',
 *   'oauth-tokens', 'uuids', 'passwords'.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=25000]
 * @param {number} [opts.waitAfterGotoMs=2500]
 * @param {string} [opts.outDir] - optional path to persist results as JSON.
 * @returns {Promise<object>} { slug, title, values, ok, error? }
 */
async function fetchGenerator(slug, opts = {}) {
  const timeoutMs = opts.timeoutMs || 25000;
  const waitAfterGotoMs = opts.waitAfterGotoMs || 2500;
  const browser = await require('playwright').chromium.launch(LAUNCH_OPTS);
  let page;
  let result;

  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    const url = `${BASE_URL}/${slug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Some pages need a moment for JS to render the generated values.
    await page.waitForTimeout(waitAfterGotoMs);

    if (CLICK_SLUG.has(slug)) {
      // TODO: add a generic clickable-generator step when needed.
      // Example shape:
      // await page.click('button:has-text("Generate")');
      // await page.waitForTimeout(1500);
    }

    const extractor = EXTRACTORS[PRE_SLUG.has(slug) ? 'pre' : 'default'];
    const values = await extractor.read(page);
    const title = await page.title();

    result = { slug, title, values, ok: true };

    if (opts.outDir) {
      const fs = require('fs');
      const outPath = path.join(opts.outDir, `${slug}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    }
  } catch (err) {
    result = {
      slug,
      ok: false,
      error: err.message ? err.message.split('\n')[0] : String(err)
    };
  } finally {
    try { await browser.close(); } catch {}
  }

  return result;
}

/**
 * Fetch several slugs in sequence (lightweight; no concurrency unless needed).
 */
async function fetchGenerators(slugs, opts = {}) {
  const out = [];
  for (const slug of slugs) {
    out.push(await fetchGenerator(slug, opts));
  }
  return out;
}

module.exports = { fetchGenerator, fetchGenerators, EXTRACTORS, BASE_URL };
