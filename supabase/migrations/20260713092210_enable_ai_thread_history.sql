alter table public.ai_threads
  drop constraint if exists ai_threads_character_id_user_id_key;

alter table public.ai_threads
  add column if not exists title text;

create index if not exists ai_threads_character_user_updated_idx
  on public.ai_threads (character_id, user_id, updated_at desc);

update public.ai_threads as thread
set title = nullif(left(regexp_replace(coalesce((
  select case
    when jsonb_typeof(message.content -> 'content') = 'string'
      then message.content ->> 'content'
    when jsonb_typeof(message.content -> 'content') = 'array'
      then coalesce((
        select part.value ->> 'text'
        from jsonb_array_elements(message.content -> 'content') with ordinality as part(value, position)
        where part.value ->> 'type' = 'text'
          and nullif(btrim(part.value ->> 'text'), '') is not null
        order by part.position
        limit 1
      ), '')
    else ''
  end
  from public.ai_messages as message
  where message.thread_id = thread.id
    and message.role = 'user'
  order by message.sequence_index, message.created_at, message.id
  limit 1
), ''), '\s+', ' ', 'g'), 100), '')
where thread.title is null;
