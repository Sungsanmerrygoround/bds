-- =========================================================
-- 한국부동산원 주간 아파트 가격지수 (R-ONE, 시군구 단위)
--   sale   매매가격지수  T244183132827305
--   jeonse 전세가격지수  T247713133046872
-- 주차 기준일(week_date)은 월요일, 발표는 그 주 목요일.
-- 지수는 구 전체 기준이라 regions.exclude_dongs(구성남 창곡동 제외 등)는 반영되지 않는다.
-- =========================================================

alter table regions add column reb_cls_id int; -- R-ONE 지역 분류 ID (CLS_ID)

update regions set reb_cls_id = v.cls
from (values ('41117', 50087), ('41173', 50074), ('41131', 50078), ('41133', 50079), ('11740', 50070), ('11710', 50069)) as v(lawd, cls)
where regions.lawd_cd = v.lawd;

create table price_index_weekly (
  region_id   int  not null references regions(id),
  kind        text not null check (kind in ('sale', 'jeonse')),
  week_date   date not null check (extract(isodow from week_date) = 1),
  value       numeric(10,5) not null,
  updated_at  timestamptz not null default now(),
  primary key (region_id, kind, week_date)
);
alter table price_index_weekly enable row level security;
