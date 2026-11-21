-- 20번 정리에서 complex_aliases를 지웠는데, 단지 검색 함수 complex_search가 별칭 검색에 이 표를 쓰고 있어
-- /complex 검색이 오류가 났다 (2026-11-21, 약 10분). 운영 DB에는 같은 정의로 바로 다시 만들었고, 이 파일은 그 상태를 맞춘다.
-- 다른 정리(나머지 표 3개·인덱스 삭제)는 그대로 둔다 — 함수·코드 어디에서도 쓰지 않음을 pg_proc 본문까지 확인했다.
create table if not exists complex_aliases (
  alias    text primary key,
  apt_seq  text not null references complexes(apt_seq) on delete cascade
);
create index if not exists complex_aliases_apt_seq_idx on complex_aliases (apt_seq);
alter table complex_aliases enable row level security;
