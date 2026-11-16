-- '새로 신고된 거래'를 단지 목록으로 좁혀 볼 수 있게 한다 (관심 단지의 새 거래).
-- p_apt_seqs가 null이면 전체, 배열이면 그 단지들만. 관심 단지는 브라우저 쿠키에 있어 화면이 목록을 넘겨준다.

drop function new_trades(timestamptz, int, int);
create function new_trades(p_since timestamptz, p_group_id int, p_limit int default 500, p_apt_seqs text[] default null)
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
    and (p_apt_seqs is null or t.apt_seq = any(p_apt_seqs))
  order by t.first_seen_at desc, t.deal_date desc, t.id desc
  limit p_limit
$$;

drop function new_rents(timestamptz, int, int);
create function new_rents(p_since timestamptz, p_group_id int, p_limit int default 500, p_apt_seqs text[] default null)
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
    and (p_apt_seqs is null or r.apt_seq = any(p_apt_seqs))
  order by r.first_seen_at desc, r.deal_date desc, r.id desc
  limit p_limit
$$;

revoke execute on function new_trades(timestamptz, int, int, text[]) from public, anon, authenticated;
revoke execute on function new_rents(timestamptz, int, int, text[])  from public, anon, authenticated;
