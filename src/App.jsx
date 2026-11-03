import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import * as XLSX from 'xlsx'
import { sb, all } from './supabase.js'
import { metrics, today, fmt, pct, tone, MON } from './metrics.js'

const monthKey = d => d.slice(0, 7) + '-01'
const ymd = v => new Date(new Date(v).getTime() + 12 * 36e5).toISOString().slice(0, 10) // Excel date -> YYYY-MM-DD
const EMPTY = { customer_id: '', product: '', invoice_date: today(), invoice_no: '', qty: 1, unit_price: '', gp_amount: 0, status: 'Pending', method: 'Check' }

export default function App() {
  const [tab, setTab] = useState('Dashboard')
  const [sales, setSales] = useState([]), [targets, setTargets] = useState([])
  const [customers, setCustomers] = useState([]), [settings, setSettings] = useState({ cheque_credit_days: '30', currency: '' })
  const [msg, setMsg] = useState(''), [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [s, t, c, st] = await Promise.all([all('sales_view'), all('targets', 'month'), all('customers', 'name'), sb.from('settings').select('*')])
      setSales(s); setTargets(t); setCustomers(c)
      if (st.data) setSettings(Object.fromEntries(st.data.map(r => [r.key, r.value])))
      setMsg('')
    } catch (e) { setMsg('Could not load data: ' + e.message + '. Check the Supabase keys and that the SQL script was run.') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  const cur = settings.currency ? settings.currency + ' ' : ''
  const props = { sales, targets, customers, settings, load, cur, setMsg }

  return (
    <div className="app">
      <header>
        <h1>Sales Target Tracker</h1>
        <nav>{['Dashboard', 'Sales', 'Targets', 'Setup'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      </header>
      {msg && <div className="note err">{msg}</div>}
      {loading ? <p className="muted">Loading…</p> : tab === 'Dashboard' ? <Dashboard {...props} /> : tab === 'Sales' ? <Sales {...props} /> : tab === 'Targets' ? <Targets {...props} /> : <Setup {...props} />}
    </div>
  )
}

function Card({ label, value, sub, hint, t }) {
  return <div className={'card ' + (t || '')}><div className="lbl">{label}</div><div className="val">{value}</div>{sub && <div className="sub">{sub}</div>}{hint && <div className="hint">{hint}</div>}</div>
}

function Dashboard({ sales, targets, cur }) {
  const [month, setMonth] = useState(monthKey(today()))
  const m = useMemo(() => metrics(sales, targets, month), [sales, targets, month])
  const months = []
  for (let y = 2025; y <= 2029; y++) for (let i = 0; i < 12; i++) months.push(`${y}-${String(i + 1).padStart(2, '0')}-01`)
  const label = d => `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
  const status = [{ name: 'Done', v: m.done }, { name: 'Pending', v: m.pending }], method = [{ name: 'Check', v: m.byCheck }, { name: 'Cash', v: m.byCash }]
  const COL = ['#0f766e', '#d97706']
  const bar = (title, a, b) => (
    <div className="panel"><h3>{title}</h3><ResponsiveContainer width="100%" height={260}>
      <BarChart data={m.year}><XAxis dataKey="name" /><YAxis tickFormatter={v => fmt(v / 1000) + 'k'} /><Tooltip formatter={v => cur + fmt(v)} /><Legend />
        <Bar dataKey={a} name="Target" fill="#b8c4c2" /><Bar dataKey={b} name="Actual" fill="#0f766e" /></BarChart></ResponsiveContainer></div>)
  const pie = (title, d) => (
    <div className="panel"><h3>{title}</h3><ResponsiveContainer width="100%" height={220}>
      <PieChart><Pie data={d} dataKey="v" nameKey="name" outerRadius={80} label={e => e.name}>{d.map((_, i) => <Cell key={i} fill={COL[i]} />)}</Pie><Tooltip formatter={v => cur + fmt(v)} /></PieChart></ResponsiveContainer></div>)
  return (<>
    <div className="bar"><label>Month <select value={month} onChange={e => setMonth(e.target.value)}>{months.map(d => <option key={d} value={d}>{label(d)}</option>)}</select></label>
      <span className="muted">Report date {today()}</span></div>
    <h2>Sales</h2>
    <div className="grid">
      <Card label="Sales target" value={cur + fmt(m.st)} sub={m.st ? '' : 'Set it on the Targets page'} />
      <Card label="Actual sales" value={cur + fmt(m.sa)} sub={`${m.count} invoices this month`} />
      <Card label="Achievement" value={pct(m.sAch)} t={tone(m.sAch)} sub={m.ytdSPct != null ? `YTD ${pct(m.ytdSPct)} of target` : ''} />
      <Card label="Remaining to target" value={cur + fmt(m.sRem)} hint={m.sHint} />
    </div>
    <h2>Gross profit</h2>
    <div className="grid">
      <Card label="GP target" value={cur + fmt(m.gt)} />
      <Card label="Actual GP" value={cur + fmt(m.ga)} sub={m.margin != null ? `GP margin ${pct(m.margin)}` : ''} />
      <Card label="Achievement" value={pct(m.gAch)} t={tone(m.gAch)} sub={m.ytdGPct != null ? `YTD ${pct(m.ytdGPct)} of target` : ''} />
      <Card label="Remaining to GP target" value={cur + fmt(m.gRem)} hint={m.gHint} />
    </div>
    <h2>Collections and receivables</h2>
    <div className="grid">
      <Card label="Collected (Done), this month" value={cur + fmt(m.done)} sub={m.sa ? Math.round(m.done / m.sa * 100) + "% of month's sales" : ''} />
      <Card label="Pending, this month" value={cur + fmt(m.pending)} sub={`${m.pendingCount} invoices awaiting payment`} />
      <Card label="Overdue cheques (all months)" value={cur + fmt(m.overAmt)} t={m.overAmt > 0 ? 'r' : ''} sub={`${m.overCnt} cheques past due date`} />
      <Card label="Cheques due in next 7 days" value={cur + fmt(m.soonAmt)} t={m.soonAmt > 0 ? 'a' : ''} sub={`${m.soonCnt} cheques`} />
    </div>
    <h2>Monthly trend {month.slice(0, 4)}</h2>
    <div className="two">{bar('Sales: target vs actual', 'salesTarget', 'salesActual')}{bar('Gross profit: target vs actual', 'gpTarget', 'gpActual')}</div>
    <h2>Details for {label(month)}</h2>
    <div className="two">
      <div className="panel"><h3>Top 5 customers</h3><table><thead><tr><th>#</th><th>Customer</th><th className="n">Sales</th><th className="n">GP</th><th className="n">% of sales</th></tr></thead>
        <tbody>{m.top5.map((c, i) => <tr key={c.name}><td>{i + 1}</td><td>{c.name}</td><td className="n">{fmt(c.sales)}</td><td className="n">{fmt(c.gp)}</td><td className="n">{pct(c.sales / m.sa)}</td></tr>)}
          {!m.top5.length && <tr><td colSpan="5" className="muted">No sales in this month.</td></tr>}</tbody></table></div>
      <div className="panel"><h3>Pending cheques, earliest due first (all months)</h3><table><thead><tr><th>Invoice</th><th>Customer</th><th className="n">Amount</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>{m.cheques.map(x => <tr key={x.id}><td>{x.invoice_no}</td><td>{x.customer_name}</td><td className="n">{fmt(x.total_price)}</td><td>{x.due_date}</td><td><span className={'tag ' + (x.note.startsWith('Overdue') ? 'r' : 'a')}>{x.note}</span></td></tr>)}
          {!m.cheques.length && <tr><td colSpan="5" className="muted">No pending cheques.</td></tr>}</tbody></table></div>
    </div>
    <h2>Payment mix, {label(month)}</h2>
    <div className="two">{pie('Payment status', status)}{pie('Payment method', method)}</div>
  </>)
}

function Sales({ sales, customers, load, cur, setMsg }) {
  const [f, setF] = useState(EMPTY), [q, setQ] = useState(''), [lim, setLim] = useState(100)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const rows = useMemo(() => [...sales].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.id - a.id)
    .filter(x => !q || (x.customer_name + x.invoice_no + (x.product || '')).toLowerCase().includes(q.toLowerCase())), [sales, q])
  async function save(e) {
    e.preventDefault()
    if (!f.customer_id) return setMsg('Pick a customer first. Add new customers on the Setup page.')
    const p = { customer_id: +f.customer_id, product: f.product, invoice_date: f.invoice_date, invoice_no: f.invoice_no.trim(), qty: +f.qty, unit_price: +f.unit_price, gp_amount: +f.gp_amount || 0, status: f.status, method: f.method }
    const { error } = f.id ? await sb.from('sales').update(p).eq('id', f.id) : await sb.from('sales').insert(p)
    if (error) return setMsg(error.message.includes('invoice_no') ? 'That invoice number already exists.' : error.message)
    setMsg(''); setF(EMPTY); load()
  }
  async function toggle(x) { await sb.from('sales').update({ status: x.status === 'Done' ? 'Pending' : 'Done' }).eq('id', x.id); load() }
  async function del(x) { if (confirm(`Delete invoice ${x.invoice_no}?`)) { await sb.from('sales').delete().eq('id', x.id); load() } }
  return (<>
    <h2>{f.id ? 'Edit invoice' : 'Add invoice'}</h2>
    <form className="form" onSubmit={save}>
      <label>Customer<select required value={f.customer_id} onChange={e => set('customer_id', e.target.value)}><option value="">Select…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Product details<input value={f.product} onChange={e => set('product', e.target.value)} /></label>
      <label>Invoice date<input type="date" required value={f.invoice_date} onChange={e => set('invoice_date', e.target.value)} /></label>
      <label>Invoice number<input required value={f.invoice_no} onChange={e => set('invoice_no', e.target.value)} /></label>
      <label>Quantity<input type="number" min="0" step="any" required value={f.qty} onChange={e => set('qty', e.target.value)} /></label>
      <label>Unit price<input type="number" min="0" step="any" required value={f.unit_price} onChange={e => set('unit_price', e.target.value)} /></label>
      <label>GP amount<input type="number" step="any" value={f.gp_amount} onChange={e => set('gp_amount', e.target.value)} /></label>
      <label>Payment status<select value={f.status} onChange={e => set('status', e.target.value)}><option>Pending</option><option>Done</option></select></label>
      <label>Payment method<select value={f.method} onChange={e => set('method', e.target.value)}><option>Check</option><option>Cash</option></select></label>
      <div className="actions"><button className="primary">{f.id ? 'Save changes' : 'Add invoice'}</button>{f.id && <button type="button" onClick={() => setF(EMPTY)}>Cancel</button>}</div>
    </form>
    <div className="bar"><h2 style={{ margin: 0 }}>Invoices ({rows.length})</h2><input placeholder="Search customer, invoice or product" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="scroll"><table><thead><tr><th>ID</th><th>Customer</th><th>Product</th><th>Date</th><th>Invoice</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">Total</th><th className="n">GP</th><th>Status</th><th>Method</th><th>Due</th><th></th></tr></thead>
      <tbody>{rows.slice(0, lim).map(x => <tr key={x.id}><td>{x.id}</td><td>{x.customer_name}</td><td>{x.product}</td><td>{x.invoice_date}</td><td>{x.invoice_no}</td><td className="n">{x.qty}</td><td className="n">{fmt(x.unit_price)}</td><td className="n">{cur}{fmt(x.total_price)}</td><td className="n">{fmt(x.gp_amount)}</td>
        <td><button className={'tag ' + (x.status === 'Done' ? 'g' : 'a')} title="Click to switch" onClick={() => toggle(x)}>{x.status}</button></td><td>{x.method === 'Check' ? 'Cheque' : 'Cash'}</td>
        <td className={x.status === 'Pending' && x.due_date && x.due_date < today() ? 'overdue' : ''}>{x.due_date || ''}</td>
        <td className="nw"><button onClick={() => { setF({ ...x }); window.scrollTo(0, 0) }}>Edit</button> <button onClick={() => del(x)}>Delete</button></td></tr>)}</tbody></table></div>
    {rows.length > lim && <p><button onClick={() => setLim(lim + 200)}>Show more</button></p>}
  </>)
}

function Targets({ sales, targets, load, cur }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const rows = MON.map((n, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}-01`, t = targets.find(x => x.month === m) || { sales_target: 0, gp_target: 0 }
    const inM = sales.filter(x => x.invoice_date.startsWith(m.slice(0, 7)))
    const sa = inM.reduce((s, x) => s + +x.total_price, 0), ga = inM.reduce((s, x) => s + +x.gp_amount, 0)
    return { m, n, t, sa, ga }
  })
  async function saveT(m, key, v, t) { await sb.from('targets').upsert({ month: m, sales_target: t.sales_target, gp_target: t.gp_target, [key]: +v || 0 }); load() }
  const A = ({ a, b }) => b > 0 ? <span className={'tag ' + tone(a / b)}>{pct(a / b)}</span> : <span className="muted">–</span>
  return (<>
    <div className="bar"><h2 style={{ margin: 0 }}>Monthly targets</h2><label>Year <select value={year} onChange={e => setYear(+e.target.value)}>{[2025, 2026, 2027, 2028, 2029].map(y => <option key={y}>{y}</option>)}</select></label></div>
    <p className="muted">Type a target and click outside the box to save it.</p>
    <div className="scroll"><table><thead><tr><th>Month</th><th className="n">Sales target</th><th className="n">Actual sales</th><th>Achv</th><th className="n">GP target</th><th className="n">Actual GP</th><th>Achv</th><th className="n">GP margin</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.m + r.t.sales_target + r.t.gp_target}><td>{r.n} {year}</td>
        <td><input className="cell" type="number" defaultValue={r.t.sales_target || ''} onBlur={e => +e.target.value !== +r.t.sales_target && saveT(r.m, 'sales_target', e.target.value, r.t)} /></td>
        <td className="n">{cur}{fmt(r.sa)}</td><td><A a={r.sa} b={+r.t.sales_target} /></td>
        <td><input className="cell" type="number" defaultValue={r.t.gp_target || ''} onBlur={e => +e.target.value !== +r.t.gp_target && saveT(r.m, 'gp_target', e.target.value, r.t)} /></td>
        <td className="n">{cur}{fmt(r.ga)}</td><td><A a={r.ga} b={+r.t.gp_target} /></td><td className="n">{r.sa > 0 ? pct(r.ga / r.sa) : '–'}</td></tr>)}</tbody></table></div>
  </>)
}

function Setup({ customers, settings, load, setMsg }) {
  const [name, setName] = useState(''), [days, setDays] = useState(settings.cheque_credit_days), [cur, setCur] = useState(settings.currency), [info, setInfo] = useState('')
  async function addC(e) { e.preventDefault(); const { error } = await sb.from('customers').insert({ name: name.trim() }); error ? setMsg(error.code === '23505' ? 'That customer already exists.' : error.message) : (setName(''), setMsg(''), load()) }
  async function saveS() { await sb.from('settings').upsert([{ key: 'cheque_credit_days', value: String(+days || 30) }, { key: 'currency', value: cur }]); setInfo('Settings saved.'); load() }
  async function importXlsx(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      setInfo('Reading file…')
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sales Tracker'], { range: 3 }).filter(r => r['Customer Name'])
      const tg = XLSX.utils.sheet_to_json(wb.Sheets['Targets'], { range: 3 }).filter(r => r['Month'] instanceof Date && (r['Sales Target'] || r['GP Target']))
      const lists = XLSX.utils.sheet_to_json(wb.Sheets['Lists'], { range: 3 }).map(r => r['Customer List']).filter(Boolean)
      const names = [...new Set([...lists, ...rows.map(r => r['Customer Name'])].map(s => String(s).trim()))]
      let r1 = await sb.from('customers').upsert(names.map(n => ({ name: n })), { onConflict: 'name', ignoreDuplicates: true }); if (r1.error) throw r1.error
      const map = Object.fromEntries((await all('customers', 'name')).map(c => [c.name, c.id]))
      const inv = rows.map(r => ({ customer_id: map[String(r['Customer Name']).trim()], product: r['Product Details'] || '', invoice_date: ymd(r['Invoice Date']), invoice_no: String(r['Invoice Number']),
        qty: +r['Quantity'] || 0, unit_price: +r['Unit Price'] || 0, gp_amount: +r['GP Amount'] || 0, status: r['Payment Status'] === 'Done' ? 'Done' : 'Pending', method: r['Payment Method'] === 'Cash' ? 'Cash' : 'Check' }))
      for (let i = 0; i < inv.length; i += 200) { const r = await sb.from('sales').upsert(inv.slice(i, i + 200), { onConflict: 'invoice_no' }); if (r.error) throw r.error }
      if (tg.length) { const r = await sb.from('targets').upsert(tg.map(r => ({ month: ymd(r['Month']).slice(0, 7) + '-01', sales_target: +r['Sales Target'] || 0, gp_target: +r['GP Target'] || 0 }))); if (r.error) throw r.error }
      setInfo(`Imported ${inv.length} invoices, ${names.length} customers and ${tg.length} monthly targets.`); load()
    } catch (err) { setMsg('Import failed: ' + err.message) ; setInfo('') }
    e.target.value = ''
  }
  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    sb.from('sales_view').select('*').order('id').then(({ data }) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data || []), 'Sales'); XLSX.writeFile(wb, 'sales-backup.xlsx')
    })
  }
  return (<>
    <h2>Import from your Excel file</h2>
    <p className="muted">Choose Sales_Target_Tracker_Dashboard.xlsx. It loads customers, invoices and monthly targets. Running it twice is safe: invoices are matched by invoice number.</p>
    <input type="file" accept=".xlsx" onChange={importXlsx} />{info && <p className="note">{info}</p>}
    <h2>Settings</h2>
    <div className="form"><label>Cheque credit period (days)<input type="number" value={days} onChange={e => setDays(e.target.value)} /></label><label>Currency label (optional)<input value={cur} onChange={e => setCur(e.target.value)} placeholder="e.g. LKR" /></label>
      <div className="actions"><button className="primary" onClick={saveS}>Save settings</button></div></div>
    <p className="muted">Due date = invoice date + credit period, only for cheque payments.</p>
    <h2>Customers ({customers.length})</h2>
    <form className="bar" onSubmit={addC}><input required placeholder="New customer name" value={name} onChange={e => setName(e.target.value)} /><button className="primary">Add customer</button></form>
    <div className="chips">{customers.map(c => <span key={c.id}>{c.name}</span>)}</div>
    <h2>Backup</h2><button onClick={exportXlsx}>Download all invoices as Excel</button>
  </>)
}
