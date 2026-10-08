-- Read-only: never select cron command text, request headers, or Vault values.
-- If other pg_net jobs exist, correlate HTTP timestamps with this function's logs.
select jsonb_build_object(
  'jobs', (select jsonb_agg(j) from (
    select jobid,jobname,schedule,active from cron.job where jobname='encore-notification-delivery'
  ) j),
  'cron_runs', (select jsonb_agg(r) from (
    select start_time,end_time,status from cron.job_run_details
    where jobid=(select jobid from cron.job where jobname='encore-notification-delivery')
    order by start_time desc limit 10
  ) r),
  'http_responses', (select jsonb_agg(h) from (
    select id,status_code,timed_out,error_msg,created,
      case when status_code=200 then content::jsonb->'claimed' end as claimed,
      case when status_code=200 then content::jsonb->'sent' end as sent,
      case when status_code=200 then content::jsonb->'skipped' end as skipped,
      case when status_code=200 then content::jsonb->'retry' end as retry,
      case when status_code=200 then content::jsonb->'failed' end as failed,
      case when status_code=200 then content::jsonb->'invalid_device' end as invalid_device
    from net._http_response order by created desc limit 10
  ) h)
) as result;
