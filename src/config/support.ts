/**
 * Where the "leave a tip" buttons go.
 *
 * Nothing here is tied to a particular payment service: each entry is a link and a
 * label, so any donation page works. They render in the order listed.
 *
 * An empty list — or every url blanked — makes the whole section disappear rather
 * than showing buttons that go nowhere. That is also the switch for turning it off
 * again later: clear these and nothing about it remains on screen.
 *
 * Deliberately no amount on the end of either. Both services accept one in the URL,
 * and naming a figure turns an offer into a price.
 */
export type SupportLink = {
  url: string
  /**
   * Names the destination rather than just the act. Being sent to a payment page you
   * were not told about is a small betrayal, even when the page is harmless.
   */
  label: string
}

export const SUPPORT_LINKS: SupportLink[] = [
  // Ko-fi first: it takes a card or Apple Pay without the giver needing an account
  // anywhere, so it is the one that works for the most people.
  { url: 'https://ko-fi.com/martinsivel', label: 'Leave a tip on Ko-fi' },
  { url: 'https://paypal.me/martinsivel', label: 'Leave a tip via PayPal' },
]

/** The ones actually filled in, in display order. */
export function supportLinks(): SupportLink[] {
  return SUPPORT_LINKS.filter((link) => link.url.trim().length > 0)
}

export function supportEnabled(): boolean {
  return supportLinks().length > 0
}
