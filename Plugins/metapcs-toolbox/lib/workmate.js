/*
 * Shopify WorkMate service-order URL builder.
 *
 * Worth knowing: the "23" that shows up in every work order URL is not part
 * of the order number. `%23` is just the URL encoding of `#`, so
 *
 *     SO-#1145   ->   SO-%231145
 *     SO-#29     ->   SO-%2329
 *
 * That means the only variable part is the digits, and any SO number works.
 */

const DEFAULT_STORE = 'meta-pcs';

/**
 * Accepts anything an agent is likely to have on their clipboard:
 *   1145 | #1145 | SO-1145 | SO-#1145 | so #1145
 *   https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders/SO-%231145
 * Returns the bare number as a string, or null.
 */
export function parseSO(input) {
  // Decode %23 first, otherwise "SO-%231145" reads as the number 231145.
  const text = String(input || '').replace(/%23/gi, '#').trim();
  if (!text) return null;

  // Prefer the digits directly after the last '#'.
  const hashed = text.match(/#\s*(\d{1,9})/g);
  if (hashed && hashed.length) {
    const last = hashed[hashed.length - 1].match(/(\d{1,9})/);
    if (last) return stripLeadingZeros(last[1]);
  }

  // Otherwise take the last run of digits ("SO-1145", "1145").
  const runs = text.match(/\d{1,9}/g);
  if (runs && runs.length) return stripLeadingZeros(runs[runs.length - 1]);

  return null;
}

function stripLeadingZeros(digits) {
  return digits.replace(/^0+(?=\d)/, '');
}

export function soLabel(number) {
  return `SO-#${number}`;
}

export function soUrl(number, store = DEFAULT_STORE) {
  const slug = String(store || DEFAULT_STORE).trim() || DEFAULT_STORE;
  return `https://admin.shopify.com/store/${encodeURIComponent(slug)}/apps/work-mate/work-orders/SO-%23${encodeURIComponent(number)}`;
}

export { DEFAULT_STORE };
