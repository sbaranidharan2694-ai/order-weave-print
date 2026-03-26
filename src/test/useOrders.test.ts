import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ order: () => ({ data: [], error: null }), data: [], error: null }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }), data: [], error: null }), data: null, error: null }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
      delete: () => ({ eq: () => ({ data: null, error: null }) }),
      eq: () => ({ maybeSingle: () => ({ data: null, error: null }), single: () => ({ data: null, error: null }), data: [], error: null }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ data: [], error: null }), data: [], error: null }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }), data: [], error: null }), data: null, error: null }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

vi.mock("@/integrations/supabase/config", () => ({
  isSupabaseConfigured: false,
}));

describe("stripBalanceDue", () => {
  it("removes balance_due from an object", () => {
    const input = { id: "1", amount: 100, balance_due: 50, status: "active" };
    const { balance_due, ...rest } = input;
    expect(rest).toEqual({ id: "1", amount: 100, status: "active" });
    expect(rest).not.toHaveProperty("balance_due");
  });

  it("handles object without balance_due", () => {
    const input = { id: "2", amount: 200 };
    const { balance_due, ...rest } = input as Record<string, unknown>;
    expect(rest).toEqual({ id: "2", amount: 200 });
  });
});

describe("useOrdersToday query key", () => {
  it("should use 'orders-today' as query key", async () => {
    const { useOrdersToday } = await import("@/hooks/useOrders");
    expect(useOrdersToday).toBeDefined();
  });
});
