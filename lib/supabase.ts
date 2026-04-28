import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export type Category = string
export type Status   = 'pending' | 'in_progress' | 'done'

export interface Goal {
  id: string
  title: string
  description: string | null
  category: Category
  status: Status
  week_start: string
  completed_at: string | null
  created_at: string
}
