-- 단지 순위: 면적 구간 단위로 한 번에 훑으므로 필요한 컬럼을 모두 담은 부분 인덱스(index-only scan).
create index if not exists apt_trades_rank_idx on apt_trades (area_band, region_id)
  include (apt_seq, deal_ymd, deal_date, price_man, exclu_area)
  where not is_cancelled and missing_since is null;

-- 최고가 계약일을 단지마다 다시 찾지 않고 집계 한 번에 구한다.
create or replace function complex_rank(p_group_id int, p_area_band smallint, p_end char(6))
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               trades_12m int, median_12m int, ppa_12m int,
               recent_median int, recent_count int, year_ago_median int, year_ago_count int,
               peak_price int, peak_date date)
language sql stable as $$
  with t as (
    select t.apt_seq, t.deal_ymd, t.deal_date, t.price_man, t.exclu_area
    from apt_trades t
    where t.region_id in (select id from regions where p_group_id is null or group_id = p_group_id)
      and (p_area_band is null or t.area_band = p_area_band)
      and t.deal_ymd <= p_end
      and not t.is_cancelled and t.missing_since is null
  ),
  a as (
    select t.apt_seq,
      count(*) filter (where deal_ymd > ym_add(p_end, -12))::int as n12,
      percentile_cont(0.5) within group (order by price_man) filter (where deal_ymd > ym_add(p_end, -12)) as med12,
      percentile_cont(0.5) within group (order by price_man / exclu_area * 3.305785) filter (where deal_ymd > ym_add(p_end, -12)) as ppa12,
      percentile_cont(0.5) within group (order by price_man) filter (where deal_ymd > ym_add(p_end, -3)) as med_r,
      count(*) filter (where deal_ymd > ym_add(p_end, -3))::int as n_r,
      percentile_cont(0.5) within group (order by price_man) filter (where deal_ymd > ym_add(p_end, -15) and deal_ymd <= ym_add(p_end, -12)) as med_y,
      count(*) filter (where deal_ymd > ym_add(p_end, -15) and deal_ymd <= ym_add(p_end, -12))::int as n_y,
      max(price_man) as peak,
      (array_agg(deal_date order by price_man desc, deal_date desc))[1] as peak_date
    from t
    group by t.apt_seq
  )
  select c.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, c.build_year,
         a.n12, round(a.med12)::int, round(a.ppa12)::int,
         round(a.med_r)::int, a.n_r, round(a.med_y)::int, a.n_y,
         a.peak, a.peak_date
  from a
  join complexes c on c.apt_seq = a.apt_seq
  join regions rg on rg.id = c.region_id
  where a.n12 > 0
$$;

revoke execute on function complex_rank(int, smallint, char) from public, anon, authenticated;
