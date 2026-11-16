-- 월세 분석: 월별 전세·월세 계약 수(월세 비중), 월세 보증금·월세 중위, 전월세 전환율.
--
-- 전월세 전환율 = 월세 × 12 ÷ (기준 전세 − 월세 보증금) × 100.
-- 기준 전세 = 같은 단지·같은 전용면적의 계약일 전후 90일 전세 중위(갱신 제외). 기준 전세가 없거나 보증금 이하면 계산에서 뺀다.
-- 월별 값은 계약별 전환율의 중위라, 보증금이 전세에 가까워 분모가 작은 계약이 튀어도 덜 흔들린다.
-- 갱신 제외(new_*) = 계약 구분이 '갱신'이 아닌 계약 (구분 없는 행 포함). 전환율·월세 중위는 갱신 제외 기준.

create function rent_monthly(p_group_id int, p_area_band smallint, p_from char(6), p_to char(6))
returns table (ym char(6), jeonse_count int, wolse_count int, jeonse_new_count int, wolse_new_count int,
               wolse_deposit_median int, wolse_rent_median int, conv_rate_median numeric, conv_count int)
language sql stable as $$
  -- 건수는 정렬 없이 세고(m), 중위값·전환율은 갱신 아닌 월세 계약만 따로 훑는다(c): 한 번에 모으면 전체 행을 정렬하느라 느리다.
  with rg as (select id from regions where p_group_id is null or group_id = p_group_id),
  m as (
    select deal_ymd as ym,
           count(*) filter (where rent_type = '전세')::int as jeonse_count,
           count(*) filter (where rent_type = '월세')::int as wolse_count,
           count(*) filter (where rent_type = '전세' and contract_type is distinct from '갱신')::int as jeonse_new_count,
           count(*) filter (where rent_type = '월세' and contract_type is distinct from '갱신')::int as wolse_new_count
    from apt_rents
    where region_id in (select id from rg)
      and (p_area_band is null or area_band = p_area_band)
      and deal_ymd between p_from and p_to
      and missing_since is null
    group by deal_ymd
  ),
  c as (
    select w.deal_ymd as ym,
           round(percentile_cont(0.5) within group (order by w.deposit_man))::int as deposit_median,
           round(percentile_cont(0.5) within group (order by w.monthly_rent_man))::int as rent_median,
           round((percentile_cont(0.5) within group (order by w.monthly_rent_man * 1200.0 / nullif(j.ref - w.deposit_man, 0))
                  filter (where j.ref > w.deposit_man))::numeric, 2) as rate,
           count(*) filter (where j.ref > w.deposit_man)::int as n
    from apt_rents w
    left join lateral (
      select percentile_cont(0.5) within group (order by x.deposit_man) as ref
      from apt_rents x
      where x.apt_seq = w.apt_seq and x.area_type = w.area_type
        and x.deal_date between w.deal_date - 90 and w.deal_date + 90
        and x.contract_type is distinct from '갱신'
        and x.rent_type = '전세' and x.missing_since is null
    ) j on true
    where w.region_id in (select id from rg)
      and (p_area_band is null or w.area_band = p_area_band)
      and w.deal_ymd between p_from and p_to
      and w.missing_since is null
      and w.rent_type = '월세' and w.contract_type is distinct from '갱신'
    group by w.deal_ymd
  )
  select m.ym, m.jeonse_count, m.wolse_count, m.jeonse_new_count, m.wolse_new_count,
         c.deposit_median, c.rent_median, c.rate, coalesce(c.n, 0)
  from m left join c on c.ym = m.ym
  order by 1
$$;

revoke execute on function rent_monthly(int, smallint, char, char) from public, anon, authenticated;
