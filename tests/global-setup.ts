import { getSupabaseEnv } from './helpers/supabase'

export default function globalSetup() {
  getSupabaseEnv()
}
