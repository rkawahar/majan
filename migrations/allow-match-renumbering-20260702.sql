-- 試合削除後に、残っている試合の節番号・試合番号を振り直すための権限です。
drop policy if exists "public update matches" on matches;

create policy "public update matches"
on matches
for update
using (true)
with check (true);

-- すでに欠番がある場合も、残っている試合を16試合ごとに振り直します。
with numbered_matches as (
  select
    id,
    row_number() over (
      order by section_no, match_no, played_at, created_at, id
    ) - 1 as zero_based_no
  from matches
)
update matches
set
  section_no = (numbered_matches.zero_based_no / 16)::integer + 1,
  match_no = (numbered_matches.zero_based_no % 16)::integer + 1
from numbered_matches
where matches.id = numbered_matches.id
  and (
    matches.section_no <> (numbered_matches.zero_based_no / 16)::integer + 1
    or matches.match_no <> (numbered_matches.zero_based_no % 16)::integer + 1
  );
