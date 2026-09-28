-- 용량 절약: 거래 원본 응답(raw)은 더 이상 저장하지 않는다 (화면에서 쓰지 않고, 필요하면 API로 다시 받을 수 있음).
-- 이미 저장된 raw는 그대로 둔다. 공간이 필요하면 `update apt_rents set raw = null` 등으로 비울 수 있다.
alter table apt_trades alter column raw drop not null;
alter table apt_rents  alter column raw drop not null;
