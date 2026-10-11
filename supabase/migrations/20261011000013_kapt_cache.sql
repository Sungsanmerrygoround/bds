-- =========================================================
-- K-apt 단지 정보 캐시: 단지마다 받은 즉시 저장해 두고, 짝짓기는 이 표로 한다.
-- K-apt API가 가끔 수십 번 호출 후 한동안 오류(04)를 내서 한 번에 다 받는 방식은 자주 끊긴다.
-- 수집은 없는 단지·오래된 단지만 조금씩 채우므로 중간에 끊겨도 다음 실행이 이어 받는다.
-- =========================================================

create table kapt_complexes (
  kapt_code    text primary key,
  kapt_name    text not null,
  lawd_cd      char(5) not null,
  bjd_code     text not null,          -- 10자리 법정동코드
  dong         text not null,          -- 법정동 이름
  kapt_addr    text,                   -- 지번 주소
  jibun        text,                   -- kapt_addr에서 읽은 지번 (정규화)
  households   int,
  dong_count   int,
  top_floor    int,
  use_date     date,
  heat_type    text,
  parking      int,
  road_addr    text,
  is_listed    boolean not null default true,  -- 최근 목록에 있었는지 (목록에서 빠진 단지는 짝짓기 제외)
  basis_at     timestamptz,            -- 기본정보 받은 시각 (null = 아직 못 받음)
  parking_at   timestamptz,            -- 주차(상세정보) 받은 시각
  listed_at    timestamptz not null default now()
);
create index on kapt_complexes (lawd_cd);
alter table kapt_complexes enable row level security;
