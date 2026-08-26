import { createFileRoute } from '@tanstack/react-router'
import ResolvedDiningApp from '../ResolvedDiningApp'

export const Route = createFileRoute('/s/$token')({
  component: RouteComponent,
})

function RouteComponent() {
  const { token } = Route.useParams()
  return <ResolvedDiningApp token={token} />
}
