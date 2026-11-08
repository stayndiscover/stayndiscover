insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','d1@t'),('00000000-0000-0000-0000-0000000000d2','d2@t');
insert into cart_items (user_id, listing_id, unit_id, start_date, end_date, adults)
select x.u, listing_id, id, '2027-04-10', '2027-04-14', 2 from accommodation_units,
 (values ('00000000-0000-0000-0000-0000000000d1'::uuid),('00000000-0000-0000-0000-0000000000d2'::uuid)) x(u);
