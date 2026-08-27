export type Screen =
  | 'connect' | 'welcome' | 'empty' | 'menu' | 'category' | 'dish' | 'waiter' | 'waiter-notified' | 'waiting-bill' | 'bill-ready' | 'bill' | 'bill-issue' | 'full-check' | 'recommendation' | 'pay' | 'split' | 'split-share' | 'tip' | 'review' | 'method' | 'momo' | 'otp' | 'authorise' | 'processing' | 'payment-error' | 'success' | 'receipt-choice' | 'phone' | 'otp-rewards' | 'name' | 'rewards' | 'guest-receipt' | 'feedback' | 'review-handoff' | 'complete'

export type ShareMode = 'full' | 'even' | 'custom' | 'invite'

export type State = {
  screen: Screen
  hasOrder: boolean
  dish: string
  people: number
  tip: number
  paymentError: boolean
  waiter: boolean
  navigator: boolean
  tableLabel?: string
  // payment + post-payment context (populated at runtime; all optional)
  shareMode?: ShareMode
  customAmountPesewas?: number
  tipPercent?: number
  method?: 'momo' | 'card'
  momoNumber?: string | undefined
  paymentRef?: string | undefined
  phone?: string
  waStatus?: 'sending' | 'sent' | 'error' | undefined
  waError?: string | undefined

  receiptNumber?: string
  totalPaidPesewas?: number
  reviewUrl?: string | null
  bill?: { status?: string; items: { name: string; qty: number; lineTotalPesewas: number }[]; subtotalPesewas: number; serviceChargePesewas: number; totalPesewas: number } | undefined
  quote?: { billTotalPesewas: number; remainingPesewas: number; sharePesewas: number; tipPesewas: number; grandTotalPesewas: number } | undefined
  // Menu (fetched once from /api/public/menu; all optional)
  menu?: { categories: MenuCategory[]; items: MenuItem[]; recommendations: MenuRec[] } | undefined
  activeCategoryId?: string
  selectedItem?: MenuItem | undefined
}

export type MenuCategory = { id: string; name: string; sort: number }
export type MenuItem = { id: string; category_id: string; name: string; price_pesewas: number; image_key: string | null; tags: { desc?: string; sub?: string; veg?: boolean; signature?: boolean; origin?: string; shot?: number; bottle?: number; glass?: number }; sort: number; available: boolean }
export type MenuRec = { id: string; item_id: string | null; kind: string; title: string; subtitle: string | null; sort: number }

export const initial: State = { screen: 'connect', hasOrder: true, dish: 'Sea bass, charred lemon', people: 2, tip: 10, paymentError: false, waiter: false, navigator: false }

export const screens: [Screen, string, string, string, string, string][] = [
  ['connect','Connecting','QR arrival','QR scanned','Skip connection','Welcome'], ['welcome','Welcome','QR arrival','Connection found','View bill or explore','Empty table / Live bill'], ['empty','Empty table hub','No-order table experience','No order yet','Explore menu','Menu'], ['menu','Menu browse','Menu browsing','Welcome','Open dish','Dish detail'], ['category','Category','Menu browsing','Menu tab','Open a dish','Dish detail'], ['dish','Dish detail','Menu browsing','Menu item','Add to table','Menu'], ['waiter','Ask waiter','Waiter assistance','Empty table','Send request','Notified'], ['waiter-notified','Waiter notified','Waiter assistance','Request sent','Wait for bill','Waiting'], ['waiting-bill','Waiting for bill','Live bill','No bill yet','Demo: bill ready','Bill available'], ['bill-ready','Bill available','Live bill','POS updated','View live bill','Live bill'], ['bill','Live bill','Live bill','Bill available','See full check','Full check'], ['bill-issue','Bill issue','Live bill','Live bill','Report a problem','Waiter notified'], ['full-check','Full check','Live bill','Live bill','Continue','Recommendation'], ['recommendation','Recommendation','Recommendations','Full check','Settle bill','Payment choice'], ['pay','Payment choice','Payment','Bill ready','Choose payment','Split or Tip'], ['split','Split setup','Bill splitting','Payment choice','Continue','Split share'], ['split-share','Your share','Bill splitting','People selected','Continue','Tip'], ['tip','Tip','Payment','Share confirmed','Review payment','Review'], ['review','Review payment','Payment','Tip selected','Choose method','Payment method'], ['method','Payment method','Payment','Review','Continue','MoMo number'], ['momo','MoMo number','Payment','Method selected','Continue','Authorise'], ['otp','Payment OTP','Payment','Card/phone check','Verify','Authorise'], ['authorise','Authorise payment','Payment','Number entered','I approved it','Processing'], ['processing','Processing','Payment status','Authorised','Demo success','Success'], ['payment-error','Payment failed','Payment status','Declined','Try again','MoMo number'], ['success','Payment success','Payment status','Payment approved','Receipt options','Receipt choice'], ['receipt-choice','Receipt options','Receipt','Payment complete','Save receipt','Phone'], ['phone','Phone number','Optional phone and rewards','Receipt choice','Send code','OTP'], ['otp-rewards','Verify number','Optional phone and rewards','Code sent','Verify','Name'], ['name','Your name','Optional phone and rewards','Verified','Save rewards','Rewards'], ['rewards','Rewards saved','Optional phone and rewards','Name saved','Share feedback','Feedback'], ['guest-receipt','Guest receipt','Receipt','Guest choice','Continue','Feedback'], ['feedback','Feedback','Feedback and completion','Receipt complete','Submit feedback','Review or Complete'], ['review-handoff','Google review','Feedback and completion','Positive feedback','Leave a review','Complete'], ['complete','Complete','Feedback and completion','Feedback sent','Start again','Welcome'],
]

export function go(screen: Screen) { return { type: 'screen', value: screen } as const }

export function reducer(s: State, a: { type: string; value?: any }): State {
  if (a.type === 'screen') return { ...s, screen: a.value, paymentError: false }
  if (a.type === 'patch') return { ...s, ...a.value }
  if (a.type === 'toggleOrder') return { ...s, hasOrder: !s.hasOrder, screen: !s.hasOrder ? 'welcome' : 'welcome' }
  if (a.type === 'dish') return { ...s, dish: a.value, screen: 'dish' }
  if (a.type === 'people') return { ...s, people: a.value, screen: 'split-share' }
  if (a.type === 'waiter') return { ...s, waiter: true, screen: 'waiter-notified' }
  if (a.type === 'error') return { ...s, paymentError: true, screen: 'payment-error' }
  if (a.type === 'restore') return { ...initial, ...a.value }
  if (a.type === 'reset') { try { sessionStorage.removeItem('klown-dining-session') } catch {} return initial }
  return s
}
