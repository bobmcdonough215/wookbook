-- Dummy tour_events for local UX testing.
-- Run in Supabase Dashboard > SQL Editor.
-- Delete when real cron data starts flowing:
--   DELETE FROM tour_events WHERE external_id LIKE 'dummy:%';

INSERT INTO tour_events (external_id, source, artist_name, date, venue_name, venue_city, venue_state, venue_lat, venue_lng, ticket_url, is_festival, is_home_market, drive_hours)
VALUES
  -- Home market shows
  ('dummy:001', 'jambase', 'Phish',                    '2026-07-04', 'Wells Fargo Center',    'Philadelphia',    'PA', 39.9012,  -75.1720,  'https://www.ticketmaster.com', false, true,  0.0),
  ('dummy:002', 'jambase', 'Goose',                    '2026-06-20', 'The Met Philadelphia',  'Philadelphia',    'PA', 39.9601,  -75.1580,  'https://www.ticketmaster.com', false, true,  0.0),
  ('dummy:003', 'jambase', 'Billy Strings',            '2026-07-12', 'Freedom Mortgage Pavilion', 'Camden',      'NJ', 39.9462,  -75.1307,  'https://www.livenation.com',   false, true,  0.2),
  ('dummy:004', 'jambase', 'Widespread Panic',         '2026-08-01', 'Red Rocks Amphitheatre','Morrison',        'CO', 39.6654,  -105.2057, 'https://www.axs.com',          false, true,  null),
  ('dummy:005', 'jambase', 'String Cheese Incident',   '2026-09-05', 'Bethel Woods Center',   'Bethel',          'NY', 41.6868,  -74.8906,  'https://www.etix.com',         false, true,  1.5),
  ('dummy:006', 'jambase', 'Joe Russo''s Almost Dead', '2026-06-28', 'Brooklyn Steel',        'New York',        'NY', 40.7128,  -74.0060,  'https://www.ticketmaster.com', false, true,  2.0),
  ('dummy:007', 'jambase', 'Lotus',                    '2026-07-19', 'Fillmore Philadelphia', 'Philadelphia',    'PA', 39.9530,  -75.1598,  'https://www.livenation.com',   false, true,  0.0),

  -- Nearby (within 8h)
  ('dummy:008', 'jambase', 'Umphrey''s McGee',         '2026-07-25', 'Stage AE',              'Pittsburgh',      'PA', 40.4406,  -79.9959,  'https://www.ticketmaster.com', false, false, 5.0),
  ('dummy:009', 'jambase', 'Dead & Company',           '2026-08-10', 'Fenway Park',           'Boston',          'MA', 42.3467,  -71.0972,  'https://www.ticketmaster.com', false, false, 6.5),
  ('dummy:010', 'jambase', 'Phish',                    '2026-08-15', 'Saratoga Perf. Arts Ctr', 'Saratoga Springs', 'NY', 43.0831, -73.7846, 'https://www.ticketmaster.com', false, true,  3.8),

  -- Further out
  ('dummy:011', 'jambase', 'Billy Strings',            '2026-09-18', 'Ryman Auditorium',      'Nashville',       'TN', 36.1612,  -86.7785,  'https://www.livenation.com',   false, false, 14.0),
  ('dummy:012', 'jambase', 'Johnny Blue Skies',        '2026-08-22', 'Ryman Auditorium',      'Nashville',       'TN', 36.1612,  -86.7785,  'https://www.livenation.com',   false, false, 14.0),

  -- Festival
  ('dummy:013', 'jambase', 'Goose',                    '2026-08-07', 'Lockn'' Festival Grounds','Arrington',    'VA', 37.8512,  -78.8898,  'https://www.lockn.com',        true,  false, 7.5),
  ('dummy:014', 'jambase', 'Widespread Panic',         '2026-08-07', 'Lockn'' Festival Grounds','Arrington',    'VA', 37.8512,  -78.8898,  'https://www.lockn.com',        true,  false, 7.5)

ON CONFLICT (external_id) DO NOTHING;
