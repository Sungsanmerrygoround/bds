-- 관심 단지 요약(complex_stats)·단지 비교: 단지+면적 단위 조회를 index-only scan으로.
-- 캐시가 빈 상태에서 테이블 본체를 무작위로 읽느라 수 초 걸리던 첫 조회를 줄인다.
create index if not exists apt_trades_complex_area_idx on apt_trades (apt_seq, area_type, deal_date)
  include (price_man, id)
  where not is_cancelled and missing_since is null;

create index if not exists apt_rents_complex_jeonse_idx on apt_rents (apt_seq, area_type, deal_date)
  include (deposit_man)
  where rent_type = '전세' and missing_since is null;
