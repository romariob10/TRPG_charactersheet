revoke all privileges on public.template_subscriptions from anon;
revoke update, truncate, references, trigger
on public.template_subscriptions
from authenticated;
grant select, insert, delete
on public.template_subscriptions
to authenticated;
