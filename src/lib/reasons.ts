// Plain-language copy for the reasons the payment API returns (quote, payment-init). Mirrors
// PAYMENT_REASON_MESSAGE on the server; kept here so the review screen can explain a quote it
// could not get without a round trip through payment-init.
export const REASON_COPY: Record<string, string> = {
  nothing_due: 'This bill has already been paid in full.',
  invalid_share: 'That share is no longer available. Go back to the bill and pick again.',
  share_paid: 'This share has already been paid.',
  share_being_paid: 'Someone else is paying this share right now. Pick another share, or try again in a few minutes.',
  payment_in_progress: 'Someone at your table is paying right now. If their payment was cancelled, try again in a few minutes.',
  overpay: 'That is more than what is left on the bill.',
  no_bill: 'There is no open bill for this table.',
  choose_tab: 'There is more than one bill at this table. Pick yours first.',
  zero_value: 'There is nothing to pay on this bill.',
  amount_changed: 'Your bill changed since you checked it. Please look at the new total before you pay.',
}

// Reasons that mean the payment was never started (nothing was sent to the diner's phone or
// card), as opposed to a decline or a timeout from the payment provider.
export const NOT_STARTED_REASONS = new Set(Object.keys(REASON_COPY))
