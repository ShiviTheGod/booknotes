/**
 * Where the "leave a tip" button goes.
 *
 * The one thing to fill in. Any donation page works — Ko-fi, Buy Me a Coffee,
 * GitHub Sponsors, PayPal.me — because all this does is open a link.
 *
 * Left empty, the whole section disappears rather than showing a button that goes
 * nowhere. That is also the switch for turning it off again later: clear this and
 * nothing about it remains on screen.
 */
export const SUPPORT_URL = ''

/** What the button says. Keep it an offer, not an ask. */
export const SUPPORT_LABEL = 'Leave a tip'

export function supportEnabled(): boolean {
  return SUPPORT_URL.trim().length > 0
}
