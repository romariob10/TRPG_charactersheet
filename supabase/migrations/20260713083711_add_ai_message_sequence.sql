alter table public.ai_messages
  add column sequence_index integer;

with ranked_messages as (
  select
    id,
    row_number() over (
      partition by thread_id
      order by created_at, id
    ) - 1 as sequence_index
  from public.ai_messages
)
update public.ai_messages as messages
set sequence_index = ranked_messages.sequence_index
from ranked_messages
where ranked_messages.id = messages.id;

alter table public.ai_messages
  alter column sequence_index set not null;

create index ai_messages_thread_sequence_idx
  on public.ai_messages(thread_id, sequence_index);
