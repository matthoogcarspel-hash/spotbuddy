-- Functie die wekelijks checkt op openstaande verzoeken
CREATE OR REPLACE FUNCTION check_pending_spot_requests()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  pending_count INT;
  msg TEXT;
BEGIN
  SELECT COUNT(*) INTO pending_count
  FROM (
    SELECT id FROM pending_spots WHERE status = 'pending'
    UNION ALL
    SELECT id FROM spot_coordinate_suggestions WHERE status = 'pending'
  ) t;

  IF pending_count > 0 THEN
    msg := pending_count || ' pending spot request(s) waiting for review';
    PERFORM send_push_to_users(
      ARRAY['1a6cf03f-48ea-4907-b5ee-6594a44465a6'],
      '📍 SpotBuddy Admin',
      msg,
      '{"type":"admin"}'::JSONB
    );
  END IF;
END;
$func$;

-- Wekelijkse cron job elke maandag 09:00 UTC
SELECT cron.schedule(
  'weekly-pending-spots-reminder',
  '0 9 * * 1',
  'SELECT check_pending_spot_requests()'
);
