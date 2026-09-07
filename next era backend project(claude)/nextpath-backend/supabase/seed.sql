-- SECTION: Sample opportunities for local development and demos
-- Mirrors the fixtures used in src/lib/eligibility/evaluate.test.ts so a demo
-- profile that passes those tests also gets a real match against seeded data.
-- The §12 verification columns are populated so the demo can render the
-- "Verified from official source — last verified [date]" state, the
-- REVIEW_NEEDED state, and the HIGH/MEDIUM confidence bands.
insert into public.opportunities
  (title, organization, source_url, hard_requirements, source, last_verified_at, verification_status, confidence)
values
  (
    'STEM Excellence Scholarship',
    'NextPath Foundation',
    'https://example.org/stem-excellence',
    '{
      "nationality": { "sourceStatus": "EXPLICIT", "value": ["EG"] },
      "age": { "sourceStatus": "EXPLICIT", "value": { "minimum": 18, "maximum": 30 } },
      "educationLevel": { "sourceStatus": "EXPLICIT", "value": ["BACHELOR"] },
      "academicYear": { "sourceStatus": "EXPLICIT", "value": [2, 3, 4] },
      "minimumGpa": { "sourceStatus": "EXPLICIT", "value": 3.2 },
      "residency": { "sourceStatus": "EXPLICIT", "value": ["EG"] },
      "requiresLegalAuthorization": { "sourceStatus": "EXPLICIT", "value": true },
      "deadline": { "sourceStatus": "EXPLICIT", "value": "2026-12-01" }
    }'::jsonb,
    'Official website',
    '2026-09-01T12:00:00Z',
    'VERIFIED',
    'HIGH'
  ),
  (
    'Global Graduate Fellowship',
    'Open Horizons Trust',
    'https://example.org/global-graduate',
    '{
      "nationality": { "sourceStatus": "AMBIGUOUS", "note": "International applicants welcome" },
      "age": { "sourceStatus": "NOT_STATED" },
      "educationLevel": { "sourceStatus": "EXPLICIT", "value": ["MASTER", "PHD"] },
      "academicYear": { "sourceStatus": "NOT_STATED" },
      "minimumGpa": { "sourceStatus": "NOT_STATED" },
      "residency": { "sourceStatus": "NOT_STATED" },
      "requiresLegalAuthorization": { "sourceStatus": "NOT_STATED" },
      "deadline": { "sourceStatus": "EXPLICIT", "value": "2027-01-15" }
    }'::jsonb,
    'Third-party aggregator',
    '2026-08-15T09:30:00Z',
    'VERIFIED',
    'MEDIUM'
  ),
  (
    'Community College Bridge Grant',
    'Regional Education Alliance',
    'https://example.org/bridge-grant',
    '{
      "nationality": { "sourceStatus": "EXPLICIT", "value": ["EG", "SA", "AE", "JO"] },
      "age": { "sourceStatus": "EXPLICIT", "value": { "maximum": 24 } },
      "educationLevel": { "sourceStatus": "EXPLICIT", "value": ["SECONDARY", "DIPLOMA"] },
      "academicYear": { "sourceStatus": "NOT_STATED" },
      "minimumGpa": { "sourceStatus": "EXPLICIT", "value": 2.8 },
      "residency": { "sourceStatus": "NOT_STATED" },
      "requiresLegalAuthorization": { "sourceStatus": "EXPLICIT", "value": true },
      "deadline": { "sourceStatus": "EXPLICIT", "value": "2026-11-01" }
    }'::jsonb,
    null,
    null,
    'REVIEW_NEEDED',
    null
  );
-- End of section: three opportunities spanning a fully-explicit match, a mostly-unstated one
-- (exercises LIKELY_ELIGIBLE/UNKNOWN paths), and a stricter one with an age ceiling instead of a range.
-- The verification columns are populated with one HIGH, one MEDIUM, and one REVIEW_NEEDED row
-- so the §12 user-visible strings exercise every documented state.
