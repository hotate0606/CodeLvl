function updateUI(stats) {
  const { xp, level, xpForNext, todayCommits } = stats;

  document.getElementById('level-badge').textContent = `Lv.${level}`;

  const prevLevelXP = level > 1 ? 50 * (level - 1) * (level - 1) : 0;
  const progress = ((xp - prevLevelXP) / (xpForNext - prevLevelXP)) * 100;
  document.getElementById('xp-bar').style.width = `${Math.min(progress, 100)}%`;
  document.getElementById('xp-text').textContent = `${xp - prevLevelXP} / ${xpForNext - prevLevelXP} XP`;
  document.getElementById('total-xp').textContent = `total XP: ${xp}`;
  document.getElementById('commits-today').textContent = `commits today: ${todayCommits ?? 0}`;
}

function showFlash(amount, reason) {
  const el = document.getElementById('xp-flash');
  el.textContent = `+${amount} XP`;
  el.title = reason;
  el.classList.remove('show');
  void el.offsetWidth; // reflow
  el.classList.add('show');
}

if (window.codelvl) {
  window.codelvl.getStats().then(updateUI);
  window.codelvl.onUpdateStats(updateUI);
  window.codelvl.onXpGained(({ amount, reason }) => showFlash(amount, reason));
} else {
  // ブラウザプレビュー用ダミーデータ
  updateUI({ xp: 320, level: 3, xpForNext: 450, todayCommits: 4 });
}
