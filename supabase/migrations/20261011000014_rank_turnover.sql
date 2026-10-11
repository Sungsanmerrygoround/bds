-- 단지 순위: 회전율(12개월 매매 ÷ 세대수)은 면적 구간과 관계없이 단지 전체 거래로 계산해야 해서
-- 전체 면적 12개월 매매 건수(trades_all_12m)를 더한다. 단지별 부분 인덱스(apt_seq, deal_date) 범위 조회라 빠르다.

drop function complex_rank(int, smallint, char);
create function complex_rank(p_group_id int, p_area_band smallint, p_end char(6))
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               trades_12m int, median_12m int, ppa_12m int,
               recent_median int, recent_count int, year_ago_median int, year_ago_count int,
               peak_price int, peak_date date, households int, trades_all_12m int)
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
         a.peak, a.peak_date, ci.households,
         (select count(*)::int from apt_trades t2
           where t2.apt_seq = a.apt_seq and not t2.is_cancelled and t2.missing_since is null
             and t2.deal_date >= to_date(ym_add(p_end, -11), 'YYYYMM')
             and t2.deal_date < to_date(ym_add(p_end, 1), 'YYYYMM'))
  from a
  join complexes c on c.apt_seq = a.apt_seq
  join regions rg on rg.id = c.region_id
  left join complex_info ci on ci.apt_seq = a.apt_seq
  where a.n12 > 0
$$;

revoke execute on function complex_rank(int, smallint, char) from public, anon, authenticated;
