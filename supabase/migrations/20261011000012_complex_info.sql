-- =========================================================
-- 단지 기본정보 (K-apt 공동주택 기본·상세정보)
-- 실거래 단지(apt_seq)와 K-apt 단지(kaptCode)를 법정동+지번 → 이름 순으로 짝지어 저장한다.
-- K-apt는 의무관리 대상(대략 150세대 이상)만 있어 소규모 단지는 행이 없다.
-- =========================================================

create table complex_info (
  apt_seq       text primary key references complexes(apt_seq) on delete cascade,
  kapt_code     text not null,
  kapt_name     text,
  kapt_addr     text,                 -- K-apt 지번 주소 (짝짓기 확인용)
  households    int,                  -- 세대수
  dong_count    int,                  -- 동 수
  top_floor     int,                  -- 최고층
  use_date      date,                 -- 사용승인일
  heat_type     text,                 -- 난방 방식 (개별·지역·중앙)
  parking       int,                  -- 주차 대수 (지상+지하)
  road_addr     text,
  match_method  text not null check (match_method in ('jibun', 'name', 'manual')),
  match_score   numeric(4,3),         -- 이름 비슷한 정도 0~1 (수동은 1)
  updated_at    timestamptz not null default now()
);
create index on complex_info (kapt_code);

-- 자동 짝짓기가 틀리거나 못 찾을 때 직접 입력. kapt_code가 null이면 "짝 없음"으로 확정.
create table complex_kapt_override (
  apt_seq    text primary key references complexes(apt_seq) on delete cascade,
  kapt_code  text,
  note       text,
  created_at timestamptz not null default now()
);

alter table complex_info          enable row level security;
alter table complex_kapt_override enable row level security;

-- 단지 순위에 세대수를 붙인다 (반환 열이 바뀌어 drop 후 다시 만든다)
drop function complex_rank(int, smallint, char);
create function complex_rank(p_group_id int, p_area_band smallint, p_end char(6))
returns table (apt_seq text, apt_nm text, umd_nm text, sigungu_name text, build_year smallint,
               trades_12m int, median_12m int, ppa_12m int,
               recent_median int, recent_count int, year_ago_median int, year_ago_count int,
               peak_price int, peak_date date, households int)
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
         a.peak, a.peak_date, ci.households
  from a
  join complexes c on c.apt_seq = a.apt_seq
  join regions rg on rg.id = c.region_id
  left join complex_info ci on ci.apt_seq = a.apt_seq
  where a.n12 > 0
$$;

revoke execute on function complex_rank(int, smallint, char) from public, anon, authenticated;
