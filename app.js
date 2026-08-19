const STORAGE_KEY = 'habit-tracker-data-v1';
const THEME_KEY = 'habit-tracker-theme';

const addForm = document.getElementById('addForm');
const habitInput = document.getElementById('habitInput');
const goalInput = document.getElementById('goalInput');
const habitList = document.getElementById('habitList');
const emptyState = document.getElementById('emptyState');
const feedback = document.getElementById('feedback');
const dateLabel = document.getElementById('dateLabel');
const doneCountEl = document.getElementById('doneCount');
const totalCountEl = document.getElementById('totalCount');
const progressFill = document.getElementById('progressFill');
const clearBtn = document.getElementById('clearBtn');
const confirmMask = document.getElementById('confirmMask');
const cancelClear = document.getElementById('cancelClear');
const confirmClear = document.getElementById('confirmClear');
const goalMask = document.getElementById('goalMask');
const goalHabitName = document.getElementById('goalHabitName');
const goalDialogInput = document.getElementById('goalDialogInput');
const cancelGoal = document.getElementById('cancelGoal');
const saveGoal = document.getElementById('saveGoal');
const themeBtn = document.getElementById('themeBtn');

let habits = [];
let checkins = {};
let feedbackTimer = null;
let editingHabitId = null;

function todayKey() {
  return toKey(new Date());
}

function toKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate() {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
}

function normalizeGoal(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(99, Math.max(1, Math.floor(num)));
}

function normalizeHabits(rawHabits) {
  if (!Array.isArray(rawHabits)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of rawHabits) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || makeId());
    const name = String(raw.name || '').trim();
    if (!name || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name, goal: normalizeGoal(raw.goal) });
  }
  return result;
}

function normalizeCheckins(rawCheckins) {
  const result = {};
  if (!rawCheckins || typeof rawCheckins !== 'object') return result;
  for (const [key, value] of Object.entries(rawCheckins)) {
    const day = {};
    if (Array.isArray(value)) {
      for (const id of value) {
        if (id) day[id] = 1;
      }
    } else if (value && typeof value === 'object') {
      for (const [id, count] of Object.entries(value)) {
        const num = Math.floor(Number(count));
        if (id && Number.isFinite(num) && num > 0) day[id] = num;
      }
    }
    if (Object.keys(day).length > 0) result[key] = day;
  }
  return result;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    habits = normalizeHabits(data && data.habits);
    checkins = normalizeCheckins(data && data.checkins);
  } catch (err) {
    habits = [];
    checkins = {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, checkins }));
  } catch (err) {
    // 存储不可用时仅影响本次会话内的保存
  }
}

function goalFor(habitId) {
  const habit = habits.find((h) => h.id === habitId);
  return habit ? habit.goal : 1;
}

function countFor(habitId, key = todayKey()) {
  const day = checkins[key];
  const count = day && day[habitId];
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function isDone(habitId, key = todayKey()) {
  return countFor(habitId, key) >= goalFor(habitId);
}

// 🎵 音效播放函数（路径已修改）
function playTapSound() {
  try {
    const audio = new Audio('/MyWeb/走路踢到石头石子.mp3');
    audio.play().catch(() => {});
  } catch (e) {}
}

// 🎵 删除音效
function playDeleteSound() {
  try {
    const audio = new Audio('/MyWeb/枯枝.mp3');
    audio.play().catch(() => {});
  } catch (e) {}
}

function bumpCheck(habitId) {
  const key = todayKey();
  const day = checkins[key] || (checkins[key] = {});
  day[habitId] = Math.min(goalFor(habitId), (day[habitId] || 0) + 1);
  save();
  render();
  playTapSound();
}

function decreaseCheck(habitId) {
  const key = todayKey();
  const day = checkins[key];
  if (!day || !(day[habitId] > 0)) return;
  day[habitId] -= 1;
  if (day[habitId] <= 0) delete day[habitId];
  if (Object.keys(day).length === 0) delete checkins[key];
  save();
  render();
}

function currentStreak(habitId) {
  if (!isDone(habitId)) return 0;
  let count = 0;
  const cursor = new Date();
  while (isDone(habitId, toKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function addHabit(name, goalValue) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (String(goalValue).trim() !== '' && Number(goalValue) !== normalizeGoal(goalValue)) {
    showFeedback('每日目标需为 1 到 99 的整数');
    return;
  }
  if (habits.some((h) => h.name.toLowerCase() === trimmed.toLowerCase())) {
    showFeedback('这个习惯已经存在');
    return;
  }
  habits.push({
    id: makeId(),
    name: trimmed,
    goal: normalizeGoal(goalValue),
  });
  save();
  render();
  habitInput.value = '';
  goalInput.value = '1';
  habitInput.focus();
}

function deleteHabit(habitId) {
  habits = habits.filter((h) => h.id !== habitId);
  for (const key of Object.keys(checkins)) {
    delete checkins[key][habitId];
    if (Object.keys(checkins[key]).length === 0) delete checkins[key];
  }
  save();
  render();
  // 🎵 播放删除音效
  playDeleteSound();
}

function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  habits = [];
  checkins = {};
  save();
  closeConfirm();
  render();
  showFeedback('已清空全部数据');
}

function openConfirm() {
  confirmMask.hidden = false;
  cancelClear.focus();
}

function closeConfirm() {
  confirmMask.hidden = true;
  clearBtn.focus();
}

function openGoalEditor(habitId) {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return;
  editingHabitId = habitId;
  goalHabitName.textContent = habit.name;
  goalDialogInput.value = String(habit.goal);
  goalMask.hidden = false;
  goalDialogInput.focus();
  goalDialogInput.select();
}

function closeGoalEditor() {
  goalMask.hidden = true;
  editingHabitId = null;
}

function saveGoalEditor() {
  if (!editingHabitId) return;
  const habit = habits.find((h) => h.id === editingHabitId);
  if (habit) {
    habit.goal = normalizeGoal(goalDialogInput.value);
    save();
    render();
  }
  closeGoalEditor();
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? '切换为日间模式' : '切换为夜间模式');
  themeBtn.title = dark ? '切换为日间模式' : '切换为夜间模式';
}

function loadTheme() {
  let theme = null;
  try {
    theme = localStorage.getItem(THEME_KEY);
  } catch (err) {
    // 存储不可用时跟随系统偏好
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  applyTheme(theme);
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function avatarClassFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `avatar-${hash % 6}`;
}

function showFeedback(message) {
  feedback.textContent = message;
  feedback.classList.add('show');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedback.classList.remove('show');
  }, 1600);
}

function createHabitItem(habit) {
  const count = countFor(habit.id);
  const goal = habit.goal;
  const done = count >= goal;
  const streak = currentStreak(habit.id);

  const item = document.createElement('li');
  item.className = 'habit-item' + (done ? ' done' : '');

  const avatar = document.createElement('span');
  avatar.className = `habit-avatar ${avatarClassFor(habit.id)}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = habit.name.trim().charAt(0);

  const info = document.createElement('div');
  info.className = 'habit-info';

  const name = document.createElement('span');
  name.className = 'habit-name';
  name.textContent = habit.name;
  info.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'habit-meta';

  const goalChip = document.createElement('button');
  goalChip.type = 'button';
  goalChip.className = 'goal-chip';
  goalChip.setAttribute('aria-label', `设置「${habit.name}」的每日目标`);
  goalChip.title = '点击修改每日目标';
  goalChip.textContent = `今日 ${count}/${goal}`;
  goalChip.addEventListener('click', () => openGoalEditor(habit.id));
  meta.appendChild(goalChip);

  if (streak > 0) {
    const chip = document.createElement('span');
    chip.className = 'streak-chip';
    chip.textContent = `连续 ${streak} 天`;
    meta.appendChild(chip);
  }

  info.appendChild(meta);

  const counter = document.createElement('div');
  counter.className = 'counter';

  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.className = 'minus-btn' + (count === 0 ? ' hidden' : '');
  minusBtn.setAttribute('aria-label', `撤销「${habit.name}」一次`);
  minusBtn.title = '撤销一次';
  minusBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>';
  minusBtn.addEventListener('click', () => decreaseCheck(habit.id));
  counter.appendChild(minusBtn);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'check-btn';
  if (done) {
    checkBtn.disabled = true;
    checkBtn.setAttribute('aria-pressed', 'true');
    checkBtn.setAttribute('aria-label', `已完成「${habit.name}」`);
    checkBtn.title = '已完成';
    checkBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>';
  } else {
    checkBtn.setAttribute('aria-pressed', 'false');
    checkBtn.setAttribute('aria-label', `「${habit.name}」打卡一次`);
    checkBtn.title = '打卡一次';
    checkBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>';
    checkBtn.addEventListener('click', () => bumpCheck(habit.id));
  }
  counter.appendChild(checkBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute('aria-label', `删除「${habit.name}」`);
  deleteBtn.title = '删除习惯';
  deleteBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>';
  deleteBtn.addEventListener('click', () => deleteHabit(habit.id));

  item.append(avatar, info, counter, deleteBtn);
  return item;
}

function render() {
  dateLabel.textContent = formatDate();
  habitList.replaceChildren(...habits.map(createHabitItem));

  const doneHabits = habits.filter((h) => isDone(h.id)).length;
  const doneUnits = habits.reduce((sum, h) => sum + Math.min(countFor(h.id), h.goal), 0);
  const totalUnits = habits.reduce((sum, h) => sum + h.goal, 0);
  doneCountEl.textContent = doneHabits;
  totalCountEl.textContent = habits.length;
  progressFill.style.width = totalUnits ? `${Math.round((doneUnits / totalUnits) * 100)}%` : '0%';
  emptyState.classList.toggle('hidden', habits.length > 0);
}

addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addHabit(habitInput.value, goalInput.value);
});

clearBtn.addEventListener('click', openConfirm);
cancelClear.addEventListener('click', closeConfirm);
confirmClear.addEventListener('click', clearAllData);
confirmMask.addEventListener('click', (event) => {
  if (event.target === confirmMask) {
    closeConfirm();
  }
});

cancelGoal.addEventListener('click', closeGoalEditor);
saveGoal.addEventListener('click', saveGoalEditor);
goalMask.addEventListener('click', (event) => {
  if (event.target === goalMask) {
    closeGoalEditor();
  }
});
goalDialogInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveGoalEditor();
  }
});

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    // 存储不可用时仅切换当前会话
  }
  applyTheme(next);
});

if (window.matchMedia) {
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = (event) => {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (err) {
      // 忽略存储异常
    }
    if (!stored) {
      applyTheme(event.matches ? 'dark' : 'light');
    }
  };
  if (typeof darkMedia.addEventListener === 'function') {
    darkMedia.addEventListener('change', onSystemThemeChange);
  } else if (typeof darkMedia.addListener === 'function') {
    darkMedia.addListener(onSystemThemeChange);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!goalMask.hidden) {
    closeGoalEditor();
  } else if (!confirmMask.hidden) {
    closeConfirm();
  }
});

loadTheme();
load();
render();