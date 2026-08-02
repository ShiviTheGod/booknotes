/**
 * Where the "leave a tip" button goes.
 *
 * The one thing to fill in — a PayPal.Me link, https://paypal.me/<handle>. Nothing
 * here is PayPal-specific beyond the wording: all this does is open a link, so any
 * donation page would work if it ever changes.
 *
 * Left empty, the whole section disappears rather than showing a button that goes
 * nowhere. That is also the switch for turning it off again later: clear this and
 * nothing about it remains on screen.
 *
 * Deliberately no amount on the end. PayPal.Me accepts one — /handle/5 opens with
 * five already filled in — and naming a figure turns an offer into a price.
 */
export const SUPPORT_URL = 'https://paypal.me/martinsivel'

/**
 * What the button says.
 *
 * Names the destination rather than just the act. Being sent to a payment page you
 * were not told about is a small betrayal, even when the page is harmless.
 */
export const SUPPORT_LABEL = 'Leave a tip via PayPal'

export function supportEnabled(): boolean {
  return SUPPORT_URL.trim().length > 0
}
