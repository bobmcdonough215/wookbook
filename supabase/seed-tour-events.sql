-- Dummy tour_events + user_event_matches for local UX testing.
-- Run in Supabase Dashboard > SQL Editor.
-- Safe to re-run — all inserts are ON CONFLICT DO NOTHING.
--
-- To clean up when real cron data starts flowing:
--   DELETE FROM tour_events WHERE external_id LIKE 'dummy:%';
--   (user_event_matches rows cascade-delete automatically)

-- -----------------------------------------------------------------------------
-- 1. tour_events — global show facts
-- -----------------------------------------------------------------------------

INSERT INTO tour_events (external_id, source, artist_name, date, venue_name, venue_city, venue_state, venue_lat, venue_lng, ticket_url, is_festival)
VALUES
  ('dummy:001', 'jambase', 'Phish',                    '2026-07-04', 'Wells Fargo Center',         'Philadelphia',    'PA', 39.9012,  -75.1720,  'https://www.ticketmaster.com', false),
  ('dummy:002', 'jambase', 'Goose',                    '2026-06-20', 'The Met Philadelphia',        'Philadelphia',    'PA', 39.9601,  -75.1580,  'https://www.ticketmaster.com', false),
  ('dummy:003', 'jambase', 'Billy Strings',            '2026-07-12', 'Freedom Mortgage Pavilion',   'Camden',          'NJ', 39.9462,  -75.1307,  'https://www.livenation.com',   false),
  ('dummy:004', 'jambase', 'Widespread Panic',         '2026-08-01', 'Red Rocks Amphitheatre',      'Morrison',        'CO', 39.6654,  -105.2057, 'https://www.axs.com',          false),
  ('dummy:005', 'jambase', 'String Cheese Incident',   '2026-09-05', 'Bethel Woods Center',         'Bethel',          'NY', 41.6868,  -74.8906,  'https://www.etix.com',         false),
  ('dummy:006', 'jambase', 'Joe Russo''s Almost Dead', '2026-06-28', 'Brooklyn Steel',              'New York',        'NY', 40.7128,  -74.0060,  'https://www.ticketmaster.com', false),
  ('dummy:007', 'jambase', 'Lotus',                    '2026-07-19', 'Fillmore Philadelphia',       'Philadelphia',    'PA', 39.9530,  -75.1598,  'https://www.livenation.com',   false),
  ('dummy:008', 'jambase', 'Umphrey''s McGee',         '2026-07-25', 'Stage AE',                    'Pittsburgh',      'PA', 40.4406,  -79.9959,  'https://www.ticketmaster.com', false),
  ('dummy:009', 'jambase', 'Dead & Company',           '2026-08-10', 'Fenway Park',                 'Boston',          'MA', 42.3467,  -71.0972,  'https://www.ticketmaster.com', false),
  ('dummy:010', 'jambase', 'Phish',                    '2026-08-15', 'Saratoga Perf. Arts Ctr',     'Saratoga Springs','NY', 43.0831,  -73.7846,  'https://www.ticketmaster.com', false),
  ('dummy:011', 'jambase', 'Billy Strings',            '2026-09-18', 'Ryman Auditorium',            'Nashville',       'TN', 36.1612,  -86.7785,  'https://www.livenation.com',   false),
  ('dummy:012', 'jambase', 'Johnny Blue Skies',        '2026-08-22', 'Ryman Auditorium',            'Nashville',       'TN', 36.1612,  -86.7785,  'https://www.livenation.com',   false),
  ('dummy:013', 'jambase', 'Goose',                    '2026-08-07', 'Lockn'' Festival Grounds',    'Arrington',       'VA', 37.8512,  -78.8898,  'https://www.lockn.com',        true),
  ('dummy:014', 'jambase', 'Widespread Panic',         '2026-08-07', 'Lockn'' Festival Grounds',    'Arrington',       'VA', 37.8512,  -78.8898,  'https://www.lockn.com',        true)
ON CONFLICT (external_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. user_event_matches — per-user relevance for dreadlockbob
--    Looks up user UUID by username so no hardcoded ID needed.
-- -----------------------------------------------------------------------------

INSERT INTO user_event_matches (user_id, tour_event_id, drive_hours, is_home_market)
SELECT
  p.id,
  te.id,
  m.drive_hours,
  m.is_home_market
FROM profiles p
CROSS JOIN (VALUES
  ('dummy:001', 0.0,  true),   -- Philadelphia, PA (~0mi)
  ('dummy:002', 0.0,  true),   -- Philadelphia, PA (~0mi)
  ('dummy:003', 0.2,  true),   -- Camden, NJ (~3mi)
  ('dummy:004', NULL, false),  -- Morrison, CO (far)
  ('dummy:005', 1.5,  false),  -- Bethel, NY (~90mi)
  ('dummy:006', 2.0,  false),  -- New York, NY (~95mi)
  ('dummy:007', 0.0,  true),   -- Philadelphia, PA (~0mi)
  ('dummy:008', 5.0,  false),  -- Pittsburgh, PA (~300mi)
  ('dummy:009', 6.5,  false),  -- Boston, MA (far)
  ('dummy:010', 3.8,  false),  -- Saratoga Springs, NY (~290mi)
  ('dummy:011', 14.0, false),  -- Nashville, TN (far)
  ('dummy:012', 14.0, false),  -- Nashville, TN (far)
  ('dummy:013', 7.5,  false),  -- Arrington, VA (far)
  ('dummy:014', 7.5,  false)   -- Arrington, VA (far)
) AS m(ext_id, drive_hours, is_home_market)
JOIN tour_events te ON te.external_id = m.ext_id
WHERE p.username = 'dreadlockbob'
ON CONFLICT (user_id, tour_event_id) DO NOTHING;
