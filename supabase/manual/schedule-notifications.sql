-- Run as the project owner after deploying notification-delivery and adding Vault secrets.
-- Secret names below contain only the HTTPS project URL and a dedicated cron token.
-- Never place the service-role key or VAPID keys in cron.job.command.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if (select count(*) from vault.decrypted_secrets where name='encore_notification_url') <> 1
    or (select count(*) from vault.decrypted_secrets where name='encore_notification_token') <> 1 then
    raise exception 'Create exactly one encore_notification_url and encore_notification_token Vault secret first';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='encore_notification_url'
    and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co$')
    or not exists (select 1 from vault.decrypted_secrets where name='encore_notification_token' and length(decrypted_secret)>=32) then
    raise exception 'Invalid notification URL or token';
  end if;
end $$;

-- Re-running the named schedule updates it rather than creating duplicates.
select cron.schedule('encore-notification-delivery', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='encore_notification_url') || '/functions/v1/notification-delivery',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='encore_notification_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
$job$);
