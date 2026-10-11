-- =========================================================
-- 송파 지역 제외 (2026-10-11 결정: DB 용량. 송파가 전월세 행의 1/3로 가장 큼)
-- 송파 시군구(11710)의 거래·단지·입주·지수·K-apt 데이터와 지역 설정을 지운다.
-- 다시 넣으려면: region_groups·regions에 송파(11710, R-ONE 50069)를 추가하고
--   npm run ingest -- backfill --lawd 11710 --from 202110 --to <이번 달>, supply, index, kapt 실행.
-- 디스크 공간은 VACUUM FULL로 따로 돌려받는다 (트랜잭션 안에서 못 돌려 마이그레이션 밖에서 실행).
-- =========================================================

do $$
declare
  rid int;
  gid int;
begin
  select id, group_id into rid, gid from regions where lawd_cd = '11710';
  if rid is null then
    return;
  end if;

  delete from events      where apt_seq in (select apt_seq from complexes where region_id = rid or lawd_cd = '11710');
  delete from apt_trades  where region_id = rid or lawd_cd = '11710';
  delete from apt_rents   where region_id = rid or lawd_cd = '11710';
  -- complex_info·complex_kapt_override·complex_aliases·favorites·interest_group_members는 on delete cascade
  delete from complexes   where region_id = rid or lawd_cd = '11710';
  delete from supply_projects    where region_id = rid;
  delete from manual_supply      where region_id = rid;
  delete from price_index_weekly where region_id = rid;
  delete from kapt_complexes     where lawd_cd = '11710';
  delete from regions where id = rid;
  delete from region_groups where id = gid and not exists (select 1 from regions where group_id = gid);
end $$;
