-- =========================================================
-- 신고가·하락 판단 + 기본 설정/지역 시드
-- =========================================================

create or replace function setting_num(p_key text, p_default numeric) returns numeric
language sql stable as $$
  select coalesce((select (value #>> '{}')::numeric from settings where key = p_key), p_default)
$$;

-- 주어진 거래들에 대해 이벤트를 판단한다. 판단 단위: 같은 단지 + 같은 area_type(소수 첫째 자리).
-- 비교 대상은 "그 거래 계약일보다 앞선" 거래만 (늦게 신고된 거래도 계약일 기준으로 판단).
-- 해제 거래, 재조회에서 사라진 거래는 판단 대상과 비교 대상 모두에서 제외.
create or replace function detect_events(p_trade_ids bigint[]) returns int
language plpgsql as $$
declare
  v_high_months int     := setting_num('new_high_lookback_months', 36)::int;
  v_drop_months int     := setting_num('drop_lookback_months', 6)::int;
  v_drop_pct    numeric := setting_num('drop_threshold_pct', -10);
  v_min_samples int     := setting_num('drop_min_samples', 3)::int;
  v_count int := 0;
  v_rows  int;
begin
  -- 신고가: 직전 N개월(기본 36) 같은 타입 최고가 초과. 비교 거래가 없으면 판단하지 않음.
  insert into events (trade_id, type, apt_seq, area_type, deal_date, price_man,
                      ref_price_man, ref_sample_count, change_pct, is_direct)
  select t.id, 'NEW_HIGH', t.apt_seq, t.area_type, t.deal_date, t.price_man,
         h.max_price, h.cnt, round((t.price_man::numeric / h.max_price - 1) * 100, 2), t.is_direct
  from apt_trades t
  cross join lateral (
    select max(p.price_man) as max_price, count(*)::int as cnt
    from apt_trades p
    where p.apt_seq = t.apt_seq and p.area_type = t.area_type
      and not p.is_cancelled and p.missing_since is null
      and p.deal_date <  t.deal_date
      and p.deal_date >= t.deal_date - make_interval(months => v_high_months)
  ) h
  where t.id = any(p_trade_ids)
    and not t.is_cancelled and t.missing_since is null
    and h.cnt > 0 and t.price_man > h.max_price
  on conflict (trade_id, type) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- 하락: 직전 N개월(기본 6) 같은 타입 중위가 대비 threshold(기본 -10%) 이하. 표본 최소 건수(기본 3) 필요.
  insert into events (trade_id, type, apt_seq, area_type, deal_date, price_man,
                      ref_price_man, ref_sample_count, change_pct, is_direct)
  select t.id, 'DROP', t.apt_seq, t.area_type, t.deal_date, t.price_man,
         round(m.median_price)::int, m.cnt,
         round((t.price_man::numeric / m.median_price - 1) * 100, 2), t.is_direct
  from apt_trades t
  cross join lateral (
    select percentile_cont(0.5) within group (order by p.price_man)::numeric as median_price,
           count(*)::int as cnt
    from apt_trades p
    where p.apt_seq = t.apt_seq and p.area_type = t.area_type
      and not p.is_cancelled and p.missing_since is null
      and p.deal_date <  t.deal_date
      and p.deal_date >= t.deal_date - make_interval(months => v_drop_months)
  ) m
  where t.id = any(p_trade_ids)
    and not t.is_cancelled and t.missing_since is null
    and m.cnt >= v_min_samples
    and (t.price_man::numeric / m.median_price - 1) * 100 <= v_drop_pct
  on conflict (trade_id, type) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  return v_count;
end $$;

-- 해제되거나 재조회에서 사라진 거래의 이벤트를 무효 처리 (삭제하지 않음). 되살아나면 복구.
create or replace function refresh_event_validity() returns int
language plpgsql as $$
declare v_rows int;
begin
  update events e
     set invalidated_at = case when t.is_cancelled or t.missing_since is not null
                               then coalesce(e.invalidated_at, now()) end
    from apt_trades t
   where t.id = e.trade_id
     and (e.invalidated_at is null) = (t.is_cancelled or t.missing_since is not null);
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke execute on function detect_events(bigint[])      from public, anon, authenticated;
revoke execute on function refresh_event_validity()     from public, anon, authenticated;
revoke execute on function setting_num(text, numeric)   from public, anon, authenticated;

-- ---------- 시드 ----------

insert into settings (key, value, description) values
  ('new_high_lookback_months', '36',  '신고가 판단: 직전 몇 개월 최고가와 비교'),
  ('drop_lookback_months',     '6',   '하락 판단: 직전 몇 개월 중위가와 비교'),
  ('drop_threshold_pct',       '-10', '하락 판단 기준(%). 이 값 이하이면 하락 거래'),
  ('drop_min_samples',         '3',   '하락 판단에 필요한 최소 비교 거래 수'),
  ('daily_lookback_months',    '3',   '일일 증분 수집 시 다시 받을 개월 수'),
  ('min_area_m2',              '55',  '이 면적 미만 거래는 저장하지 않음(수집 스크립트 기준)');

insert into region_groups (name, sort_order) values
  ('영통', 1), ('평촌·범계', 2), ('구성남', 3), ('강동', 4), ('송파', 5);

insert into regions (group_id, sigungu_name, lawd_cd, exclude_dongs, supply_address_patterns, sort_order)
select g.id, v.sigungu_name, v.lawd_cd, v.exclude_dongs, v.patterns, v.sort_order
from (values
  ('영통',      '수원시 영통구', '41117', '{}'::text[],       '{수원시 영통구}'::text[], 1),
  ('평촌·범계', '안양시 동안구', '41173', '{}'::text[],       '{안양시 동안구}'::text[], 2),
  ('구성남',    '성남시 수정구', '41131', '{창곡동}'::text[], '{성남시 수정구}'::text[], 3),
  ('구성남',    '성남시 중원구', '41133', '{}'::text[],       '{성남시 중원구}'::text[], 4),
  ('강동',      '서울 강동구',   '11740', '{}'::text[],       '{서울특별시 강동구,서울시 강동구,서울 강동구}'::text[], 5),
  ('송파',      '서울 송파구',   '11710', '{}'::text[],       '{서울특별시 송파구,서울시 송파구,서울 송파구}'::text[], 6)
) as v(group_name, sigungu_name, lawd_cd, exclude_dongs, patterns, sort_order)
join region_groups g on g.name = v.group_name;
