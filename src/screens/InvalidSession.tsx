import { Center, Action } from '../ui/primitives'

export function InvalidSession({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const expired = reason === 'expired'
  // 'network' / 'error' = Klown could not be reached or failed (no signal, a server error page),
  // not a bad QR code.
  // Telling a diner with weak signal that their table does not exist sends them to the waiter
  // for nothing.
  if (reason === 'network' || reason === 'error') {
    return (
      <Center
        eyebrow="CONNECTION PROBLEM"
        title={"We couldn&rsquo;t<br /><em>reach Klown.</em>"}
        copy="Check your signal or Wi-Fi, then try again. Your table and bill are safe."
      >
        <Action onClick={onRetry}>Try again</Action>
      </Center>
    )
  }
  return (
    <Center
      eyebrow={expired ? 'LINK EXPIRED' : 'TABLE NOT FOUND'}
      title={expired ? 'Time for a<br /><em>fresh code.</em>' : "We can't find<br /><em>your table.</em>"}
      copy={expired
        ? 'This table code has expired. Please rescan the QR on your table, or ask a team member to help.'
        : "This code isn't active right now. Please rescan the QR on your table, or ask a team member for help."}
    >
      <Action onClick={onRetry}>Try again</Action>
    </Center>
  )
}
