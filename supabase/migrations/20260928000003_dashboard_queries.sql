-- =========================================================
-- 대시보드 조회용 집계 함수 (service role 전용)
-- =========================================================

-- 지역 그룹 · 면적 구간별 월간 매매 중위가 / 전세 중위가 (만원).
-- 해제 거래·재조회에서 사라진 행은 제외. p_area_band가 null이면 전체 면적.
-- 거래가 없는 달은 행이 없다(화면에서 빈 달을 채운다).
create or replace function trend_monthly(p_group_id int, p_area_band smallint, p_from char(6), p_to char(6))
returns table (ym char(6), trade_median int, trade_count int, jeonse_median int, jeonse_count int)
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
           count(*)::int as cnt
    from apt_rents
    where region_id in (select id from r)
      and (p_area_band is null or area_band = p_area_band)
      and deal_ymd between p_from and p_to
      and rent_type = '전세' and missing_since is null
    group by deal_ymd
  )
  select coalesce(t.ym, j.ym), t.med, coalesce(t.cnt, 0), j.med, coalesce(j.cnt, 0)
  from t full join j on t.ym = j.ym
  order by 1
$$;

-- 단지별 거래 요약 (검색 목록용): 최근 12개월 매매 건수, 최근 거래일
create or replace function complex_search(p_q text, p_group_id int, p_limit int default 50)
returns table (apt_seq text, apt_nm text, umd_nm text, build_year smallint, sigungu_name text,
               trades_12m int, last_deal_date date)
language sql stable as $$
  select c.apt_seq, c.apt_nm, c.umd_nm, c.build_year, rg.sigungu_name,
         coalesce(s.cnt, 0), s.last_date
  from complexes c
  join regions rg on rg.id = c.region_id
  left join lateral (
    select count(*) filter (where t.deal_date >= current_date - interval '12 months')::int as cnt,
           max(t.deal_date) as last_date
    from apt_trades t
    where t.apt_seq = c.apt_seq and not t.is_cancelled and t.missing_since is null
  ) s on true
  where (p_q is null or p_q = '' or c.apt_nm ilike '%' || p_q || '%'
         or exists (select 1 from complex_aliases a where a.apt_seq = c.apt_seq and a.alias ilike '%' || p_q || '%'))
    and (p_group_id is null or rg.group_id = p_group_id)
  order by coalesce(s.cnt, 0) desc, c.apt_nm
  limit p_limit
$$;

revoke execute on function trend_monthly(int, smallint, char, char)  from public, anon, authenticated;
revoke execute on function complex_search(text, int, int)            from public, anon, authenticated;
