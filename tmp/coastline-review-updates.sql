-- Generated candidate updates. Review before running.
-- These set coordinate_status = review, not verified.

update public.spots
set
  launch_latitude = 53.448779,
  launch_longitude = 5.7789779,
  coordinate_status = 'review',
  coordinate_verification_source = 'osm_beach_coastline_snap',
  coordinate_verification_notes = 'osm_type=way; osm_id=72734498; osm_natural=beach; distance_m=675; score=63; candidate=unnamed',
  coordinate_verified_at = null
where canonical_name = 'ameland - nes'
  and coordinate_status != 'verified';

update public.spots
set
  launch_latitude = 52.6722194,
  launch_longitude = 4.6305495,
  coordinate_status = 'review',
  coordinate_verification_source = 'osm_beach_coastline_snap',
  coordinate_verification_notes = 'osm_type=node; osm_id=6940012908; osm_natural=beach; distance_m=1425; score=56; candidate=Nude Beach -Bergen aan Zee',
  coordinate_verified_at = null
where canonical_name = 'bergen aan zee'
  and coordinate_status != 'verified';

update public.spots
set
  launch_latitude = 51.7654769,
  launch_longitude = 3.8501884,
  coordinate_status = 'review',
  coordinate_verification_source = 'osm_beach_coastline_snap',
  coordinate_verification_notes = 'osm_type=way; osm_id=61728057; osm_natural=beach; distance_m=181; score=68; candidate=unnamed',
  coordinate_verified_at = null
where canonical_name = 'brouwersdam'
  and coordinate_status != 'verified';

update public.spots
set
  launch_latitude = 51.7353275,
  launch_longitude = 3.8080648,
  coordinate_status = 'review',
  coordinate_verification_source = 'osm_beach_coastline_snap',
  coordinate_verification_notes = 'osm_type=way; osm_id=1422532062; osm_natural=beach; distance_m=1313; score=57; candidate=unnamed',
  coordinate_verified_at = null
where canonical_name = 'brouwersdam noordzee'
  and coordinate_status != 'verified';

update public.spots
set
  launch_latitude = 51.3705707,
  launch_longitude = 3.3745518,
  coordinate_status = 'review',
  coordinate_verification_source = 'osm_beach_coastline_snap',
  coordinate_verification_notes = 'osm_type=way; osm_id=74591130; osm_natural=beach; distance_m=1073; score=59; candidate=unnamed',
  coordinate_verified_at = null
where canonical_name = 'cadzand-bad'
  and coordinate_status != 'verified';
