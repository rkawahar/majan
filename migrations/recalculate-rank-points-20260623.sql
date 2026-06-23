with rank_values(rank_no, point) as (
  values
    (1, 50.0),
    (2, 10.0),
    (3, -10.0),
    (4, -30.0)
),
rank_groups as (
  select
    id,
    raw_score,
    1 + (
      select count(*)
      from match_results as higher
      where higher.match_id = current_result.match_id
        and higher.raw_score > current_result.raw_score
    ) as start_rank,
    (
      select count(*)
      from match_results as tied
      where tied.match_id = current_result.match_id
        and tied.raw_score = current_result.raw_score
    ) as tied_count
  from match_results as current_result
),
recalculated as (
  select
    rank_groups.id,
    avg(rank_values.point) as new_rank_point
  from rank_groups
  join rank_values
    on rank_values.rank_no between rank_groups.start_rank and rank_groups.start_rank + rank_groups.tied_count - 1
  group by rank_groups.id
)
update match_results as result
set
  rank_point = recalculated.new_rank_point,
  game_score = (result.raw_score - 30000) / 1000.0 + recalculated.new_rank_point
from recalculated
where result.id = recalculated.id;
  from match_results
)
update match_results as result
set
  rank_point = recalculated.new_rank_point,
  game_score = (result.raw_score - 30000) / 1000.0 + recalculated.new_rank_point
from recalculated
where result.id = recalculated.id;
