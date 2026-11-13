-- OnePlace v2: run AFTER the first schema SQL in Supabase SQL Editor.
-- Secure server-side actions. Do not give users direct write access to role/balance.

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create or replace function public.admin_create_ticket(p_owner_id uuid,p_title text,p_price integer)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_ticket uuid;
begin
 if public.current_app_role() <> 'admin' then raise exception 'Admin only'; end if;
 if p_price < 0 or p_price > 100000 then raise exception 'Invalid price'; end if;
 if not exists(select 1 from public.profiles where id=p_owner_id and role='player') then raise exception 'Player not found'; end if;
 update public.profiles set balance=balance-p_price where id=p_owner_id and balance>=p_price;
 if not found then raise exception 'Not enough game money'; end if;
 insert into public.transactions(user_id,amount,description) values(p_owner_id,-p_price,'Покупка билета: '||left(p_title,80));
 insert into public.tickets(owner_id,title,price) values(p_owner_id,left(p_title,80),p_price) returning id into new_ticket;
 return new_ticket;
end; $$;

create or replace function public.admin_send_message(p_receiver_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_id uuid;
begin
 if public.current_app_role() <> 'admin' then raise exception 'Admin only'; end if;
 if length(trim(p_message))=0 or length(p_message)>2000 then raise exception 'Message must be 1-2000 characters'; end if;
 insert into public.messages(sender_id,receiver_id,message) values(auth.uid(),p_receiver_id,trim(p_message)) returning id into new_id;
 return new_id;
end; $$;

create or replace function public.guard_use_ticket(p_qr_code text)
returns text language plpgsql security definer set search_path=public
as $$
declare found_status text;
begin
 if public.current_app_role() not in ('admin','guard') then raise exception 'Guard access required'; end if;
 update public.tickets set status='used' where qr_code=p_qr_code and status='active';
 if found then return 'Билет действителен. Отмечен как использованный.'; end if;
 select status into found_status from public.tickets where qr_code=p_qr_code;
 if found_status='used' then return 'Билет уже использован.'; end if;
 return 'Билет не найден или отменён.';
end; $$;

create or replace function public.staff_update_parcel(p_parcel_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
 if public.current_app_role() not in ('admin','guard') then raise exception 'Staff access required'; end if;
 if p_status not in ('accepted','in_transit','ready','delivered') then raise exception 'Invalid status'; end if;
 update public.parcels set status=p_status where id=p_parcel_id;
 return found;
end; $$;

-- Staff can view player list and all parcel records through scoped policies.
drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles for select to authenticated
using (public.current_app_role() in ('admin','guard'));

drop policy if exists "staff read all parcels" on public.parcels;
create policy "staff read all parcels" on public.parcels for select to authenticated
using (public.current_app_role() in ('admin','guard'));

grant execute on function public.admin_create_ticket(uuid,text,integer) to authenticated;
grant execute on function public.admin_send_message(uuid,text) to authenticated;
grant execute on function public.guard_use_ticket(text) to authenticated;
grant execute on function public.staff_update_parcel(uuid,text) to authenticated;
