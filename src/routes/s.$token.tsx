import { createFileRoute } from '@tanstack/react-router'
import ResolvedDiningApp from '../ResolvedDiningApp'

export const Route = createFileRoute('/s/$token')({
  head: () => ({ meta: [
    { title: 'Your table | Klown Pay' },
    { name: 'description', content: 'View your table bill, choose a split and pay securely with Klown Pay.' },
    { property: 'og:title', content: 'Your table | Klown Pay' },
    { property: 'og:description', content: 'View your table bill, choose a split and pay securely with Klown Pay.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: RouteComponent,
})

function RouteComponent() {
  const { token } = Route.useParams()
  return <ResolvedDiningApp token={token} />
}
