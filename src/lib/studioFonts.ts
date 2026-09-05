// Inject a Google Fonts <link> for the fonts a studio theme uses, so the diner
// renders the exact typeface (e.g. Open Sans) instead of a system fallback.
const GOOGLE = /^(Open Sans|Playfair Display|Lora|Montserrat|Poppins|Merriweather|Oswald|Raleway|Roboto|Lato|Cormorant Garamond|EB Garamond|Inter|Nunito|Work Sans|Source Sans 3|PT Serif|Libre Baskerville|Bebas Neue|Cardo|DM Sans|DM Serif Display|Josefin Sans|Manrope|Rubik|Karla)$/i

export function injectStudioFonts(fonts: any) {
  try {
    if (!fonts || typeof document === 'undefined') return
    const values: string[] = []
    for (const key in fonts) {
      const v = fonts[key]
      if (typeof v === 'string') values.push(v)
    }
    const fams = Array.from(new Set(values
      .map((f: string) => (f.split(',')[0] || '').replace(/["']/g, '').trim())
      .filter(Boolean)))
    const google = fams.filter((f) => GOOGLE.test(f as string))
    if (!google.length) return
    const id = 'studio-fonts'
    const href = 'https://fonts.googleapis.com/css2?' +
      google.map((f) => 'family=' + (f as string).replace(/ /g, '+') + ':ital,wght@0,400;0,600;0,700;1,400').join('&') +
      '&display=swap'
    let link = document.getElementById(id) as HTMLLinkElement | null
    if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link) }
    if (link.href !== href) link.href = href
  } catch { /* noop */ }
}
