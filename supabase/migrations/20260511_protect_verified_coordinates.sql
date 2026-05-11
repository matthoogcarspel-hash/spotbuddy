create or replace function public.protect_verified_spot_coordinates()
returns trigger
language plpgsql
as $$
begin
  if old.coordinate_source = 'google_maps_manual'
     and (
       new.launch_latitude is distinct from old.launch_latitude
       or new.launch_longitude is distinct from old.launch_longitude
     )
     and new.coordinate_source != 'google_maps_manual'
  then
    raise exception
      'Manual verified coordinates cannot be overwritten';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_verified_spot_coordinates_trigger
on public.spots;

create trigger protect_verified_spot_coordinates_trigger
before update on public.spots
for each row
execute function public.protect_verified_spot_coordinates();
