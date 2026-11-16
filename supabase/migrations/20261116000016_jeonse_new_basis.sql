-- 전세 중위가를 신규 계약 기준으로도 낸다.
-- 갱신 계약은 종전 보증금에 묶여(갱신요구권 +5% 상한 등) 시세보다 낮거나 늦게 움직이는데, 최근에는 전세 계약의 절반이 갱신이라
-- 전체 중위가가 지금 시세를 가린다. 계약 구분이 없는 행(구분 신고 이전·미기재)은 신규로 본다 → `is distinct from '갱신'`.
-- 기존 열(jeonse_median 등)은 그대로 두고 신규 기준 열을 더해, 배포된 화면이 새 함수와도 그대로 동작한다.

-- 전월세 월별 집계 공용 커버링 인덱스: 추이(전세), 순위(단지별 전세), 월세 분석이 함께 쓴다.
-- 기존 apt_rents_jeonse_trend_idx(전세·보증금만)를 대신한다.
drop index if exists apt_rents_jeonse_trend_idx;
create index apt_rents_monthly_idx on apt_rents (region_id, deal_ymd, area_band)
  include (rent_type, deposit_man, monthly_rent_man, contract_type, apt_seq, area_type, deal_date)
  where missing_since is null;

-- 단지+면적 전세 조회(관심 단지 요약, 전월세 전환율의 기준 전세)에 계약 구분을 더한다.
drop index if exists apt_rents_complex_jeonse_idx;
create index apt_rents_complex_jeonse_idx on apt_rents (apt_seq, area_type, deal_date)
  include (deposit_man, contract_type)
  where rent_type = '전세' and missing_since is null;

-- ---------- 추이 ----------

drop function trend_monthly(int, smallint, char, char);
create function trend_monthly(p_group_id int, p_area_band smallint, p_from char(6), p_to char(6))
returns table (ym char(6), trade_median int, trade_count int, jeonse_median int, jeonse_count int,
               jeonse_new_median int, jeonse_new_count int)
language sql stable as $$
  with r as (select id from regions where group_id = p_group_id),
  t as (
    select deal_ymd as ym,
           round(percentile_cont(0.5) within group (order by price_man))::int as med,
           count(*)::int as cnt
    from apt_trades
    where region_id in (select id from r)
      and (p_area_band is null or area_band = p_area_band)
      and deal_ymd between p_from and p_to
      and not is_cancelled and missing_since is null
    group by deal_ymd
  ),
  j as (
    select deal_ymd as ym,
           round(percentile_cont(0.5) within group (order by deposit_man))::int as med,
           count(*)::int as cnt,
           round(percentile_cont(0.5) within group (order by deposit_man) filter (where contract_type is distinct from '갱신'))::int as new_med,
           count(*) filter (where contract_type is distinct from '갱신')::int as new_cnt
    from apt_rents
    where region_id in (select id from r)
      and (p_area_band is null or area_band = p_area_band)
      and deal_ymd between p_from and p_to
      and rent_type = '전세' and missing_since is null
    group by deal_ymd
  )
  select coalesce(t.ym, j.ym), t.med, coalesce(t.cnt, 0), j.med, coalesce(j.cnt, 0), j.new_med, coalesce(j.new_cnt, 0)
  from t full join j on t.ym = j.ym
  order by 1
$$;

-- ---------- 관심 단지 요약 ----------

drop function complex_stats(text[]);
create function complex_stats(p_apt_seqs text[])
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               area_type numeric, trades_12m int, last_date date, last_price int,
               trade_median_6m int, trade_count_6m int, jeonse_median_6m int, jeonse_count_6m int,
               peak_price int, peak_date date,
               event_type text, event_date date, event_pct numeric,
               jeonse_new_median_6m int, jeonse_new_count_6m int)
language sql stable as $$
  select c.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, c.build_year,
         a.area_type, s.n12, l.deal_date, l.price_man,
         s.med6, s.n6, j.med6, j.n6, p.price_man, p.deal_date,
         e.type, e.deal_date, e.change_pct,
         j.new_med6, j.new_n6
  from complexes c
  join regions rg on rg.id = c.region_id
  left join lateral (
    select t.area_type from apt_trades t
    where t.apt_seq = c.apt_seq and not t.is_cancelled and t.missing_since is null
    group by t.area_type
    order by count(*) filter (where t.deal_date >= current_date - interval '2 years') desc, count(*) desc, t.area_type
    limit 1
  ) a on true
  left join lateral (
    select count(*) filter (where t.deal_date >= current_date - interval '12 months')::int as n12,
           round(percentile_cont(0.5) within group (order by t.price_man) filter (where t.deal_date >= current_date - interval '6 months'))::int as med6,
           count(*) filter (where t.deal_date >= current_date - interval '6 months')::int as n6
    from apt_trades t
    where t.apt_seq = c.apt_seq and t.area_type = a.area_type and not t.is_cancelled and t.missing_since is null
  ) s on true
  left join lateral (
    select t.deal_date, t.price_man from apt_trades t
    where t.apt_seq = c.apt_seq and t.area_type = a.area_type and not t.is_cancelled and t.missing_since is null
    order by t.deal_date desc, t.id desc limit 1
  ) l on true
  left join lateral (
    select t.deal_date, t.price_man from apt_trades t
    where t.apt_seq = c.apt_seq and t.area_type = a.area_type and not t.is_cancelled and t.missing_since is null
    order by t.price_man desc, t.deal_date desc limit 1
  ) p on true
  left join lateral (
    select round(percentile_cont(0.5) within group (order by r.deposit_man))::int as med6, count(*)::int as n6,
           round(percentile_cont(0.5) within group (order by r.deposit_man) filter (where r.contract_type is distinct from '갱신'))::int as new_med6,
           count(*) filter (where r.contract_type is distinct from '갱신')::int as new_n6
    from apt_rents r
    where r.apt_seq = c.apt_seq and r.area_type = a.area_type and r.rent_type = '전세'
      and r.missing_since is null and r.deal_date >= current_date - interval '6 months'
  ) j on true
  left join lateral (
    select ev.type, ev.deal_date, ev.change_pct from events ev
    where ev.apt_seq = c.apt_seq and ev.invalidated_at is null
    order by ev.deal_date desc, ev.id desc limit 1
  ) e on true
  where c.apt_seq = any(p_apt_seqs)
$$;

-- ---------- 단지 순위: 전세가율·갭용 12개월 전세 중위 (갱신 제외) ----------

drop function complex_rank(int, smallint, char);
create function complex_rank(p_group_id int, p_area_band smallint, p_end char(6))
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               trades_12m int, median_12m int, ppa_12m int,
               recent_median int, recent_count int, year_ago_median int, year_ago_count int,
               peak_price int, peak_date date, households int, trades_all_12m int,
               jeonse_median_12m int, jeonse_count_12m int)
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
  ),
  j as (
    select r.apt_seq,
           round(percentile_cont(0.5) within group (order by r.deposit_man))::int as med12,
           count(*)::int as n12
    from apt_rents r
    where r.region_id in (select id from regions where p_group_id is null or group_id = p_group_id)
      and (p_area_band is null or r.area_band = p_area_band)
      and r.deal_ymd > ym_add(p_end, -12) and r.deal_ymd <= p_end
      and r.rent_type = '전세' and r.contract_type is distinct from '갱신' and r.missing_since is null
    group by r.apt_seq
  )
  select c.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, c.build_year,
         a.n12, round(a.med12)::int, round(a.ppa12)::int,
         round(a.med_r)::int, a.n_r, round(a.med_y)::int, a.n_y,
         a.peak, a.peak_date, ci.households,
         (select count(*)::int from apt_trades t2
           where t2.apt_seq = a.apt_seq and not t2.is_cancelled and t2.missing_since is null
             and t2.deal_date >= to_date(ym_add(p_end, -11), 'YYYYMM')
             and t2.deal_date < to_date(ym_add(p_end, 1), 'YYYYMM')),
         j.med12, coalesce(j.n12, 0)
  from a
  join complexes c on c.apt_seq = a.apt_seq
  join regions rg on rg.id = c.region_id
  left join complex_info ci on ci.apt_seq = a.apt_seq
  left join j on j.apt_seq = a.apt_seq
  where a.n12 > 0
$$;

revoke execute on function trend_monthly(int, smallint, char, char) from public, anon, authenticated;
revoke execute on function complex_stats(text[])                    from public, anon, authenticated;
revoke execute on function complex_rank(int, smallint, char)        from public, anon, authenticated;
