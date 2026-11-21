-- 정리: 쓰지 않는 표·인덱스 삭제, plpgsql 함수 search_path 고정
--
-- 1) 처음 설계에만 있고 코드에서 쓰지 않는 표 (모두 0행이었음, 2026-11-21 확인).
--    관심 단지는 DB가 아니라 브라우저 쿠키(bds_fav)에 둔다.
drop table if exists interest_group_members;
drop table if exists interest_groups;
drop table if exists favorites;
drop table if exists complex_aliases;

-- 2) complex_info를 kapt_code로 찾는 조회가 없다 (짝짓기는 kapt_complexes·override로 한다)
drop index if exists complex_info_kapt_code_idx;

-- 3) Supabase 점검의 'search_path 고정 안 됨' 경고: plpgsql 함수만 고정한다.
--    SQL 함수(화면 집계 함수, area_band·ym_add 등)는 SET 절이 붙으면 planner가 본문을 호출한 쿼리에 펼쳐 넣지(inline)
--    못해 조회가 느려질 수 있어 그대로 둔다. 어차피 서버 키로만 호출되고 anon에는 실행 권한이 없다.
--    (create or replace로 함수를 다시 만들면 이 설정도 다시 적어야 한다)
alter function detect_events(bigint[]) set search_path = public, pg_temp;
alter function refresh_event_validity() set search_path = public, pg_temp;
