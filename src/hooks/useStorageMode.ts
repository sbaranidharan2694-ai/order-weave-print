import { useState, useEffect } from "react";
import { isBankStorageAvailable } from "@/lib/bankStorage";
import { supabase } from "@/integrations/supabase/client";

export type StorageMode = "supabase" | "local" | "checking";

/** Bank: supabase = shared with all users; local = only this device */
export type StorageState = {
  bank: StorageMode;
  attendance: StorageMode;
};

export function useStorageMode(): StorageState {
  const [state, setState] = useState<StorageState>({ bank: "checking", attendance: "checking" });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const bankOk = await isBankStorageAvailable();
        if (cancelled) return;
        setState((s) => ({ ...s, bank: bankOk ? "supabase" : "local" }));

        const { error } = await supabase.from("attendance_uploads").select("id").limit(1);
        if (cancelled) return;
        const attendanceOk = !error;
        setState((s) => ({ ...s, attendance: attendanceOk ? "supabase" : "local" }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, bank: "local", attendance: "local" }));
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  return state;
}
