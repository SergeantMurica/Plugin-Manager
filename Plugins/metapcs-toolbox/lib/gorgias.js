/*
 * Gorgias ticket URL builder.
 *
 *   110227889  ->  https://metapcs.gorgias.com/app/ticket/110227889
 *
 * No encoding tricks here (unlike WorkMate's %23) — the ticket id is the URL's
 * last path segment, so the only job is pulling the number out of whatever the
 * agent pasted.
 */

const DEFAULT_SUBDOMAIN = 'metapcs';

/**
 * Accepts a bare number, a #-prefixed number, or a full ticket URL:
 *   110227889 | #110227889 | ticket 110227889
 *   https://metapcs.gorgias.com/app/ticket/110227889
 * Returns the id as a string, or null.
 */
export function parseTicket(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  // A real ticket URL is unambiguous — take the id straight from the path.
  const fromUrl = text.match(/\/ticket\/(\d+)/i);
  if (fromUrl) return fromUrl[1];

  const runs = text.match(/\d+/g);
  if (!runs || !runs.length) return null;

  // Longest run wins, so "ticket 110227889 from 2024" picks the id, not the
  // year. Ties go to the last one typed.
  return runs.reduce((best, run) => (run.length >= best.length ? run : best));
}

export function ticketLabel(id) {
  return `#${id}`;
}

export function ticketUrl(id, subdomain = DEFAULT_SUBDOMAIN) {
  const name = String(subdomain || DEFAULT_SUBDOMAIN).trim() || DEFAULT_SUBDOMAIN;
  return `https://${encodeURIComponent(name)}.gorgias.com/app/ticket/${encodeURIComponent(id)}`;
}

export { DEFAULT_SUBDOMAIN };
