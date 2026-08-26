# Klown Pay Ghana

Create a new project called "Klown Pay" — a guest-first, pay-at-table QR web app for restaurants in Ghana (demo restaurant: Kozo, Accra). Mobile-first web app.

CRITICAL — this project has a LOCKED visual design that I will supply as exact code. Do NOT invent or design any screens. Do NOT apply shadcn/ui styling, gradients, glassmorphism, rounded corners, or any decorative component-library look to the diner-facing UI. The design uses hand-written CSS with square corners (border-radius 0), system fonts (Arial for body, Georgia serif italic for accents), a warm-paper background (#f7f5f0), ink foreground (#181816), and a single Kozo-yellow accent (#f3c744).

Stack requirements:
- Vite + React + TypeScript + React Router (already your default — good). Do NOT use Next.js.
- Tailwind is fine as the build pipeline, but the diner UI is styled by a single global stylesheet I will provide (src/index.css), NOT by Tailwind utility classes or shadcn components.
- Supabase (Lovable Cloud) will be enabled later for the backend (Postgres, Edge Functions, Realtime) — do not add backend yet.

For THIS first step, scaffold minimally:
1. A clean Vite + React + React Router app with a single route "/" that renders a placeholder <div id="app">Klown Pay — porting in progress</div>.
2. An empty src/index.css imported once at the app entry (I will replace its contents with the locked design CSS next).
3. Remove any demo/marketing landing page, shadcn demo components, and default styling so nothing competes with the design I'm about to load.

Keep it minimal and do not design anything. I will send the exact screen code and CSS in the next messages.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kozo-pay-guest-app.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7ca98bfa-f218-47af-a75e-d3dcbb505ee8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
