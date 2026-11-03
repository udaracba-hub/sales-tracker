// All business rules from the Excel Dashboard live here.
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0)
const pad = n => String(n).padStart(2, '0')
export const iso = d => d.toISOString().slice(0, 10)
export const today = () => { const d = new Date(); return iso(new Date(d.getTime() - d.getTimezoneOffset() * 6e4)) }
export const eom = m => { const [y, mo] = m.split('-'); return iso(new Date(Date.UTC(+y, +mo, 0))) }
export const addDays = (d, n) => iso(new Date(new Date(d).getTime() + n * 864e5))
const diff = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5)
const inR = (d, a, b) => d >= a && d <= b
export const fmt = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
export const pct = n => (n * 100).toFixed(1) + '%'
export const tone = p => (p >= 1 ? 'g' : p >= 0.7 ? 'a' : 'r')
export const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function metrics(sales, targets, month, t = today()) {
  const s = month, e = eom(month), y = month.slice(0, 4), jan = y + '-01-01'
  const tg = m => targets.find(x => x.month === m) || { sales_target: 0, gp_target: 0 }
  const ms = sales.filter(x => inR(x.invoice_date, s, e))
  const sa = sum(ms, x => x.total_price), ga = sum(ms, x => x.gp_amount)
  const st = +tg(s).sales_target, gt = +tg(s).gp_target
  const left = t > e ? 0 : t < s ? +e.slice(8) : diff(e, t)
  const ytd = k => sum(targets.filter(x => inR(x.month, jan, s)), x => x[k])
  const ytdS = sum(sales.filter(x => inR(x.invoice_date, jan, e)), x => x.total_price)
  const ytdG = sum(sales.filter(x => inR(x.invoice_date, jan, e)), x => x.gp_amount)
  const pend = sales.filter(x => x.status === 'Pending' && x.method === 'Check' && x.due_date)
  const cust = {}
  ms.forEach(x => { const c = (cust[x.customer_name] ||= { name: x.customer_name, sales: 0, gp: 0 }); c.sales += +x.total_price; c.gp += +x.gp_amount })
  const hint = (tgt, act) => act >= tgt ? 'Target achieved' : left > 0 ? `Needs ${fmt((tgt - act) / left)} per day (${left} days left)` : 'Month closed'
  const done = sum(ms.filter(x => x.status === 'Done'), x => x.total_price)
  const pending = sum(ms.filter(x => x.status === 'Pending'), x => x.total_price)
  const over = pend.filter(x => x.due_date < t), soon = pend.filter(x => inR(x.due_date, t, addDays(t, 7)))
  return {
    st, sa, gt, ga, count: ms.length, left,
    sAch: st > 0 ? sa / st : 0, gAch: gt > 0 ? ga / gt : 0,
    sRem: Math.max(0, st - sa), gRem: Math.max(0, gt - ga),
    sHint: hint(st, sa), gHint: hint(gt, ga),
    margin: sa > 0 ? ga / sa : null,
    ytdSPct: ytd('sales_target') > 0 ? ytdS / ytd('sales_target') : null,
    ytdGPct: ytd('gp_target') > 0 ? ytdG / ytd('gp_target') : null,
    done, pending, pendingCount: ms.filter(x => x.status === 'Pending').length,
    overAmt: sum(over, x => x.total_price), overCnt: over.length,
    soonAmt: sum(soon, x => x.total_price), soonCnt: soon.length,
    byCheck: sum(ms.filter(x => x.method === 'Check'), x => x.total_price),
    byCash: sum(ms.filter(x => x.method === 'Cash'), x => x.total_price),
    top5: Object.values(cust).filter(c => c.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 5),
    cheques: [...pend].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8).map(x => ({
      ...x, note: x.due_date < t ? `Overdue ${diff(t, x.due_date)}d` : `Due in ${diff(x.due_date, t)}d` })),
    year: MON.map((n, i) => {
      const m = `${y}-${pad(i + 1)}-01`, a = m, b = eom(m), inM = sales.filter(x => inR(x.invoice_date, a, b))
      return { name: n, salesTarget: +tg(m).sales_target, salesActual: sum(inM, x => x.total_price),
               gpTarget: +tg(m).gp_target, gpActual: sum(inM, x => x.gp_amount) }
    }),
  }
}
