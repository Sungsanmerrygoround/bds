-- =========================================================
-- 단지 순위 · 전세 갱신 분석 · 관심 단지 요약 (service role 전용)
-- p_group_id가 null이면 전체 지역.
-- =========================================================

-- YYYYMM ± n개월
create or replace function ym_add(p_ym char(6), p_months int) returns char(6)
language sql stable as $$
  select to_char(to_date(p_ym, 'YYYYMM') + make_interval(months => p_months), 'YYYYMM')
$$;

-- 단지 순위: 면적 구간 안 유효 매매 기준.
--   12개월(p_end 포함 끝 12개월) 거래 수·중위가·3.3㎡당 중위가
--   최근 3개월 중위 vs 1년 전 같은 3개월 중위 (1년 변동률)
--   전체 보유 기간 최고 거래가와 그 계약일
create or replace function complex_rank(p_group_id int, p_area_band smallint, p_end char(6))
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               trades_12m int, median_12m int, ppa_12m int,
               recent_median int, recent_count int, year_ago_median int, year_ago_count int,
               peak_price int, peak_date date)
language sql stable as $$
  with t as (
    select t.apt_seq, t.deal_ymd, t.deal_date, t.price_man, t.exclu_area
    from apt_trades t
    join regions rg on rg.id = t.region_id
    where (p_group_id is null or rg.group_id = p_group_id)
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
      max(price_man) as peak
    from t
    group by t.apt_seq
  )
  select c.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, c.build_year,
         a.n12, round(a.med12)::int, round(a.ppa12)::int,
         round(a.med_r)::int, a.n_r, round(a.med_y)::int, a.n_y,
         a.peak,
         (select max(t.deal_date) from t where t.apt_seq = a.apt_seq and t.price_man = a.peak)
  from a
  join complexes c on c.apt_seq = a.apt_seq
  join regions rg on rg.id = c.region_id
  where a.n12 > 0
$$;

-- 전세 갱신 분석 (월별). 계약 구분(신규/갱신)이 있는 전월세 계약 기준.
--   jeonse_renew: 전세 → 전세 갱신(종전·현재 월세 0, 종전 보증금 있음). 보증금 변동률은 이 계약들만.
create or replace function renewal_monthly(p_group_id int, p_area_band smallint, p_from char(6), p_to char(6))
returns table (ym char(6), new_count int, renew_count int, rr_count int,
               jeonse_renew_count int, change_median numeric, down_count int, up_count int)
language sql stable as $$
  with r as (
    select r.deal_ymd, r.contract_type, r.use_rr_right, r.deposit_man, r.pre_deposit_man,
           (r.contract_type = '갱신' and r.monthly_rent_man = 0 and coalesce(r.pre_monthly_rent_man, 0) = 0
            and r.pre_deposit_man > 0) as jr
    from apt_rents r
    join regions rg on rg.id = r.region_id
    where (p_group_id is null or rg.group_id = p_group_id)
      and (p_area_band is null or r.area_band = p_area_band)
      and r.deal_ymd between p_from and p_to
      and r.contract_type in ('신규', '갱신')
      and r.missing_since is null
  )
  select deal_ymd,
         count(*) filter (where contract_type = '신규')::int,
         count(*) filter (where contract_type = '갱신')::int,
         count(*) filter (where contract_type = '갱신' and use_rr_right)::int,
         count(*) filter (where jr)::int,
         round((percentile_cont(0.5) within group (order by (deposit_man::numeric / pre_deposit_man - 1) * 100) filter (where jr))::numeric, 2),
         count(*) filter (where jr and deposit_man < pre_deposit_man)::int,
         count(*) filter (where jr and deposit_man > pre_deposit_man)::int
  from r
  group by deal_ymd
  order by deal_ymd
$$;

-- 보증금을 낮춰 갱신한 전세 계약 (감액 폭 큰 순)
create or replace function renewal_drops(p_group_id int, p_area_band smallint, p_since date, p_limit int default 50)
returns table (id bigint, apt_seq text, apt_nm text, umd_nm text, sigungu_name text, area_type numeric,
               floor int, deal_date date, deposit_man int, pre_deposit_man int, change_pct numeric, use_rr_right boolean)
language sql stable as $$
  select r.id, r.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, r.area_type, r.floor, r.deal_date,
         r.deposit_man, r.pre_deposit_man,
         round((r.deposit_man::numeric / r.pre_deposit_man - 1) * 100, 1), r.use_rr_right
  from apt_rents r
  join regions rg on rg.id = r.region_id
  join complexes c on c.apt_seq = r.apt_seq
  where (p_group_id is null or rg.group_id = p_group_id)
    and (p_area_band is null or r.area_band = p_area_band)
    and r.deal_date >= p_since
    and r.contract_type = '갱신' and r.monthly_rent_man = 0 and coalesce(r.pre_monthly_rent_man, 0) = 0
    and r.pre_deposit_man > 0 and r.deposit_man < r.pre_deposit_man
    and r.missing_since is null
  order by r.deposit_man::numeric / r.pre_deposit_man, r.deal_date desc
  limit p_limit
$$;

-- 관심 단지 요약: 단지마다 최근 2년 매매가 가장 많은 전용면적(area_type) 하나를 골라 그 면적 기준으로 요약.
create or replace function complex_stats(p_apt_seqs text[])
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               area_type numeric, trades_12m int, last_date date, last_price int,
               trade_median_6m int, trade_count_6m int, jeonse_median_6m int, jeonse_count_6m int,
               peak_price int, peak_date date,
               event_type text, event_date date, event_pct numeric)
language sql stable as $$
  select c.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name, c.build_year,
         a.area_type, s.n12, l.deal_date, l.price_man,
         s.med6, s.n6, j.med6, j.n6, p.price_man, p.deal_date,
         e.type, e.deal_date, e.change_pct
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
    select round(percentile_cont(0.5) within group (order by r.deposit_man))::int as med6, count(*)::int as n6
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

-- 갱신 분석용 부분 커버링 인덱스 (계약 구분이 있는 유효 계약만)
create index if not exists apt_rents_renewal_idx on apt_rents (region_id, deal_ymd, area_band)
  include (contract_type, use_rr_right, deposit_man, pre_deposit_man, monthly_rent_man, pre_monthly_rent_man)
  where contract_type is not null and missing_since is null;

revoke execute on function ym_add(char, int)                            from public, anon, authenticated;
revoke execute on function complex_rank(int, smallint, char)           from public, anon, authenticated;
revoke execute on function renewal_monthly(int, smallint, char, char)  from public, anon, authenticated;
revoke execute on function renewal_drops(int, smallint, date, int)     from public, anon, authenticated;
revoke execute on function complex_stats(text[])                       from public, anon, authenticated;

-- 등기 확인용 주간 재수집(refresh)이 다시 받을 범위: 3~8개월 전 계약월
insert into settings (key, value, description) values
  ('refresh_months_from', '3', '주간 재수집: 몇 개월 전 계약월부터 (등기일 반영용)'),
  ('refresh_months_to',   '8', '주간 재수집: 몇 개월 전 계약월까지')
on conflict (key) do nothing;
