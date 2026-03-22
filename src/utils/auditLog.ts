import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export async function logAudit(action: string, entity: string, entityId: string | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from("audit_logs") as any).insert({
      user_id: user?.id ?? null,
      action,
      entity_type: entity,
      entity_id: entityId,
    });
  } catch (e) {
    logger.warn("[audit] Failed to log audit event:", e);
  }
}
