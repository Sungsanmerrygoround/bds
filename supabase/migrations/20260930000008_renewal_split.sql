-- 전세 갱신 보증금 변동률을 갱신요구권 사용/미사용으로 나눈다.
-- 요구권 갱신은 인상 상한 5%라 중위가 +5%에 붙어 시장 흐름이 안 보인다 → 합의 갱신(미사용)을 따로 본다.
drop function if exists renewal_monthly(int, smallint, char, char);

create function renewal_monthly(p_group_id int, p_area_band smallint, p_from char(6), p_to char(6))
returns table (ym char(6), new_count int, renew_count int, rr_count int,
               jeonse_renew_count int, change_median numeric, down_count int, up_count int,
               free_count int, free_change_median numeric, rr_jeonse_count int, rr_change_median numeric)
language sql stable as $$
  with r as (
    select r.deal_ymd, r.contract_type, coalesce(r.use_rr_right, false) as rr, r.deposit_man, r.pre_deposit_man,
           (r.contract_type = '갱신' and r.monthly_rent_man = 0 and coalesce(r.pre_monthly_rent_man, 0) = 0
            and r.pre_deposit_man > 0) as jr
    from apt_rents r
    join regions rg on rg.id = r.region_id
    where (p_group_id is null or rg.group_id = p_group_id)
      and (p_area_band is null or r.area_band = p_area_band)
      and r.deal_ymd between p_from and p_to
      and r.contract_type in ('신규', '갱신')
      and r.missing_since is null
  ),
  c as (select *, (deposit_man::numeric / nullif(pre_deposit_man, 0) - 1) * 100 as chg from r)
  select deal_ymd,
         count(*) filter (where contract_type = '신규')::int,
         count(*) filter (where contract_type = '갱신')::int,
         count(*) filter (where contract_type = '갱신' and rr)::int,
         count(*) filter (where jr)::int,
         round((percentile_cont(0.5) within group (order by chg) filter (where jr))::numeric, 2),
         count(*) filter (where jr and deposit_man < pre_deposit_man)::int,
         count(*) filter (where jr and deposit_man > pre_deposit_man)::int,
         count(*) filter (where jr and not rr)::int,
         round((percentile_cont(0.5) within group (order by chg) filter (where jr and not rr))::numeric, 2),
         count(*) filter (where jr and rr)::int,
         round((percentile_cont(0.5) within group (order by chg) filter (where jr and rr))::numeric, 2)
  from c
  group by deal_ymd
  order by deal_ymd
$$;

revoke execute on function renewal_monthly(int, smallint, char, char) from public, anon, authenticated;
