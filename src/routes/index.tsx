import { createFileRoute } from "@tanstack/react-router";
import ResolvedDiningApp from "../ResolvedDiningApp";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'Klown Pay | Settle your table' },
    { name: 'description', content: 'View your restaurant bill, split it with your table and pay securely with Klown Pay.' },
    { property: 'og:title', content: 'Klown Pay | Settle your table' },
    { property: 'og:description', content: 'View your restaurant bill, split it with your table and pay securely with Klown Pay.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <ResolvedDiningApp token="demo" />,
});
