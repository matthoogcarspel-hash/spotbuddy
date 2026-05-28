-- ============================================================
-- SPOTBUDDY MEGA SIMULATIE — 3000 riders, Nederland
-- Opruimen: run het DELETE blok onderaan
-- ============================================================

DO $$
DECLARE
  today_key   TEXT := TO_CHAR(NOW() AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM-DD');
  fake_id     UUID;
  session_id  UUID;
  i           INT;
  spot_idx    INT;
  spot_name   TEXT;
  status_val  TEXT;
  intent_val  TEXT;
  start_h     INT;
  end_h       INT;
  r           FLOAT;
  wind_kn     INT;
  crowd_val   INT;
  wind_dirs   TEXT[] := ARRAY['Side-shore','Side-onshore','Offshore','Onshore','Side-offshore'];
  water_vals  TEXT[] := ARRAY['Flat','Choppy','Small waves','Big waves'];

  names TEXT[] := ARRAY[
    'Joris','Sanne','Bram','Lisa','Tom','Emma','Daan','Lotte','Finn','Noor',
    'Luuk','Anna','Ties','Eva','Koen','Mila','Rens','Fleur','Lars','Vera',
    'Pieter','Sofie','Bas','Julia','Rick','Manon','Thijs','Isa','Ruben','Fien',
    'Mark','Lena','Niels','Amber','Stef','Rosa','Wouter','Hanna','Cas','Merel',
    'Jens','Tess','Hugo','Nadia','Victor','Iris','Karel','Bo','Arjan','Zoë',
    'Sam','Lynn','Tobias','Amy','Arno','Kirsten','Sven','Nathalie','Patrick','Leonie',
    'Tim','Yara','Max','Jade','Daan','Loes','Job','Nienke','Wout','Famke',
    'Gijs','Tine','Olaf','Rianne','Bjorn','Eline','Dirk','Lien','Erik','Hilde',
    'Pim','Noor','Sem','Anouk','Bart','Chantal','Frank','Denise','Hans','Claudia',
    'Henk','Petra','Willem','Mirjam','Jeroen','Sandra','Kevin','Marjolein','Rob','Ellen'
  ];

  -- Alle Nederlandse spots met gewenst aantal riders
  spots     TEXT[] := ARRAY[
    'Scheveningen KZVS',
    'Scheveningen Jump Team',
    'Scheveningen Zuid',
    'Brouwersdam',
    'Zandmotor',
    'Noordwijk KSN',
    'Wijk aan Zee Wijkiki',
    'Ijmuiden Zuidpier',
    'Workum Kitebeach',
    'Mirns IJsselmeer kitestrand',
    'Texel Paal 17 kitezone',
    'Rockanje Strand 1e slag',
    'Rockanje Strand 2e slag',
    'Slufter Maasvlakte',
    'Oostvoorne'
  ];
  riders_per_spot INT[] := ARRAY[420,310,200,480,130,170,115,100,180,110,140,90,85,130,140];

BEGIN

  -- ── 1. Maak 500 fake profielen aan ──────────────────────────
  FOR i IN 1..500 LOOP
    fake_id := gen_random_uuid();
    INSERT INTO profiles (id, owner_uid, display_name, avatar_url, nationality, skill_level, created_at)
    VALUES (
      fake_id, fake_id,
      'SIM_' || names[((i-1) % array_length(names,1)) + 1] || '_' || i,
      NULL,
      'NL',
      (1 + (RANDOM() * 4)::INT),
      NOW() - (RANDOM() * INTERVAL '365 days')
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ── 2. Maak sessies + ratings per spot ──────────────────────
  FOR spot_idx IN 1..array_length(spots, 1) LOOP
    spot_name := spots[spot_idx];

    FOR i IN 1..riders_per_spot[spot_idx] LOOP

      -- Kies random fake profile
      SELECT id INTO fake_id
      FROM profiles
      WHERE display_name LIKE 'SIM_%'
      ORDER BY RANDOM()
      LIMIT 1;

      -- Tijdvenster
      start_h := 8 + (RANDOM() * 10)::INT;
      end_h   := LEAST(start_h + 1 + (RANDOM() * 4)::INT, 22);

      -- Status verdeling: 40% live, 35% going, 25% maybe
      r := RANDOM();
      IF r < 0.40 THEN
        status_val := 'live';
        intent_val := 'definitely';
      ELSIF r < 0.75 THEN
        status_val := 'Gaat';
        intent_val := CASE WHEN RANDOM() > 0.25 THEN 'definitely' ELSE 'likely' END;
      ELSE
        status_val := 'Gaat';
        intent_val := 'maybe';
      END IF;

      session_id := gen_random_uuid();

      INSERT INTO sessions (
        id, user_id, spot_name, session_day,
        start, "end", status, intent,
        checked_in_at, created_at
      ) VALUES (
        session_id,
        fake_id,
        spot_name,
        today_key,
        LPAD(start_h::TEXT, 2, '0') || ':00',
        LPAD(end_h::TEXT, 2, '0') || ':00',
        status_val,
        intent_val,
        CASE WHEN status_val = 'live'
          THEN NOW() - (RANDOM() * INTERVAL '3 hours')
          ELSE NULL END,
        NOW() - (RANDOM() * INTERVAL '8 hours')
      )
      ON CONFLICT DO NOTHING;

      -- Rating: 60% kans voor live riders, 20% voor anderen
      IF (status_val = 'live' AND RANDOM() < 0.60)
      OR (status_val != 'live' AND RANDOM() < 0.20) THEN
        wind_kn   := 10 + (RANDOM() * 25)::INT;
        crowd_val := 1 + (RANDOM() * 4)::INT;

        INSERT INTO spot_ratings (
          spot_name, session_day, user_id,
          wind_knots, crowd_rating,
          wind_direction, water_conditions
        ) VALUES (
          spot_name,
          today_key,
          fake_id,
          wind_kn,
          crowd_val,
          wind_dirs[1 + (RANDOM() * (array_length(wind_dirs,1)-1))::INT],
          water_vals[1 + (RANDOM() * (array_length(water_vals,1)-1))::INT]
        )
        ON CONFLICT DO NOTHING;
      END IF;

    END LOOP;
  END LOOP;

  RAISE NOTICE 'Simulatie klaar! 3000 riders verdeeld over % spots.', array_length(spots, 1);
END $$;


-- ============================================================
-- CLEANUP — run dit als je klaar bent met testen
-- ============================================================
/*
DELETE FROM spot_ratings  WHERE user_id IN (SELECT id FROM profiles WHERE display_name LIKE 'SIM_%');
DELETE FROM sessions      WHERE user_id IN (SELECT id FROM profiles WHERE display_name LIKE 'SIM_%');
DELETE FROM profiles      WHERE display_name LIKE 'SIM_%';
*/
