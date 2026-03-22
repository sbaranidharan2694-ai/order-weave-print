-- Drop the permissive allow-all policy
DROP POLICY IF EXISTS "Allow all order_items" ON public.order_items;

-- Select: only if parent order is visible to the user
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.created_by = auth.uid() OR o.created_by IS NULL)
    )
  );

-- Insert: only if parent order belongs to user
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.created_by = auth.uid()
    )
  );

-- Update/Delete: same ownership check
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.created_by = auth.uid() OR o.created_by IS NULL)
    )
  ) WITH CHECK (true);

CREATE POLICY "order_items_delete" ON public.order_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.created_by = auth.uid() OR o.created_by IS NULL)
    )
  );
