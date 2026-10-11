-- =========================================================
-- 금리 (한국은행 ECOS, 월별·전국)
--   base     기준금리                       722Y001 / 0101000
--   mortgage 예금은행 주택담보대출(신규취급액) 121Y006 / BECBLA0302  (한 달 늦게 발표)
-- 수집 출처를 ingest_runs.source에 추가: rate(금리), index(부동산원 주간 지수), kapt(단지 기본정보)
-- =========================================================

create table rates_monthly (
  series      text not null check (series in ('base', 'mortgage')),
  ym          char(6) not null,
  value       numeric(6,3) not null,       -- 연 %
  updated_at  timestamptz not null default now(),
  primary key (series, ym)
);
alter table rates_monthly enable row level security;

alter table ingest_runs drop constraint ingest_runs_source_check;
alter table ingest_runs add constraint ingest_runs_source_check
  check (source in ('trade', 'rent', 'supply', 'rate', 'index', 'kapt'));
