-- '새로 신고된 거래'와 '해제된 거래(신고가 후 해제)' 화면용 조회.

-- ---------- 새로 신고된 거래 ----------
-- first_seen_at = 수집에서 처음 본 시각. 계약 후 30일 안에 신고하므로 계약일 순으로는 새 거래가 지난달 사이사이에 끼어 안 보인다.

create index if not exists apt_rents_first_seen_at_idx on apt_rents (first_seen_at);

-- 매매: 같은 단지·같은 전용면적의 직전 유효 거래(계약일이 더 이른 것 중 가장 최근)와 신고가·하락 여부를 붙인다.
create function new_trades(p_since timestamptz, p_group_id int, p_limit int default 500)
returns table (id bigint, first_seen_at timestamptz, apt_seq text, apt_nm text, umd_nm text, sigungu_name text,
               area_type numeric, floor int, deal_date date, price_man int, is_direct boolean, is_cancelled boolean,
               prev_price int, prev_date date, event_type text, event_pct numeric)
language sql stable as $$
  select t.id, t.first_seen_at, t.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name,
         t.area_type, t.floor, t.deal_date, t.price_man, t.is_direct, t.is_cancelled,
         p.price_man, p.deal_date, e.type, e.change_pct
  from apt_trades t
  join complexes c on c.apt_seq = t.apt_seq
  join regions rg on rg.id = t.region_id
  left join lateral (
    select x.price_man, x.deal_date from apt_trades x
    where x.apt_seq = t.apt_seq and x.area_type = t.area_type and x.deal_date < t.deal_date
      and not x.is_cancelled and x.missing_since is null
    order by x.deal_date desc, x.id desc limit 1
  ) p on true
  left join lateral (
    select ev.type, ev.change_pct from events ev
    where ev.trade_id = t.id and ev.invalidated_at is null
    order by ev.type desc limit 1
  ) e on true
  where t.first_seen_at >= p_since and t.missing_since is null
    and (p_group_id is null or rg.group_id = p_group_id)
  order by t.first_seen_at desc, t.deal_date desc, t.id desc
  limit p_limit
$$;

create function new_rents(p_since timestamptz, p_group_id int, p_limit int default 500)
returns table (id bigint, first_seen_at timestamptz, apt_seq text, apt_nm text, umd_nm text, sigungu_name text,
               area_type numeric, floor int, deal_date date, deposit_man int, monthly_rent_man int,
               contract_type text, use_rr_right boolean, pre_deposit_man int, pre_monthly_rent_man int)
language sql stable as $$
  select r.id, r.first_seen_at, r.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name,
         r.area_type, r.floor, r.deal_date, r.deposit_man, r.monthly_rent_man,
         r.contract_type, r.use_rr_right, r.pre_deposit_man, r.pre_monthly_rent_man
  from apt_rents r
  join complexes c on c.apt_seq = r.apt_seq
  join regions rg on rg.id = r.region_id
  where r.first_seen_at >= p_since and r.missing_since is null
    and (p_group_id is null or rg.group_id = p_group_id)
  order by r.first_seen_at desc, r.deal_date desc, r.id desc
  limit p_limit
$$;

-- ---------- 해제된 거래 ----------
-- 해제된 거래가 계약 당시 신고가였는지(직전 36개월 유효 거래 최고가 초과) 지금 데이터로 다시 계산한다.
-- events에는 수집을 시작한 뒤 판단한 거래만 있어서, 과거 해제 거래까지 보려면 직접 계산해야 한다.
-- 비교 기준은 detect_events의 신고가와 같다(같은 단지·같은 전용면적, 유효 거래만, new_high_lookback_months).
-- later_*: 계약일 뒤 ~ 해제일까지 같은 단지·면적에서 이어진 유효 거래 수와 최고가 (높은 가격이 뒤따랐는지).

create index if not exists apt_trades_cancelled_idx on apt_trades (cancel_date) where is_cancelled;

create function cancelled_trades(p_group_id int, p_since date, p_limit int default 500)
returns table (id bigint, apt_seq text, apt_nm text, umd_nm text, sigungu_name text,
               area_type numeric, floor int, deal_date date, cancel_date date, price_man int, is_direct boolean,
               prev_max int, prev_count int, later_count int, later_max int)
language sql stable as $$
  -- 설정값은 한 번만 읽는다 (조건식에 직접 쓰면 해제 거래마다 settings를 다시 조회한다)
  with cfg as materialized (select make_interval(months => setting_num('new_high_lookback_months', 36)::int) as lookback)
  select t.id, t.apt_seq, c.apt_nm, c.umd_nm, rg.sigungu_name,
         t.area_type, t.floor, t.deal_date, t.cancel_date, t.price_man, t.is_direct,
         p.mx, p.n, l.n, l.mx
  from apt_trades t
  join complexes c on c.apt_seq = t.apt_seq
  join regions rg on rg.id = t.region_id
  cross join lateral (
    select max(x.price_man) as mx, count(*)::int as n from apt_trades x
    where x.apt_seq = t.apt_seq and x.area_type = t.area_type
      and x.deal_date < t.deal_date
      and x.deal_date >= t.deal_date - (select lookback from cfg)
      and not x.is_cancelled and x.missing_since is null
  ) p
  cross join lateral (
    select max(x.price_man) as mx, count(*)::int as n from apt_trades x
    where x.apt_seq = t.apt_seq and x.area_type = t.area_type
      and x.deal_date > t.deal_date and x.deal_date <= t.cancel_date
      and not x.is_cancelled and x.missing_since is null
  ) l
  where t.is_cancelled and t.cancel_date >= p_since and t.missing_since is null
    and (p_group_id is null or rg.group_id = p_group_id)
  order by t.cancel_date desc, t.id desc
  limit p_limit
$$;

revoke execute on function new_trades(timestamptz, int, int)  from public, anon, authenticated;
revoke execute on function new_rents(timestamptz, int, int)   from public, anon, authenticated;
revoke execute on function cancelled_trades(int, date, int)   from public, anon, authenticated;
