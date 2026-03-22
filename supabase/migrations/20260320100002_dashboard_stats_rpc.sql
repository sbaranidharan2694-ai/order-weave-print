-- Returns order pipeline counts without loading all rows to the client
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'today_count', (
      SELECT COUNT(*) FROM orders
      WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        AND (created_by = auth.uid() OR created_by IS NULL)
    ),
    'in_production', (
      SELECT COUNT(*) FROM orders
      WHERE status IN ('Design Review','Plate Making','Printing','Cutting / Binding','Quality Check')
        AND (created_by = auth.uid() OR created_by IS NULL)
    ),
    'ready_to_dispatch', (
      SELECT COUNT(*) FROM orders
      WHERE status = 'Ready to Dispatch'
        AND (created_by = auth.uid() OR created_by IS NULL)
    ),
    'overdue', (
      SELECT COUNT(*) FROM orders
      WHERE delivery_date < CURRENT_DATE
        AND status NOT IN ('Delivered','Cancelled')
        AND (created_by = auth.uid() OR created_by IS NULL)
    ),
    'total_balance_due', (
      SELECT COALESCE(SUM(GREATEST(amount - COALESCE(advance_paid,0), 0)), 0)
      FROM orders
      WHERE status NOT IN ('Delivered','Cancelled')
        AND (created_by = auth.uid() OR created_by IS NULL)
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
