-- =========================================================
-- BDS: 아파트 실거래·입주물량 대시보드 초기 스키마
-- 금액 단위: 만원(정수). 화면에서 억 원으로 변환.
-- RLS: 모든 테이블 활성화 + anon/authenticated 정책 없음 → service role만 접근.
-- =========================================================

-- ---------- 공통 함수 ----------

-- 면적 구간. 55㎡ 미만은 수집 단계에서 저장하지 않으므로 null은 방어용.
create or replace function area_band(a numeric) returns smallint
language sql immutable parallel safe as $$
  select case
    when a is null or a < 55 then null
    when a < 65  then 59
    when a < 80  then 74
    when a < 90  then 84
    when a < 115 then 100
    when a < 140 then 125
    else 150
  end::smallint
$$;

-- ---------- 설정 ----------

create table region_groups (
  id          serial primary key,
  name        text not null unique,
  sort_order  int  not null default 0
);

-- 하나의 lawd_cd가 법정동 기준으로 여러 그룹에 나뉘어 들어갈 수도 있다.
-- 거래 행은 include_dongs/exclude_dongs로 첫 번째로 매칭되는 region에 배정된다.
create table regions (
  id                      serial primary key,
  group_id                int  not null references region_groups(id),
  sigungu_name            text not null,              -- 표시용: '수원시 영통구'
  lawd_cd                 char(5) not null,
  include_dongs           text[] not null default '{}', -- 비어 있으면 전체 포함
  exclude_dongs           text[] not null default '{}',
  supply_address_patterns text[] not null default '{}', -- 청약홈 주소 매칭용 부분 문자열
  is_active               boolean not null default true,
  sort_order              int not null default 0,
  unique (group_id, lawd_cd)
);

create table settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ---------- 단지 ----------

create table complexes (
  apt_seq     text primary key,              -- API aptSeq (예: '41117-49')
  region_id   int references regions(id),
  lawd_cd     char(5) not null,
  umd_nm      text,
  umd_cd      text,
  jibun       text,
  road_nm     text,
  apt_nm      text not null,                 -- 공식 명칭(API 최신값)
  build_year  smallint,
  updated_at  timestamptz not null default now()
);
create index on complexes (region_id);

create table complex_aliases (
  alias    text primary key,
  apt_seq  text not null references complexes(apt_seq) on delete cascade
);
create index on complex_aliases (apt_seq);

create table interest_groups (
  id          serial primary key,
  name        text not null unique,
  note        text,
  created_at  timestamptz not null default now()
);

create table interest_group_members (
  group_id  int  not null references interest_groups(id) on delete cascade,
  apt_seq   text not null references complexes(apt_seq) on delete cascade,
  primary key (group_id, apt_seq)
);

create table favorites (
  apt_seq     text primary key references complexes(apt_seq) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------- 거래 (매매 / 전월세 완전 분리) ----------

create table apt_trades (
  id              bigserial primary key,
  trade_key       text not null unique,       -- 불변 필드 해시 + '#순번'
  apt_seq         text not null references complexes(apt_seq),
  region_id       int  not null references regions(id),
  lawd_cd         char(5) not null,
  deal_ymd        char(6) not null,           -- 조회 단위(YYYYMM)
  deal_date       date not null,
  price_man       int  not null,
  exclu_area      numeric(9,4) not null,      -- 원래 값
  area_type       numeric(6,1) generated always as (round(exclu_area, 1)) stored,
  area_band       smallint     generated always as (area_band(exclu_area)) stored,
  floor           int,
  apt_dong        text,
  dealing_type    text check (dealing_type in ('중개', '직거래')),
  is_direct       boolean generated always as (dealing_type = '직거래') stored,
  is_cancelled    boolean not null default false,
  cancel_date     date,
  rgst_date       date,
  buyer_gbn       text,
  seller_gbn      text,
  land_leasehold  boolean,
  raw             jsonb not null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  missing_since   timestamptz                 -- 재조회 응답에서 사라진 시점(정정/철회)
);
create index on apt_trades (lawd_cd, deal_ymd);
create index on apt_trades (apt_seq, area_type, deal_date);
create index on apt_trades (region_id, area_band, deal_date);
create index on apt_trades (first_seen_at);

create table apt_rents (
  id                    bigserial primary key,
  rent_key              text not null unique,
  apt_seq               text not null references complexes(apt_seq),
  region_id             int  not null references regions(id),
  lawd_cd               char(5) not null,
  deal_ymd              char(6) not null,
  deal_date             date not null,
  deposit_man           int  not null,
  monthly_rent_man      int  not null default 0,
  rent_type             text generated always as (case when monthly_rent_man = 0 then '전세' else '월세' end) stored,
  exclu_area            numeric(9,4) not null,
  area_type             numeric(6,1) generated always as (round(exclu_area, 1)) stored,
  area_band             smallint     generated always as (area_band(exclu_area)) stored,
  floor                 int,
  contract_type         text,          -- 신규 / 갱신
  contract_term         text,          -- 예: '26.09~28.09'
  use_rr_right          boolean,       -- 갱신요구권 사용
  pre_deposit_man       int,
  pre_monthly_rent_man  int,
  raw                   jsonb not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  missing_since         timestamptz
);
create index on apt_rents (lawd_cd, deal_ymd);
create index on apt_rents (apt_seq, area_type, deal_date);
create index on apt_rents (region_id, area_band, rent_type, deal_date);

-- ---------- 신고가·하락 이벤트 ----------

create table events (
  id                bigserial primary key,
  trade_id          bigint not null references apt_trades(id) on delete cascade,
  type              text   not null check (type in ('NEW_HIGH', 'DROP')),
  apt_seq           text   not null references complexes(apt_seq),
  area_type         numeric(6,1) not null,
  deal_date         date not null,
  price_man         int  not null,
  ref_price_man     int  not null,          -- NEW_HIGH: 직전 36개월 최고가 / DROP: 직전 6개월 중위가
  ref_sample_count  int  not null,
  change_pct        numeric(6,2) not null,
  is_direct         boolean not null,
  detected_at       timestamptz not null default now(),
  invalidated_at    timestamptz,            -- 이후 해제·누락되면 기록
  unique (trade_id, type)
);
create index on events (detected_at desc);
create index on events (apt_seq);

-- ---------- 입주 물량 ----------

create table supply_projects (
  house_manage_no          text primary key,
  pblanc_no                text,
  house_nm                 text not null,
  address                  text not null,
  region_id                int references regions(id),
  house_secd_nm            text,          -- APT / 신혼희망타운 / 민간사전청약
  rent_secd_nm             text,          -- 분양주택 / 분양전환 불가임대 / 분양전환 가능임대
  households               int  not null, -- 청약홈 공급세대수(분양분)
  total_households_override int,          -- 재건축 등 총 세대수 보정(직접 입력)
  move_in_ym               char(6) not null,
  announce_date            date,
  pblanc_url               text,
  is_excluded              boolean not null default false,
  exclude_reason           text,
  raw                      jsonb not null,
  updated_at               timestamptz not null default now()
);
create index on supply_projects (region_id, move_in_ym);

create table manual_supply (
  id          serial primary key,
  region_id   int  not null references regions(id),
  name        text not null,
  ym          char(6) not null,
  households  int  not null check (households > 0),
  kind        text not null check (kind in ('입주', '이주')),
  note        text,
  created_at  timestamptz not null default now()
);
create index on manual_supply (region_id, ym);

-- ---------- 수집 이력 ----------

create table ingest_runs (
  id              bigserial primary key,
  batch_id        uuid not null,
  job             text not null,             -- backfill / daily / supply
  source          text not null check (source in ('trade', 'rent', 'supply')),
  lawd_cd         char(5),
  deal_ymd        char(6),
  status          text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  fetched         int not null default 0,    -- API 응답 건수
  skipped         int not null default 0,    -- 55㎡ 미만 / 지역 외 법정동
  upserted        int not null default 0,
  inserted        int not null default 0,
  marked_missing  int not null default 0,
  events_created  int not null default 0,
  api_calls       int not null default 0,
  error           text
);
create index on ingest_runs (started_at desc);
create index on ingest_runs (batch_id);

create view api_calls_daily as
  select (started_at at time zone 'Asia/Seoul')::date as day_kst,
         sum(api_calls)::int as api_calls,
         count(*) filter (where status = 'error')::int as errors
  from ingest_runs
  group by 1;

-- ---------- RLS ----------
alter table region_groups           enable row level security;
alter table regions                 enable row level security;
alter table settings                enable row level security;
alter table complexes               enable row level security;
alter table complex_aliases         enable row level security;
alter table interest_groups         enable row level security;
alter table interest_group_members  enable row level security;
alter table favorites               enable row level security;
alter table apt_trades              enable row level security;
alter table apt_rents               enable row level security;
alter table events                  enable row level security;
alter table supply_projects         enable row level security;
alter table manual_supply           enable row level security;
alter table ingest_runs             enable row level security;
-- 뷰는 소유자 권한으로 실행되므로 anon에게서 명시적으로 회수
revoke all on api_calls_daily from anon, authenticated;
