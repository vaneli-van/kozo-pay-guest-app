import { Center, Action } from '../ui/primitives'

export function InvalidSession({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const expired = reason === 'expired'
  return (
    <Center
      eyebrow={expired ? 'LINK EXPIRED' : 'TABLE NOT FOUND'}
      title={expired ? 'Time for a<br /><em>fresh code.</em>' : "We can't find<br /><em>your table.</em>"}
      copy={expired
        ? 'This table code has expired. Please rescan the QR on your table, or ask a Kozo team member to help.'
        : "This code isn't active right now. Please rescan the QR on your table, or ask a Kozo team member for help."}
    >
      <Action onClick={onRetry}>Try again</Action>
    </Center>
  )
}
