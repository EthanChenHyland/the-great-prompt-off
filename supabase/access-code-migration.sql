-- Add participant access codes to an existing Supabase database.
-- Run this before `npm run seed:supabase` if your participants table was created
-- before the access_code column existed.

alter table participants
  add column if not exists access_code text;

create unique index if not exists participants_access_code_unique
  on participants (access_code)
  where access_code is not null;

-- After running `npm run seed:supabase`, enforce the access code requirement.
alter table participants
  alter column access_code set not null;

alter table participants
  add constraint participants_access_code_length
  check (length(trim(access_code)) >= 12);
