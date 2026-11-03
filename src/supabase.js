import { createClient } from '@supabase/supabase-js'
export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
// Supabase returns max 1000 rows per request, so read in pages
export async function all(table, order = 'id') {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select('*').order(order).range(from, from + 999)
    if (error) throw error
    out = out.concat(data)
    if (data.length < 1000) return out
    from += 1000
  }
}
