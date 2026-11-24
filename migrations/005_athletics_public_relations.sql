ALTER TABLE accounts
  ADD COLUMN access_scope text NOT NULL DEFAULT 'standard'
  CHECK(access_scope IN ('standard', 'public_relations'));

-- Race metadata is presentation/workflow metadata and does not change scoring versions.
UPDATE disciplines
SET data = jsonb_set(data, '{scheduleMode}', '"standard"'::jsonb, true)
WHERE NOT (data ? 'scheduleMode');

UPDATE disciplines
SET data = jsonb_set(data, '{scheduleMode}', '"race"'::jsonb, true)
WHERE id IN (
  'athletics-men-100m-dash',
  'athletics-men-200m-dash',
  'athletics-men-400m-run',
  'athletics-men-800m-run',
  'athletics-men-1500m-run',
  'athletics-men-3000m-run',
  'athletics-men-4x100m-relay',
  'athletics-men-4x400m-relay',
  'athletics-women-100m-dash',
  'athletics-women-200m-dash',
  'athletics-women-400m-run',
  'athletics-women-800m-run',
  'athletics-women-1500m-run',
  'athletics-women-3000m-run',
  'athletics-women-4x100m-relay',
  'athletics-women-4x400m-relay'
);

UPDATE disciplines
SET data = jsonb_set(
      jsonb_set(
        jsonb_set(data, '{active}', 'true'::jsonb, true),
        '{reason}',
        to_jsonb('Organizer confirmed the normalized relay discipline.'::text),
        true
      ),
      '{version}',
      to_jsonb(version + 1),
      true
    ),
    version = version + 1
WHERE id IN (
  'athletics-men-4x100m-relay',
  'athletics-men-4x400m-relay',
  'athletics-women-4x100m-relay',
  'athletics-women-4x400m-relay'
)
AND COALESCE((data->>'active')::boolean, false) = false;
