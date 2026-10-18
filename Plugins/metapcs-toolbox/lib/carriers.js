/*
 * Carrier detection for a single combined UPS / FedEx tracking box.
 *
 * One input, no dropdown: the number's own format tells us who ships it.
 * When a format is genuinely shared between the two (some 20/22-digit
 * ranges), we return both and let the user pick.
 */

export const CARRIERS = {
  ups: {
    id: 'ups',
    name: 'UPS',
    color: '#8f6b29',
    url: (n) => `https://www.ups.com/track?loc=en_US&requester=ST&tracknum=${encodeURIComponent(n)}`,
  },
  fedex: {
    id: 'fedex',
    name: 'FedEx',
    color: '#6b4fbb',
    url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
};

/* Strip the spaces / dashes people paste in from emails. */
export function normalize(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const RULES = [
  // --- UPS ---
  { carriers: ['ups'], label: 'UPS 1Z', test: (n) => /^1Z[0-9A-Z]{16}$/.test(n) },
  { carriers: ['ups'], label: 'UPS freight', test: (n) => /^T\d{10}$/.test(n) },
  { carriers: ['ups'], label: 'UPS InfoNotice', test: (n) => /^\d{9}$/.test(n) },
  { carriers: ['ups'], label: 'UPS freight pro', test: (n) => /^\d{7}$/.test(n) },

  // --- FedEx ---
  { carriers: ['fedex'], label: 'FedEx Express', test: (n) => /^\d{12}$/.test(n) },
  { carriers: ['fedex'], label: 'FedEx Ground', test: (n) => /^\d{15}$/.test(n) },
  { carriers: ['fedex'], label: 'FedEx door tag', test: (n) => /^DT\d{12}$/.test(n) },
  { carriers: ['fedex'], label: 'FedEx Ground 96', test: (n) => /^96\d{20}$/.test(n) },
  { carriers: ['fedex'], label: 'FedEx SmartPost', test: (n) => /^92\d{20}$/.test(n) && !/^9261/.test(n) },

  // --- Shared / ambiguous formats ---
  { carriers: ['ups', 'fedex'], label: '20-digit', test: (n) => /^\d{20}$/.test(n) },
  { carriers: ['ups', 'fedex'], label: '22-digit', test: (n) => /^\d{22}$/.test(n) },
];

/**
 * Returns { number, carriers: ['ups'|'fedex'...], label, confident }.
 * Unrecognised formats fall back to offering both carriers.
 */
export function detect(input) {
  const number = normalize(input);
  if (!number) {
    return { number: '', carriers: [], label: '', confident: false, empty: true };
  }

  for (const rule of RULES) {
    if (rule.test(number)) {
      return {
        number,
        carriers: rule.carriers,
        label: rule.label,
        confident: rule.carriers.length === 1,
        empty: false,
      };
    }
  }

  return {
    number,
    carriers: ['ups', 'fedex'],
    label: 'Unrecognised format',
    confident: false,
    empty: false,
  };
}

export function trackingUrl(carrierId, number) {
  const carrier = CARRIERS[carrierId];
  return carrier ? carrier.url(normalize(number)) : '';
}
