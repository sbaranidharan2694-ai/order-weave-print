/**
 * Audit log helper: insert action records for multi-user SaaS.
 * RLS allows INSERT for authenticated users (user_id = auth.uid()); only admins can SELECT.
 */
import { supabase } from "@/integrations/supabase/client";

export async function logAudit(action: string, entity: string, entityId: string | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from("audit_logs") as any).insert({
      user_id: user?.id ?? null,
      action,
      entity_type: entity,
      entity_id: entityId,
    });
  } catch {
    // Non-blocking: do not throw so app flow continues
  }
}
