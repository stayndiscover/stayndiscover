\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',false);
set role authenticated;
begin;
select 'session 2 tient la commande ' || public.start_checkout();
select pg_sleep(3);
commit;
