// 지역 그룹 색: 그룹 정렬 순서로 고정 (필터로 개수가 바뀌어도 같은 지역은 같은 색).
// 값은 app/globals.css의 --group-1..5 (dataviz 다크 팔레트, 인접 색 구분 검증된 순서).
const GROUP_COLORS = ["var(--group-1)", "var(--group-2)", "var(--group-3)", "var(--group-4)", "var(--group-5)"];

export const groupColor = (index: number) => GROUP_COLORS[index % GROUP_COLORS.length];
