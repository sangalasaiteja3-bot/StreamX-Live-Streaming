// StreamX Supabase client. The publishable key is intended for browser use.
// Never place a service_role or secret key in browser code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.1';

export const SUPABASE_URL = 'https://pzuxtlgadeqzzkghkyqb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JQkNwB5WUKiPzzjf_hdWTw_eYtRdmai';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
