-- 대시보드 집계용 부분 커버링 인덱스: 유효 거래만, 필요한 컬럼만 담아 index-only scan으로 처리.
-- (region_id, deal_ymd, area_band) 순서라 면적 '전체' 조회도 같은 인덱스를 쓴다.
-- 조건식은 trend_monthly / complex_search의 where 절과 글자 그대로 같아야 인덱스가 선택된다.

create index apt_trades_trend_idx on apt_trades (region_id, deal_ymd, area_band) include (price_man)
  where not is_cancelled and missing_since is null;

create index apt_rents_jeonse_trend_idx on apt_rents (region_id, deal_ymd, area_band) include (deposit_man)
  where rent_type = '전세' and missing_since is null;

-- complex_search: 단지별 최근 12개월 건수·최근 거래일
create index apt_trades_valid_by_complex_idx on apt_trades (apt_seq, deal_date)
  where not is_cancelled and missing_since is null;
