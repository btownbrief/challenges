-- ============================================================
-- BTOWN CHALLENGES — one-time Supabase setup
--
-- Safe to re-run: tables use IF NOT EXISTS, migrations are explicit, and RPCs
-- use CREATE OR REPLACE. Until this runs, the app saves completions locally
-- and says so.
--
-- Tables have RLS enabled with NO policies. The anon key cannot touch them
-- directly; all browser access goes through security-definer RPCs, and only
-- those RPCs are granted to anon.
-- ============================================================

-- ---------- tables ----------

create table if not exists btb_ch_completions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chid       text not null,
  name       text not null,
  note       text,
  voter      text not null,
  flags      int not null default 0,
  status     text not null default 'visible'
);
alter table btb_ch_completions enable row level security;

create table if not exists btb_ch_flags (
  completion_id uuid not null references btb_ch_completions(id) on delete cascade,
  voter         text not null,
  created_at    timestamptz not null default now(),
  primary key (completion_id, voter)
);
alter table btb_ch_flags enable row level security;

-- ---------- explicit migrations for future re-runs ----------

alter table btb_ch_completions add column if not exists flags int not null default 0;
alter table btb_ch_completions add column if not exists status text not null default 'visible';

create unique index if not exists btb_ch_one_per_voter_idx
  on btb_ch_completions (chid, voter);
create index if not exists btb_ch_board_idx
  on btb_ch_completions (status, created_at desc);

-- ---------- board ----------

create or replace function btb_ch_board()
returns table (id uuid, chid text, name text, note text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select c.id, c.chid, c.name, c.note, c.created_at
  from btb_ch_completions c
  where c.status = 'visible'
  order by c.created_at desc
  limit 1000;
$$;
grant execute on function btb_ch_board() to anon;

-- ---------- submit ----------

create or replace function btb_ch_submit(
  p_chid text, p_name text, p_note text, p_voter text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_note   text;
  v_recent int;
  v_id     uuid;
begin
  if p_chid is null or p_chid !~ '^[a-z0-9-]{3,40}$' then
    raise exception 'bad challenge id';
  end if;
  if p_voter is null or length(p_voter) not between 8 and 64 then
    raise exception 'bad voter';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g'));
  v_name := regexp_replace(v_name, '\s{2,}', ' ', 'g');
  if length(v_name) not between 2 and 40 then raise exception 'bad name'; end if;

  v_note := btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]+', ' ', 'g'));
  v_note := regexp_replace(v_note, '\s{2,}', ' ', 'g');
  if length(v_note) > 200 then raise exception 'note too long'; end if;
  v_note := nullif(v_note, '');

  if (v_name || ' ' || coalesce(v_note, '')) ~*
     '(n[i1]gg|f[a4]gg|k[i1]ke|sp[i1]c\M|tr[a4]nny|c[o0]on\M|retard)' then
    raise exception 'rejected';
  end if;

  select count(*) into v_recent
  from btb_ch_completions
  where voter = p_voter and created_at > now() - interval '1 hour';
  if v_recent >= 3 then raise exception 'slow down'; end if;

  insert into btb_ch_completions (chid, name, note, voter)
  values (p_chid, v_name, v_note, p_voter)
  on conflict (chid, voter) do update set chid = excluded.chid
  returning id into v_id;

  return v_id;
end $$;
grant execute on function btb_ch_submit(text, text, text, text) to anon;

-- ---------- report ----------

create or replace function btb_ch_flag(p_completion uuid, p_voter text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_flags int;
begin
  if p_voter is null or length(p_voter) not between 8 and 64 then return; end if;

  insert into btb_ch_flags (completion_id, voter)
  values (p_completion, p_voter)
  on conflict do nothing;

  select count(*) into v_flags
  from btb_ch_flags
  where completion_id = p_completion;

  update btb_ch_completions
  set flags = v_flags,
      status = case when v_flags >= 2 then 'hidden' else status end
  where id = p_completion;
end $$;
grant execute on function btb_ch_flag(uuid, text) to anon;

-- ============================================================
-- ADMIN — reuses the existing btb_photo_admin passphrase table.
-- If that table does not exist, this file still installs; admin simply does
-- not unlock. The passphrase is checked server-side by every admin RPC.
-- ============================================================

create or replace function btb_ch_is_admin(p_pass text)
returns boolean
language plpgsql security definer stable set search_path = public, extensions as $$
declare ok boolean := false;
begin
  if to_regclass('public.btb_photo_admin') is not null then
    execute 'select exists (select 1 from btb_photo_admin
                            where pass_hash = crypt($1, pass_hash))'
      into ok using coalesce(p_pass, '');
  end if;
  return coalesce(ok, false);
end $$;
revoke all on function btb_ch_is_admin(text) from public, anon, authenticated;

create or replace function btb_ch_admin_check(p_pass text)
returns boolean
language sql security definer stable set search_path = public as $$
  select btb_ch_is_admin(p_pass);
$$;
grant execute on function btb_ch_admin_check(text) to anon;

create or replace function btb_ch_admin_list(p_pass text)
returns table (
  id uuid, chid text, name text, note text,
  flags int, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not btb_ch_is_admin(p_pass) then
    raise exception 'bad admin passphrase' using errcode = '28000';
  end if;

  return query
    select c.id, c.chid, c.name, c.note, c.flags, c.status, c.created_at
    from btb_ch_completions c
    order by
      (c.flags > 0 and c.status = 'visible') desc,
      c.flags desc,
      c.created_at desc
    limit 1000;
end $$;
grant execute on function btb_ch_admin_list(text) to anon;

create or replace function btb_ch_admin_set_status(
  p_pass text, p_completion uuid, p_status text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not btb_ch_is_admin(p_pass) then
    raise exception 'bad admin passphrase' using errcode = '28000';
  end if;
  if p_status not in ('visible', 'hidden') then raise exception 'bad status'; end if;

  if p_status = 'visible' then
    delete from btb_ch_flags where completion_id = p_completion;
    update btb_ch_completions set status = 'visible', flags = 0 where id = p_completion;
  else
    update btb_ch_completions set status = 'hidden' where id = p_completion;
  end if;
end $$;
grant execute on function btb_ch_admin_set_status(text, uuid, text) to anon;

create or replace function btb_ch_admin_delete(p_pass text, p_completion uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not btb_ch_is_admin(p_pass) then
    raise exception 'bad admin passphrase' using errcode = '28000';
  end if;
  delete from btb_ch_completions where id = p_completion;
end $$;
grant execute on function btb_ch_admin_delete(text, uuid) to anon;
