const SEATS = ["東", "南", "西", "北"];
const RANK_POINTS = [50, 10, -10, -30];
const STORAGE_KEY = "majan-local-data";
const DISPLAY_TIME_ZONE = "Asia/Tokyo";

const state = {
  players: [],
  matches: [],
  results: [],
  view: "dashboard",
  db: null,
  remote: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatScore(value) {
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function fullDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function japanDateTimeLocal(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function japanLocalToIso(value) {
  return new Date(`${value}:00+09:00`).toISOString();
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function initSupabase() {
  const config = window.MAJAN_CONFIG || {};
  if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
    state.db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    state.remote = true;
    $("#connectionStatus").textContent = "共有DB";
    $("#connectionStatus").classList.add("online");
  } else {
    $("#connectionStatus").textContent = "端末内保存";
    $("#connectionStatus").classList.add("local");
  }
}

function loadLocal() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  state.players = saved.players || [];
  state.matches = saved.matches || [];
  state.results = saved.results || [];
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    players: state.players,
    matches: state.matches,
    results: state.results
  }));
}

async function loadData() {
  if (!state.remote) {
    loadLocal();
    render();
    return;
  }

  const [{ data: players, error: pError }, { data: matches, error: mError }, { data: results, error: rError }] =
    await Promise.all([
      state.db.from("players").select("*").order("created_at"),
      state.db.from("matches").select("*").order("played_at").order("created_at"),
      state.db.from("match_results").select("*")
    ]);

  if (pError || mError || rError) {
    $("#connectionStatus").textContent = "DBエラー";
    console.error(pError || mError || rError);
    return;
  }

  state.players = players.map((p) => ({ id: p.id, name: p.display_name, createdAt: p.created_at }));
  state.matches = matches.map((m) => ({
    id: m.id,
    playedAt: m.played_at,
    sectionNo: m.section_no,
    matchNo: m.match_no,
    createdAt: m.created_at
  }));
  state.results = results.map((r) => ({
    id: r.id,
    matchId: r.match_id,
    playerId: r.player_id,
    seat: r.seat,
    rawScore: Number(r.raw_score),
    rankLabel: r.rank_label,
    rankValue: Number(r.rank_value),
    rankPoint: Number(r.rank_point),
    gameScore: Number(r.game_score)
  }));
  render();
}

function sortedMatches() {
  return [...state.matches].sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));
}

function nextMatchInfo() {
  const count = state.matches.length;
  return {
    sectionNo: Math.floor(count / 16) + 1,
    matchNo: (count % 16) + 1
  };
}

function renumberMatches(matches) {
  return [...matches]
    .sort((a, b) => a.sectionNo - b.sectionNo || a.matchNo - b.matchNo)
    .map((match, index) => ({
      ...match,
      sectionNo: Math.floor(index / 16) + 1,
      matchNo: (index % 16) + 1
    }));
}

function calculateResults(entries) {
  const sorted = [...entries].sort((a, b) => b.rawScore - a.rawScore);
  const calculated = [];
  let index = 0;

  while (index < sorted.length) {
    const same = sorted.filter((entry) => entry.rawScore === sorted[index].rawScore);
    const start = index + 1;
    const end = index + same.length;
    const rankPoint = RANK_POINTS.slice(index, index + same.length).reduce((sum, point) => sum + point, 0) / same.length;
    const rankValue = (start + end) / 2;
    const rankLabel = same.length > 1 ? `${start}着同着` : `${start}着`;

    same.forEach((entry) => {
      calculated.push({
        ...entry,
        rankLabel,
        rankValue,
        rankPoint,
        gameScore: (entry.rawScore - 30000) / 1000 + rankPoint
      });
    });

    index += same.length;
  }

  return calculated.sort((a, b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat));
}

function playerName(id) {
  return state.players.find((player) => player.id === id)?.name || "削除済み";
}

function resultsForMatch(matchId) {
  return state.results.filter((result) => result.matchId === matchId);
}

function statsFor(matches) {
  const ids = new Set(matches.map((match) => match.id));
  const base = new Map(state.players.map((player) => [player.id, {
    player,
    total: 0,
    games: 0,
    rankSum: 0,
    counts: [0, 0, 0, 0]
  }]));

  state.results.filter((result) => ids.has(result.matchId)).forEach((result) => {
    if (!base.has(result.playerId)) return;
    const item = base.get(result.playerId);
    item.total += result.gameScore;
    item.games += 1;
    item.rankSum += result.rankValue;
    const countIndex = Math.max(0, Math.min(3, Math.round(result.rankValue) - 1));
    item.counts[countIndex] += 1;
  });

  return [...base.values()]
    .filter((item) => item.games > 0)
    .sort((a, b) => b.total - a.total);
}

function sectionGroups() {
  const sections = new Map();
  sortedMatches().forEach((match) => {
    if (!sections.has(match.sectionNo)) sections.set(match.sectionNo, []);
    sections.get(match.sectionNo).push(match);
  });
  return [...sections.entries()].sort((a, b) => b[0] - a[0]);
}

function switchView(view) {
  state.view = view;
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((panel) => panel.classList.toggle("active", panel.id === view));
}

function renderSeatInputs() {
  const options = state.players
    .map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`)
    .join("");
  $("#seatInputs").innerHTML = SEATS.map((seat) => `
    <div class="seat-card">
      <div class="seat-title">${seat}</div>
      <label>
        <span>選手</span>
        <select name="player-${seat}" required>
          <option value="">選択</option>
          ${options}
        </select>
      </label>
      <label>
        <span>素点</span>
        <div class="score-input">
          <button type="button" data-score-minus="${seat}" aria-label="${seat}の素点にマイナスを付ける">-</button>
          <input name="score-${seat}" type="text" inputmode="numeric" pattern="-?[0-9]*" placeholder="30000" required>
        </div>
      </label>
    </div>
  `).join("");
  $$("#seatInputs select, #seatInputs input").forEach((input) => input.addEventListener("input", renderPreview));
  $$("[data-score-minus]").forEach((button) => {
    button.addEventListener("click", () => toggleScoreSign(button.dataset.scoreMinus));
  });
}

function toggleScoreSign(seat) {
  const input = $(`[name="score-${seat}"]`);
  const value = input.value.trim();
  if (!value) {
    input.value = "-";
  } else if (value.startsWith("-")) {
    input.value = value.slice(1);
  } else {
    input.value = `-${value}`;
  }
  input.focus();
  renderPreview();
}

function renderPreview() {
  const entries = collectEntries(false);
  if (entries.length !== 4) {
    $("#scorePreview").innerHTML = `<p>4人分の選手と素点を入力すると、点数を自動計算します。</p>`;
    return;
  }
  $("#scorePreview").innerHTML = scoreTable(calculateResults(entries), false);
}

function collectEntries(strict = true) {
  const entries = [];
  const selected = new Set();
  for (const seat of SEATS) {
    const playerId = $(`[name="player-${seat}"]`).value;
    const rawScoreText = $(`[name="score-${seat}"]`).value.trim();
    const rawScore = Number(rawScoreText);
    if (!playerId || rawScoreText === "" || !Number.isInteger(rawScore)) {
      if (strict) throw new Error("4人分の選手と素点を入力してください");
      return entries;
    }
    if (selected.has(playerId)) {
      if (strict) throw new Error("同じ選手を複数の席に登録できません");
      return [];
    }
    selected.add(playerId);
    entries.push({ playerId, seat, rawScore });
  }
  return entries;
}

function scoreTable(results, withSeat = true) {
  return `
    <table>
      <thead>
        <tr>
          ${withSeat ? "<th>席</th>" : ""}
          <th>選手</th>
          <th>素点</th>
          <th>順位</th>
          <th>順位点</th>
          <th>点数</th>
        </tr>
      </thead>
      <tbody>
        ${results.map((result) => `
          <tr>
            ${withSeat ? `<td>${result.seat}</td>` : ""}
            <td>${escapeHtml(playerName(result.playerId))}</td>
            <td>${result.rawScore.toLocaleString()}</td>
            <td>${result.rankLabel}</td>
            <td>${formatScore(result.rankPoint)}</td>
            <td class="${result.gameScore >= 0 ? "plus" : "minus"}">${formatScore(result.gameScore)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDashboard() {
  const overall = statsFor(state.matches);
  const latest = sectionGroups()[0];
  $("#overallLeader").textContent = overall[0] ? overall[0].player.name : "未登録";
  $("#overallGap").textContent = overall[0] ? `首位 ${formatScore(overall[0].total)}` : "試合を入力してください";
  $("#latestSectionTitle").textContent = latest ? `第${latest[0]}節` : "第1節";
  const latestStats = latest ? statsFor(latest[1]) : [];
  $("#latestSectionLeader").textContent = latestStats[0] ? `${latestStats[0].player.name} ${formatScore(latestStats[0].total)}` : "未登録";
  $("#overallRanking").innerHTML = rankingHtml(overall, "leader");

  $("#sectionList").innerHTML = sectionGroups().map(([sectionNo, matches]) => {
    const stats = statsFor(matches);
    const leader = stats[0];
    return `
      <button class="section-row" data-section="${sectionNo}">
        <span>第${sectionNo}節</span>
        <strong>${leader ? escapeHtml(leader.player.name) : "未登録"}</strong>
        <small>${matches.length}/16試合 ${leader ? formatScore(leader.total) : ""}</small>
      </button>
    `;
  }).join("") || `<p class="empty">まだ試合がありません。</p>`;

  $$(".section-row").forEach((row) => row.addEventListener("click", () => openSection(Number(row.dataset.section))));
}

function rankingHtml(stats, gapMode) {
  if (!stats.length) return `<p class="empty">まだ成績がありません。</p>`;
  const leader = stats[0].total;
  return stats.map((item, index) => {
    const gap = index === 0
      ? "首位"
      : gapMode === "leader"
        ? `1位と ${formatScore(item.total - leader)}`
        : `上位と ${formatScore(item.total - stats[index - 1].total)}`;
    return `
      <button class="rank-row" data-player="${item.player.id}">
        <span class="rank-no">${index + 1}</span>
        <strong>${escapeHtml(item.player.name)}</strong>
        <span class="${item.total >= 0 ? "plus" : "minus"}">${formatScore(item.total)}</span>
        <small>${gap}</small>
      </button>
    `;
  }).join("");
}

function personalHtml(stats) {
  if (!stats.length) return `<p class="empty">成績がありません。</p>`;
  return `
    <div class="personal-grid">
      ${stats.map((item) => `
        <div class="personal-card">
          <h3>${escapeHtml(item.player.name)}</h3>
          <div class="metric"><span>合計</span><strong class="${item.total >= 0 ? "plus" : "minus"}">${formatScore(item.total)}</strong></div>
          <div class="metric"><span>平均順位</span><strong>${(item.rankSum / item.games).toFixed(2)}</strong></div>
          <div class="rank-counts">
            ${item.counts.map((count, index) => `<span>${index + 1}着 ${count}</span>`).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMatches() {
  $("#matchList").innerHTML = sortedMatches().reverse().map((match) => {
    const total = resultsForMatch(match.id).reduce((sum, result) => sum + result.gameScore, 0);
    return `
      <button class="match-row" data-match="${match.id}">
        <span>第${match.sectionNo}節 第${match.matchNo}試合</span>
        <strong>${formatDate(match.playedAt)}</strong>
        <small>合計 ${formatScore(total)}</small>
      </button>
    `;
  }).join("") || `<p class="empty">まだ試合がありません。</p>`;

  $$(".match-row").forEach((row) => row.addEventListener("click", () => openMatch(row.dataset.match)));
}

function renderPlayers() {
  $("#playerList").innerHTML = state.players.map((player) => `
    <div class="player-row">
      <input value="${escapeAttr(player.name)}" data-player-name="${player.id}" maxlength="24">
      <button data-save-player="${player.id}">保存</button>
      <button class="danger" data-delete-player="${player.id}">削除</button>
    </div>
  `).join("") || `<p class="empty">選手を追加してください。</p>`;

  $$("[data-save-player]").forEach((button) => button.addEventListener("click", () => savePlayer(button.dataset.savePlayer)));
  $$("[data-delete-player]").forEach((button) => button.addEventListener("click", () => deletePlayer(button.dataset.deletePlayer)));
}

function render() {
  const next = nextMatchInfo();
  $("#nextMatchLabel").textContent = `第${next.sectionNo}節 第${next.matchNo}試合`;
  if (!$("#playedAt").value) $("#playedAt").value = japanDateTimeLocal();
  renderSeatInputs();
  renderPreview();
  renderDashboard();
  renderMatches();
  renderPlayers();
  $$(".rank-row").forEach((row) => row.addEventListener("click", () => openPlayer(row.dataset.player)));
}

async function addPlayer(name) {
  if (state.remote) {
    const { error } = await state.db.from("players").insert({ display_name: name });
    if (error) throw error;
    await loadData();
    return;
  }
  state.players.push({ id: uuid(), name, createdAt: new Date().toISOString() });
  saveLocal();
  render();
}

async function savePlayer(id) {
  const name = $(`[data-player-name="${id}"]`).value.trim();
  if (!name) return;
  if (state.remote) {
    const { error } = await state.db.from("players").update({ display_name: name }).eq("id", id);
    if (error) return alert(error.message);
    await loadData();
    return;
  }
  state.players = state.players.map((player) => player.id === id ? { ...player, name } : player);
  saveLocal();
  render();
}

async function deletePlayer(id) {
  if (state.results.some((result) => result.playerId === id)) {
    alert("試合結果に使われている選手は削除できません。");
    return;
  }
  if (state.remote) {
    const { error } = await state.db.from("players").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadData();
    return;
  }
  state.players = state.players.filter((player) => player.id !== id);
  saveLocal();
  render();
}

async function deleteMatch(id) {
  const match = state.matches.find((item) => item.id === id);
  if (!match) return;

  const ok = confirm(`第${match.sectionNo}節 第${match.matchNo}試合を削除します。よろしいですか？`);
  if (!ok) return;

  if (state.remote) {
    const { error } = await state.db.from("matches").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    const renumbered = renumberMatches(state.matches.filter((item) => item.id !== id));
    for (const matchToUpdate of renumbered) {
      const original = state.matches.find((item) => item.id === matchToUpdate.id);
      if (original.sectionNo === matchToUpdate.sectionNo && original.matchNo === matchToUpdate.matchNo) continue;

      const { error: updateError } = await state.db
        .from("matches")
        .update({ section_no: matchToUpdate.sectionNo, match_no: matchToUpdate.matchNo })
        .eq("id", matchToUpdate.id);
      if (updateError) {
        alert(`試合は削除されましたが、後続の試合番号を更新できませんでした: ${updateError.message}`);
        await loadData();
        return;
      }
    }
    await loadData();
  } else {
    state.matches = renumberMatches(state.matches.filter((item) => item.id !== id));
    state.results = state.results.filter((result) => result.matchId !== id);
    saveLocal();
    render();
  }

  $("#detailDialog").close();
}

async function addMatch(entries) {
  const next = nextMatchInfo();
  const playedAt = japanLocalToIso($("#playedAt").value);
  const calculated = calculateResults(entries);

  if (state.remote) {
    const { data: match, error: matchError } = await state.db
      .from("matches")
      .insert({ played_at: playedAt, section_no: next.sectionNo, match_no: next.matchNo })
      .select()
      .single();
    if (matchError) throw matchError;

    const rows = calculated.map((result) => ({
      match_id: match.id,
      player_id: result.playerId,
      seat: result.seat,
      raw_score: result.rawScore,
      rank_label: result.rankLabel,
      rank_value: result.rankValue,
      rank_point: result.rankPoint,
      game_score: result.gameScore
    }));
    const { error: resultError } = await state.db.from("match_results").insert(rows);
    if (resultError) throw resultError;
    await loadData();
    return;
  }

  const matchId = uuid();
  state.matches.push({ id: matchId, playedAt, sectionNo: next.sectionNo, matchNo: next.matchNo, createdAt: new Date().toISOString() });
  state.results.push(...calculated.map((result) => ({ ...result, id: uuid(), matchId })));
  saveLocal();
  render();
}

function openMatch(id) {
  const match = state.matches.find((item) => item.id === id);
  if (!match) return;
  $("#detailTitle").textContent = `第${match.sectionNo}節 第${match.matchNo}試合`;
  $("#detailBody").innerHTML = `
    <p class="detail-date">${fullDate(match.playedAt)}</p>
    ${scoreTable(resultsForMatch(id))}
    <div class="detail-actions">
      <button class="danger-action" data-delete-match="${id}">この試合を削除</button>
    </div>
  `;
  $("[data-delete-match]").addEventListener("click", () => deleteMatch(id));
  $("#detailDialog").showModal();
}

function openSection(sectionNo) {
  const matches = state.matches.filter((match) => match.sectionNo === sectionNo);
  const stats = statsFor(matches);
  $("#detailTitle").textContent = `第${sectionNo}節 成績`;
  $("#detailBody").innerHTML = `
    <h3>合計スコアランキング</h3>
    <div class="ranking-list">${rankingHtml(stats, "previous")}</div>
    <h3>個人成績</h3>
    ${personalHtml(stats)}
  `;
  $("#detailDialog").showModal();
}

function openOverall() {
  const stats = statsFor(state.matches);
  $("#detailTitle").textContent = "全体成績";
  $("#detailBody").innerHTML = `
    <h3>合計スコアランキング</h3>
    <div class="ranking-list">${rankingHtml(stats, "leader")}</div>
    <h3>個人成績</h3>
    ${personalHtml(stats)}
  `;
  $("#detailDialog").showModal();
}

function openPlayer(id) {
  const matches = sortedMatches().filter((match) => resultsForMatch(match.id).some((result) => result.playerId === id));
  const rows = matches.map((match) => {
    const result = resultsForMatch(match.id).find((item) => item.playerId === id);
    return `
      <tr>
        <td>第${match.sectionNo}節-${match.matchNo}</td>
        <td>${result.rawScore.toLocaleString()}</td>
        <td>${result.rankLabel}</td>
        <td class="${result.gameScore >= 0 ? "plus" : "minus"}">${formatScore(result.gameScore)}</td>
      </tr>
    `;
  }).join("");
  $("#detailTitle").textContent = playerName(id);
  $("#detailBody").innerHTML = rows
    ? `<table><thead><tr><th>試合</th><th>素点</th><th>順位</th><th>点数</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">試合記録がありません。</p>`;
  $("#detailDialog").showModal();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("#goEntry").addEventListener("click", () => switchView("entry"));
  $("#closeDialog").addEventListener("click", () => $("#detailDialog").close());
  $$("[data-drill='overall']").forEach((button) => button.addEventListener("click", openOverall));
  $("[data-drill='latest-section']").addEventListener("click", () => {
    const latest = sectionGroups()[0];
    if (latest) openSection(latest[0]);
  });

  $("#playerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#playerName");
    const name = input.value.trim();
    if (!name) return;
    try {
      await addPlayer(name);
      input.value = "";
    } catch (error) {
      alert(error.message);
    }
  });

  $("#matchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await addMatch(collectEntries(true));
      event.target.reset();
      $("#playedAt").value = japanDateTimeLocal();
      render();
      switchView("matches");
    } catch (error) {
      alert(error.message);
    }
  });
}

initSupabase();
bindEvents();
loadData();
