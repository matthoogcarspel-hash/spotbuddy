-- ============================================================
-- SPOTBUDDY SESSION SIMULATOR
-- Aanmaken: run dit script
-- Opruimen: run het DELETE blok onderaan
-- ============================================================

DO $$
DECLARE
  today_key TEXT := TO_CHAR(NOW() AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM-DD');
  fake_id UUID;
  i INT;
  spot_name TEXT;
  status_val TEXT;
  intent_val TEXT;
  start_h INT;
  end_h INT;
  rider_count INT;
  names TEXT[] := ARRAY[
    'Joris','Sanne','Bram','Lisa','Tom','Emma','Daan','Lotte','Finn','Noor',
    'Luuk','Anna','Ties','Eva','Koen','Mila','Rens','Fleur','Lars','Vera',
    'Pieter','Sofie','Bas','Julia','Rick','Manon','Thijs','Isa','Ruben','Fien',
    'Mark','Lena','Niels','Amber','Stef','Rosa','Wouter','Hanna','Cas','Merel',
    'Jens','Tess','Hugo','Nadia','Victor','Iris','Karel','Bo','Arjan','Zoë',
    'Sam','Lynn','Tobias','Amy','Arno','Kirsten','Sven','Nathalie','Patrick','Leonie'
  ];
  spots TEXT[] := ARRAY[
    'Scheveningen KZVS',
    'Scheveningen Jump Team',
    'Scheveningen Zuid',
    'Brouwersdam',
    'Zandmotor',
    'Noordwijk KSN',
    'Wijk aan Zee Wijkiki',
    'Ijmuiden Zuidpier',
    'Maasvlakte'
  ];
  riders_per_spot INT[] := ARRAY[65, 45, 30, 75, 20, 25, 18, 15, 22];
  live_pct INT[] := ARRAY[40, 35, 25, 50, 20, 30, 25, 20, 15];
  going_pct INT[] := ARRAY[35, 40, 45, 30, 50, 40, 45, 50, 55];
  spot_idx INT;
BEGIN

  -- Maak fake profiles aan
  FOR i IN 1..60 LOOP
    fake_id := gen_random_uuid();
    INSERT INTO profiles (id, owner_uid, display_name, avatar_url, created_at)
    VALUES (
      fake_id,
      fake_id,
      'SIM_' || names[((i-1) % array_length(names,1)) + 1] || '_' || i,
      NULL,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Maak sessies aan per spot
  FOR spot_idx IN 1..array_length(spots, 1) LOOP
    spot_name := spots[spot_idx];
    rider_count := riders_per_spot[spot_idx];

    FOR i IN 1..rider_count LOOP
      -- Haal een fake profile op
      SELECT id INTO fake_id
      FROM profiles
      WHERE display_name LIKE 'SIM_%'
      ORDER BY RANDOM()
      LIMIT 1;

      -- Bepaal start/end tijd (7-22)
      start_h := 7 + (RANDOM() * 13)::INT;
      end_h := LEAST(start_h + 1 + (RANDOM() * 3)::INT, 22);

      -- Bepaal status: live / going / maybe
      IF (RANDOM() * 100)::INT < live_pct[spot_idx] THEN
        status_val := 'live';
        intent_val := 'definitely';
      ELSIF (RANDOM() * 100)::INT < (live_pct[spot_idx] + going_pct[spot_idx]) THEN
        status_val := 'Gaat';
        intent_val := CASE WHEN RANDOM() > 0.3 THEN 'definitely' ELSE 'likely' END;
      ELSE
        status_val := 'Gaat';
        intent_val := 'maybe';
      END IF;

      INSERT INTO sessions (
        id, user_id, spot_name, session_day,
        start, "end", status, intent,
        checked_in_at, created_at
      ) VALUES (
        gen_random_uuid(),
        fake_id,
        spot_name,
        today_key,
        LPAD(start_h::TEXT, 2, '0') || ':00',
        LPAD(end_h::TEXT, 2, '0') || ':00',
        status_val,
        intent_val,
        CASE WHEN status_val = 'live' THEN NOW() - (RANDOM() * INTERVAL '2 hours') ELSE NULL END,
        NOW() - (RANDOM() * INTERVAL '6 hours')
      )
      ON CONFLICT DO NOTHING;

    END LOOP;
  END LOOP;

  RAISE NOTICE 'Simulatie klaar! % spots gevuld.', array_length(spots, 1);
END $$;


-- ============================================================
-- CLEANUP — run dit als je klaar bent met testen
-- ============================================================
/*
DELETE FROM sessions WHERE user_id IN (SELECT id FROM profiles WHERE display_name LIKE 'SIM_%');
DELETE FROM profiles WHERE display_name LIKE 'SIM_%';
*/
