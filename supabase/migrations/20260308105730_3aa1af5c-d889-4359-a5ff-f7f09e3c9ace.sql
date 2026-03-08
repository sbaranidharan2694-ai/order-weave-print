DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'attendance_uploads', 'bank_custom_lookup', 'bank_statements', 'bank_transactions',
    'customers', 'notification_logs', 'order_files', 'order_fulfillments',
    'order_tags', 'orders', 'payroll_employees', 'product_types',
    'purchase_order_line_items', 'purchase_orders', 'settings', 'status_logs',
    'whatsapp_templates'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop existing restrictive policy
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', tbl);
    -- Create PERMISSIVE policy (default)
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      tbl
    );
  END LOOP;
END $$;