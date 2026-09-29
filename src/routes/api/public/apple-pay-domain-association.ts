import { createFileRoute } from '@tanstack/react-router'

// Serves the Apple Pay domain-verification file Paystack requires when a
// domain is registered for Apple Pay. The file contents come from Paystack's
// dashboard (Settings → Apple Pay → add domain) and are stored in the
// APPLE_PAY_DOMAIN_ASSOCIATION secret. Returns 404 until the secret is set.
export const Route = createFileRoute('/api/public/apple-pay-domain-association')({
  server: {
    handlers: {
      GET: async () => {
        const body = process.env['APPLE_PAY_DOMAIN_ASSOCIATION']
        if (!body) return new Response('Not configured', { status: 404 })
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
