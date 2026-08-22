const STORAGE_KEY = 'habit-tracker-data-v1';
const THEME_KEY = 'habit-tracker-theme';
const COLOR_CONFIG_KEY = 'habit-tracker-colors-v2';
const PRESETS_KEY = 'habit-tracker-presets';
const SWATCHES_KEY = 'habit-tracker-swatches';

// ============================================================
// 本地文件存储管理器
// ============================================================
const StorageManager = {
  _fileHandle: null,
  _currentFileName: '习惯打卡数据.json',
  _saveTimer: null,
  _watchTimer: null,
  _lastFileContent: null,
  _watchEnabled: false,

  async init() {
    // 检查是否支持 File System Access API
    if (!window.showOpenFilePicker && !window.showSaveFilePicker) {
      console.log('File System Access API 不可用，使用 localStorage');
      return false;
    }
    // 文件句柄无法跨会话持久化，用户每次需重新选择
    return false;
  },

  // 启动文件监听（自动刷新）
  startWatching() {
    if (!this._fileHandle || this._watchEnabled) return;
    this._watchEnabled = true;
    this._checkFileChanges();
    // 每 2 秒检查一次
    this._watchTimer = setInterval(() => this._checkFileChanges(), 2000);
  },

  // 停止文件监听
  stopWatching() {
    this._watchEnabled = false;
    if (this._watchTimer) {
      clearInterval(this._watchTimer);
      this._watchTimer = null;
    }
  },

  // 检查文件变化
  async _checkFileChanges() {
    if (!this._fileHandle || !this._watchEnabled) return;
    try {
      const file = await this._fileHandle.getFile();
      const text = await file.text();
      if (text !== this._lastFileContent) {
        this._lastFileContent = text;
        this._showRefreshPrompt(text);
      }
    } catch (e) {
      console.log('检查文件变化失败', e);
    }
  },

  // 显示刷新提示
  _showRefreshPrompt(newContent) {
    if (confirm('文件已更新，是否刷新当前数据？')) {
      this._lastFileContent = newContent;
      this.loadFromFile().then(() => {
        showFeedback('已刷新');
      });
    }
  },

  _getStoredFileHandle() {
    try {
      const raw = localStorage.getItem('habit-tracker-file-handle');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  _storeFileHandle(handle) {
    try {
      localStorage.setItem('habit-tracker-file-handle', JSON.stringify(handle));
    } catch {}
  },

  _removeStoredFileHandle() {
    try {
      localStorage.removeItem('habit-tracker-file-handle');
    } catch {}
  },

  async openFile() {
    if (!window.showOpenFilePicker) {
      showFeedback('浏览器不支持文件选择，使用 localStorage');
      return false;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON 文件',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      });
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      // 加载数据
      habits = normalizeHabits(data?.habits);
      checkins = normalizeCheckins(data?.checkins);
      tasks = normalizeTasks(data?.tasks);
      taskChecks = normalizeTaskChecks(data?.taskChecks);
      diaries = normalizeDiaries(data?.diaries);
      // 恢复配色和主题
      if (data.colors) { storeColors(data.colors); }
      if (data.swatches) { storeSwatches(data.swatches); }
      if (data.presets) { savePresets(data.presets); }
      if (data.theme) { applyTheme(data.theme); }
      // 保存到 localStorage 确保刷新后不丢失
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, checkins, tasks, taskChecks, diaries }));
      if (data.colors) localStorage.setItem(COLOR_CONFIG_KEY, JSON.stringify(data.colors));
      if (data.swatches) localStorage.setItem(SWATCHES_KEY, JSON.stringify(data.swatches));
      if (data.presets) localStorage.setItem(PRESETS_KEY, JSON.stringify(data.presets));
      this._currentFileName = handle.name;
      updateFileStatus(handle.name);
      showFeedback(`已加载: ${handle.name}`);
      render();
      renderTasks();
      renderDiary();
      renderPresetList();
      loadAndApplyColors();
      initAllSwatches();
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('打开文件失败', e);
        showFeedback('打开文件失败');
      }
      return false;
    }
  },

  async saveFile() {
    if (!this._fileHandle) {
      // 如果没有打开的文件，先创建
      return this.createFile();
    }
    try {
      const writable = await this._fileHandle.createWritable();
      await writable.write(JSON.stringify(this._exportData(), null, 2));
      await writable.close();
      showFeedback(`已保存到 ${this._currentFileName}`);
      return true;
    } catch (e) {
      console.error('保存文件失败', e);
      showFeedback('保存失败');
      return false;
    }
  },

  async createFile() {
    if (!window.showSaveFilePicker) {
      showFeedback('浏览器不支持文件保存');
      return false;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: '习惯打卡数据.json',
        types: [{
          description: 'JSON 文件',
          accept: { 'application/json': ['.json'] }
        }]
      });
      this._fileHandle = handle;
      this._storeFileHandle(handle);
      await this.saveFile();
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('创建文件失败', e);
        showFeedback('创建文件失败');
      }
      return false;
    }
  },

  async exportFile() {
    const blob = new Blob([JSON.stringify(this._exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '习惯打卡数据.json';
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('已导出');
  },

  _exportData() {
    return {
      habits,
      checkins,
      tasks,
      taskChecks,
      diaries,
      colors: getStoredColors(),
      swatches: getStoredSwatches(),
      presets: getPresets(),
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    };
  },

  async loadFromFile() {
    if (!this._fileHandle) return;
    try {
      const file = await this._fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      habits = normalizeHabits(data?.habits);
      checkins = normalizeCheckins(data?.checkins);
      tasks = normalizeTasks(data?.tasks);
      taskChecks = normalizeTaskChecks(data?.taskChecks);
      diaries = normalizeDiaries(data?.diaries);
      if (data.colors) { storeColors(data.colors); }
      if (data.swatches) { storeSwatches(data.swatches); }
      if (data.presets) { savePresets(data.presets); }
      if (data.theme) { applyTheme(data.theme); }
    } catch (e) {
      console.error('加载文件失败', e);
      showFeedback('加载文件失败，请重新打开文件');
      // 清除失效的文件句柄
      this._fileHandle = null;
      this._removeStoredFileHandle();
    }
  },

  // 重写 save 方法
  save: function() {
    try {
      const data = { habits, checkins, tasks, taskChecks, diaries };
      if (this._fileHandle) {
        // 防抖自动保存
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
          try {
            const writable = await this._fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
          } catch (e) {
            console.error('自动保存失败', e);
          }
        }, 500);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {}
  }
};

// 更新界面状态显示
function updateFileStatus(fileName) {
  const statusEl = document.getElementById('fileStatus');
  if (statusEl) {
    statusEl.textContent = fileName ? fileName : '';
  }
}

// ---------- DOM 引用 ----------
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
const openFileBtn = document.getElementById('openFileBtn');
const saveFileBtn = document.getElementById('saveFileBtn');
const exportFileBtn = document.getElementById('exportFileBtn');
const fileMenuBtn = document.getElementById('fileMenuBtn');
const fileMenu = document.getElementById('fileMenu');

const tabHabits = document.getElementById('tabHabits');
const tabTasks = document.getElementById('tabTasks');
const tabDiary = document.getElementById('tabDiary');
const habitsPanel = document.getElementById('habitsPanel');
const tasksPanel = document.getElementById('tasksPanel');
const diaryPanel = document.getElementById('diaryPanel');
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const taskEmptyState = document.getElementById('taskEmptyState');
const taskDoneCountEl = document.getElementById('taskDoneCount');
const taskTotalCountEl = document.getElementById('taskTotalCount');
const diaryDate = document.getElementById('diaryDate');
const diaryToday = document.getElementById('diaryToday');
const diaryText = document.getElementById('diaryText');
const saveDiaryBtn = document.getElementById('saveDiaryBtn');
const diaryStatus = document.getElementById('diaryStatus');
const diaryList = document.getElementById('diaryList');
const diaryEmptyState = document.getElementById('diaryEmptyState');
const diaryDateTrigger = document.getElementById('diaryDateTrigger');
const diaryDateLabel = document.getElementById('diaryDateLabel');
const calendarPopover = document.getElementById('calendarPopover');
const calPrevMonth = document.getElementById('calPrevMonth');
const calNextMonth = document.getElementById('calNextMonth');
const calMonthLabel = document.getElementById('calMonthLabel');
const calGrid = document.getElementById('calGrid');
const calEntryCount = document.getElementById('calEntryCount');
const calTodayBtn = document.getElementById('calTodayBtn');
const tabBgSlider = document.getElementById('tabBgSlider');
const app = document.querySelector('.app');

// 配色面板
const paletteBtn = document.getElementById('paletteBtn');
const paletteMask = document.getElementById('paletteMask');
const paletteClose = document.getElementById('paletteClose');
const paletteModeToggle = document.getElementById('paletteModeToggle');
const paletteModeLabel = document.getElementById('paletteModeLabel');
const paletteResetAll = document.getElementById('paletteResetAll');
const paletteGroups = document.getElementById('paletteGroups');
const paletteSliderColor = document.getElementById('paletteSliderColor');
const colorPicker = document.getElementById('colorPicker');
const pickerSvArea = document.getElementById('pickerSvArea');
const pickerSvThumb = document.getElementById('pickerSvThumb');
const pickerHue = document.getElementById('pickerHue');
const pickerHex = document.getElementById('pickerHex');
const pickerPreview = document.getElementById('pickerPreview');
const palettePanel = document.querySelector('.palette-panel');

// 预设
const presetNameInput = document.getElementById('presetNameInput');
const presetSaveBtn = document.getElementById('presetSaveBtn');
const presetOverwriteBtn = document.getElementById('presetOverwriteBtn');
const presetList = document.getElementById('presetList');

// ---------- 状态 ----------
let habits = [];
let checkins = {};
let tasks = [];
let taskChecks = {};
let diaries = {};
let activeView = 'habits';
let feedbackTimer = null;
let diaryStatusTimer = null;
let diarySaveTimer = null;
let calendarViewDate = null;
let editingHabitId = null;
let currentPaletteMode = 'light';
let pendingOverwriteName = null;
let activeColorInput = null;
let pickerDragging = false;

// ---------- 滑动状态 ----------
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouchSwiping = false;

// ---------- 默认配色 ----------
const DEFAULT_COLORS = {
  light: {
    '--bg': '#fff7ef',
    '--surface': '#fffdf9',
    '--line': '#f3e3d2',
    '--text': '#5b4b3e',
    '--muted': '#b2987f',
    '--accent': '#f48fb1',
    '--add-bg': '#f48fb1',
  },
  dark: {
    '--bg': '#201b17',
    '--surface': '#2a2420',
    '--line': '#3d3530',
    '--text': '#efe6de',
    '--muted': '#b7a696',
    '--accent': '#f48fb1',
    '--add-bg': '#f48fb1',
  },
};

// ---------- 默认色板 ----------
const DEFAULT_SWATCHES = {
  '--bg': ['#FFFFFF', '#FDFDFD', '#FFF7EF', '#F5F5F5', '#FCE4EC', '#E3F2FD', '#E8F5E9', '#FFF3E0'],
  '--surface': ['#FFFFFF', '#FDFDFD', '#FFF7EF', '#F5F5F5', '#FAFAFA', '#FCE4EC', '#E3F2FD', '#E8F5E9'],
  '--line': ['#F3E3D2', '#E0E0E0', '#D7CCC8', '#BCAAA4', '#BDBDBD', '#8D6E63', '#A1887F', '#D2B48C'],
  '--text': ['#000000', '#333333', '#5B4B3E', '#757575', '#8D6E63', '#1A237E', '#4E342E', '#3E2723'],
  '--muted': ['#B2987F', '#999999', '#A1887F', '#BDBDBD', '#8D6E63', '#757575', '#C9B99A', '#BFA88F'],
  '--accent': ['#F48FB1', '#EF5350', '#AB47BC', '#5C6BC0', '#42A5F5', '#26C6DA', '#66BB6A', '#FFA726', '#FFEE58', '#EF6C00'],
  '--add-bg': ['#F48FB1', '#EF5350', '#AB47BC', '#5C6BC0', '#42A5F5', '#26C6DA', '#66BB6A', '#FFA726', '#FFEE58', '#EF6C00'],
  '--slider-bg': ['#FFFFFF', '#FDFDFD', '#FFF7EF', '#F5F5F5', '#FCE4EC', '#E3F2FD', '#E8F5E9', '#FFF3E0'],
};

const GROUP_VARS = {
  bg: ['--bg', '--surface', '--line'],
  text: ['--text', '--muted'],
  interact: ['--accent', '--add-bg'],
  slider: ['--slider-bg'],
};

// ---------- 工具函数 ----------
function todayKey() { return toKey(new Date()); }
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatDate() {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
}
function formatDiaryDate(key) {
  const [year, month, day] = key.split('-');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const date = new Date(`${key}T00:00:00`);
  return `${Number(month)}月${Number(day)}日 · ${weekdays[date.getDay()]}`;
}
function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function avatarClassFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `avatar-${hash % 6}`;
}
function normalizeGoal(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return 1;
  return Math.min(99, Math.max(1, Math.floor(num)));
}

// ---------- 数据持久化 ----------
function load() {
  try {
    // 先尝试从 StorageManager 加载（如果已打开文件）
    if (StorageManager._fileHandle) {
      StorageManager.loadFromFile();
      return;
    }
    // 否则从 localStorage 加载
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    habits = normalizeHabits(data?.habits);
    checkins = normalizeCheckins(data?.checkins);
    tasks = normalizeTasks(data?.tasks);
    taskChecks = normalizeTaskChecks(data?.taskChecks);
    carryOverTasks();
    diaries = normalizeDiaries(data?.diaries);
  } catch (e) { habits = []; checkins = {}; tasks = []; taskChecks = {}; diaries = {}; }
}
function carryOverTasks() {
  const today = todayKey();
  for (const task of tasks) {
    if (task.createdAt < today && !taskDone(task.id)) {
      if (!tasks.some(t => t.text === task.text && t.createdAt === today)) {
        tasks.push({ id: makeId(), text: task.text, createdAt: today });
      }
    }
  }
  save();
}
function save() {
  StorageManager.save();
}
function normalizeHabits(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || makeId());
    const name = String(r.name || '').trim();
    if (!name || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name, goal: normalizeGoal(r.goal) });
  }
  return result;
}
function normalizeCheckins(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    const day = {};
    if (Array.isArray(value)) { for (const id of value) if (id) day[id] = 1; }
    else if (value && typeof value === 'object') {
      for (const [id, count] of Object.entries(value)) {
        const num = Math.floor(Number(count));
        if (id && Number.isFinite(num) && num > 0) day[id] = num;
      }
    }
    if (Object.keys(day).length > 0) result[key] = day;
  }
  return result;
}
function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || makeId());
    const text = String(r.text || '').trim();
    if (!text || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, text, createdAt: r.createdAt || todayKey() });
  }
  return result;
}
function normalizeTaskChecks(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    const day = {};
    if (Array.isArray(value)) { for (const id of value) if (id) day[id] = true; }
    else if (value && typeof value === 'object') {
      for (const [id, done] of Object.entries(value)) if (id && done) day[id] = true;
    }
    if (Object.keys(day).length > 0) result[key] = day;
  }
  return result;
}
function normalizeDiaries(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    let text = '';
    let updatedAt = Date.now();
    if (value && typeof value === 'object') {
      text = String(value.text || '').trim();
      updatedAt = value.updatedAt || updatedAt;
    } else { text = String(value || '').trim(); }
    if (text) result[key] = { text, updatedAt };
  }
  return result;
}

// ---------- 核心业务逻辑 ----------
function goalFor(habitId) { const h = habits.find(h => h.id === habitId); return h ? h.goal : 1; }
function countFor(habitId, key = todayKey()) { const day = checkins[key]; const c = day && day[habitId]; return Number.isFinite(c) && c > 0 ? Math.floor(c) : 0; }
function isDone(habitId, key = todayKey()) { return countFor(habitId, key) >= goalFor(habitId); }
function taskDone(taskId, key = todayKey()) { return Boolean(taskChecks[key] && taskChecks[key][taskId]); }
function playTapSound() { try { new Audio('走路踢到石头石子.mp3').play().catch(() => {}); } catch (e) {} }
function playDeleteSound() { try { new Audio('枯枝.mp3').play().catch(() => {}); } catch (e) {} }
function burstConfetti(x, y) {
  const colors = getComputedStyle(document.documentElement);
  const palette = [
    (colors.getPropertyValue('--accent') || '#f48fb1').trim(),
    (colors.getPropertyValue('--goal-text') || '#d2568a').trim(),
    (colors.getPropertyValue('--warn-text') || '#c07b2a').trim(),
    '#fff3d6', '#f48fb1', '#e8a87c', '#e8c9a0'
  ].filter(c => c);
  const pieceCount = 18;
  for (let i = 0; i < pieceCount; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / pieceCount + (Math.random() - 0.5) * 0.8;
    const dist = 60 + Math.random() * 80;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.background = palette[i % palette.length];
    el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist - 30) + 'px');
    el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    el.style.width = (5 + Math.random() * 5) + 'px';
    el.style.height = (5 + Math.random() * 5) + 'px';
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function bumpCheck(habitId) {
  const key = todayKey();
  const day = checkins[key] || (checkins[key] = {});
  const wasDone = isDone(habitId);
  day[habitId] = Math.min(goalFor(habitId), (day[habitId] || 0) + 1);
  save(); render(); playTapSound();
  if (!wasDone && isDone(habitId)) {
    const item = habitList.querySelector("[data-habit-id=\"" + habitId + "\"]");
    const btn = item ? item.querySelector(".check-btn") : null;
    if (btn) { btn.classList.add("pop"); btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true }); }
    if (btn) { const r = btn.getBoundingClientRect(); burstConfetti(r.left + r.width/2, r.top + r.height/2); }
  }
  const summaryEl = document.querySelector(".habit-summary");
  if (summaryEl) { summaryEl.classList.add("celebrate"); summaryEl.addEventListener("animationend", () => summaryEl.classList.remove("celebrate"), { once: true }); }
}
function decreaseCheck(habitId) {
  const key = todayKey();
  const day = checkins[key];
  if (!day || !(day[habitId] > 0)) return;
  day[habitId] -= 1;
  if (day[habitId] <= 0) delete day[habitId];
  if (Object.keys(day).length === 0) delete checkins[key];
  save(); render();
}
function currentStreak(habitId) {
  if (!isDone(habitId)) return 0;
  let c = 0;
  const cursor = new Date();
  while (isDone(habitId, toKey(cursor))) { c++; cursor.setDate(cursor.getDate() - 1); }
  return c;
}
function addHabit(name, goalValue) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (habits.some(h => h.name.toLowerCase() === trimmed.toLowerCase())) {
    showFeedback('这个习惯已经存在'); return;
  }
  habits.push({ id: makeId(), name: trimmed, goal: normalizeGoal(goalValue) });
  save(); render(); habitInput.value = ''; goalInput.value = '1'; habitInput.focus();
}
function deleteHabit(habitId) {
  habits = habits.filter(h => h.id !== habitId);
  for (const key of Object.keys(checkins)) {
    delete checkins[key][habitId];
    if (Object.keys(checkins[key]).length === 0) delete checkins[key];
  }
  save(); render(); playDeleteSound();
}
function addTask(value) {
  const trimmed = value.trim();
  if (!trimmed) return;
  tasks.push({ id: makeId(), text: trimmed, createdAt: todayKey() });
  save(); renderTasks(); taskInput.value = ''; taskInput.focus();
}
function deleteTask(taskId) {
  tasks = tasks.filter(t => t.id !== taskId);
  for (const key of Object.keys(taskChecks)) {
    delete taskChecks[key][taskId];
    if (Object.keys(taskChecks[key]).length === 0) delete taskChecks[key];
  }
  save(); renderTasks(); playDeleteSound();
}
function toggleTask(taskId) {
  const key = todayKey();
  const day = taskChecks[key] || (taskChecks[key] = {});
  const wasDone = taskDone(taskId);
  if (day[taskId]) delete day[taskId];
  else day[taskId] = true;
  if (Object.keys(day).length === 0) delete taskChecks[key];
  save(); renderTasks(); playTapSound();
  if (!wasDone && taskDone(taskId)) {
    const item = taskList.querySelector("[data-task-id=\"" + taskId + "\"]");
    const btn = item ? item.querySelector(".task-check") : null;
    if (btn) { btn.classList.add("pop"); btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true }); }
    if (btn) { const r = btn.getBoundingClientRect(); burstConfetti(r.left + r.width/2, r.top + r.height/2); }
  }
}
function clearAllData() {
  if (StorageManager._fileHandle) {
    StorageManager.stopWatching();
    StorageManager._fileHandle.remove?.(); // 在 Service Workers 中移除
    StorageManager._fileHandle = null;
    StorageManager._removeStoredFileHandle();
  }
  habits = []; checkins = {}; tasks = []; taskChecks = {}; diaries = {};
  save(); closeConfirm(); render(); renderTasks(); renderDiary(); showFeedback('已清空全部数据');
  updateFileStatus('');
}
function openConfirm() { confirmMask.hidden = false; cancelClear.focus(); }
function closeConfirm() { confirmMask.hidden = true; clearBtn.focus(); }
function openGoalEditor(habitId) {
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return;
  editingHabitId = habitId;
  goalHabitName.textContent = habit.name;
  goalDialogInput.value = String(habit.goal);
  goalMask.hidden = false;
  goalDialogInput.focus();
  goalDialogInput.select();
}
function closeGoalEditor() { goalMask.hidden = true; editingHabitId = null; }
function saveGoalEditor() {
  if (!editingHabitId) return;
  const habit = habits.find(h => h.id === editingHabitId);
  if (habit) { habit.goal = normalizeGoal(goalDialogInput.value); save(); render(); }
  closeGoalEditor();
}
function showFeedback(msg) { feedback.textContent = msg; feedback.classList.add('show'); clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 1600); }
function showDiaryStatus(msg) { diaryStatus.textContent = msg; clearTimeout(diaryStatusTimer); diaryStatusTimer = setTimeout(() => diaryStatus.textContent = '', 1800); }

// ---------- 渲染函数 ----------
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
  minusBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>';
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
    checkBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>';
  } else {
    checkBtn.setAttribute('aria-pressed', 'false');
    checkBtn.setAttribute('aria-label', `「${habit.name}」打卡一次`);
    checkBtn.title = '打卡一次';
    checkBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>';
    checkBtn.addEventListener('click', () => bumpCheck(habit.id));
  }
  counter.appendChild(checkBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute('aria-label', `删除「${habit.name}」`);
  deleteBtn.title = '删除习惯';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>';
  deleteBtn.addEventListener('click', () => deleteHabit(habit.id));

  item.setAttribute("data-habit-id", habit.id);
  item.append(avatar, info, counter, deleteBtn);
  return item;
}

function createTaskItem(task) {
  const done = taskDone(task.id);
  const isCarriedOver = task.createdAt < todayKey();
  const item = document.createElement('li');
  item.className = 'task-item' + (done ? ' done' : '') + (isCarriedOver ? ' carried-over' : '');

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'check-btn task-check';
  checkBtn.setAttribute('aria-pressed', String(done));
  checkBtn.setAttribute('aria-label', done ? `撤销「${task.text}」` : `完成「${task.text}」`);
  checkBtn.title = done ? '撤销完成' : '完成任务';
  if (done) {
    checkBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>';
  }
  checkBtn.addEventListener('click', () => toggleTask(task.id));

  const name = document.createElement('span');
  const textSpan = document.createElement('span');
  textSpan.className = 'task-name';
  textSpan.textContent = task.text;
  if (isCarriedOver) {
    const carryTag = document.createElement('span');
    carryTag.className = 'carry-tag';
    carryTag.textContent = '上日遗留';
    name.appendChild(carryTag);
  }
  name.appendChild(textSpan);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn task-delete';
  deleteBtn.setAttribute('aria-label', `删除任务「${task.text}」`);
  deleteBtn.title = '删除任务';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>';
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  item.setAttribute("data-task-id", task.id);
  item.append(checkBtn, name, deleteBtn);
  return item;
}

function createDiaryEntry(entryKey) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'diary-entry' + (entryKey === diaryDate.value ? ' is-active' : '');

  const date = document.createElement('span');
  date.className = 'diary-entry-date';
  date.textContent = formatDiaryDate(entryKey);

  const preview = document.createElement('span');
  preview.className = 'diary-entry-preview';
  preview.textContent = diaries[entryKey].text.replace(/\s+/g, ' ');

  button.append(date, preview);
  button.addEventListener('click', () => {
    diaryDate.value = entryKey;
    renderDiary();
  });
  li.appendChild(button);
  return li;
}

function renderCalendar() {
  const selectedKey = diaryDate.value || todayKey();
  const view = calendarViewDate || dateFromKey(selectedKey);
  const year = view.getFullYear();
  const month = view.getMonth();
  calMonthLabel.textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = toKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cal-day';
    button.textContent = String(date.getDate());
    button.dataset.key = key;

    if (date.getMonth() !== month) button.classList.add('is-other-month');
    if (key === todayKey()) button.classList.add('is-today');
    if (key === selectedKey) button.classList.add('is-selected');
    if (diaries[key]) button.classList.add('has-entry');
    button.setAttribute('aria-label', `${formatDiaryDate(key)}${diaries[key] ? '，已写日记' : ''}`);
    button.addEventListener('click', () => selectCalendarDate(key));
    cells.push(button);
  }

  calGrid.replaceChildren(...cells);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const count = Object.keys(diaries).filter((key) => key.startsWith(monthPrefix)).length;
  calEntryCount.textContent = count ? `本月 ${count} 篇` : '本月还没有日记';
}

function render() {
  dateLabel.textContent = formatDate();
  habitList.replaceChildren(...habits.map(createHabitItem));
  const doneHabits = habits.filter(h => isDone(h.id)).length;
  const doneUnits = habits.reduce((sum, h) => sum + Math.min(countFor(h.id), h.goal), 0);
  const totalUnits = habits.reduce((sum, h) => sum + h.goal, 0);
  doneCountEl.textContent = doneHabits;
  totalCountEl.textContent = habits.length;
  progressFill.style.width = totalUnits ? `${Math.round((doneUnits / totalUnits) * 100)}%` : '0%';
  emptyState.classList.toggle('hidden', habits.length > 0);
}
function renderTasks() {
  taskList.replaceChildren(...tasks.map(createTaskItem));
  const doneCount = tasks.filter(t => taskDone(t.id)).length;
  taskDoneCountEl.textContent = doneCount;
  const todayTasks = tasks.filter(t => t.createdAt === todayKey());
  taskTotalCountEl.textContent = todayTasks.length || tasks.length;
  taskEmptyState.classList.toggle('hidden', tasks.length > 0);
}
function renderDiary() {
  if (!diaryDate.value) diaryDate.value = todayKey();
  const key = diaryDate.value;
  const entry = diaries[key];
  diaryDateLabel.textContent = formatDiaryDate(key);
  diaryText.value = entry ? entry.text : '';
  diaryList.replaceChildren(...Object.keys(diaries).sort((a, b) => a < b ? 1 : -1).map(createDiaryEntry));
  diaryEmptyState.classList.toggle('hidden', Object.keys(diaries).length > 0);
  if (calendarPopover.classList.contains('is-open')) renderCalendar();
}
function saveDiary() {
  const key = diaryDate.value;
  if (!key) return;
  const text = diaryText.value.trim();
  if (text) { diaries[key] = { text, updatedAt: Date.now() }; }
  else { delete diaries[key]; }
  save(); renderDiary(); showDiaryStatus(text ? '已保存' : '已清空');
}

function closeCalendar() {
  calendarPopover.classList.remove('is-open');
  calendarPopover.parentElement.classList.remove('is-open');
  diaryDateTrigger.setAttribute('aria-expanded', 'false');
}
function openCalendar() {
  const base = diaryDate.value ? dateFromKey(diaryDate.value) : new Date();
  calendarViewDate = new Date(base.getFullYear(), base.getMonth(), 1);
  renderCalendar();
  calendarPopover.classList.add('is-open');
  calendarPopover.parentElement.classList.add('is-open');
  diaryDateTrigger.setAttribute('aria-expanded', 'true');
  const selected = calGrid.querySelector('.cal-day.is-selected');
  if (selected) selected.focus();
}
function shiftCalendarMonth(offset) {
  const view = calendarViewDate || dateFromKey(diaryDate.value || todayKey());
  calendarViewDate = new Date(view.getFullYear(), view.getMonth() + offset, 1);
  renderCalendar();
}
function selectCalendarDate(key) {
  diaryDate.value = key;
  calendarViewDate = null;
  renderDiary();
  closeCalendar();
}

// ---------- 滑块更新 ----------
function updateTabBackground() {
  const container = document.getElementById('viewTabs');
  const activeTab = container.querySelector('.view-tab.is-active');
  if (!activeTab) return;
  const cr = container.getBoundingClientRect();
  const tr = activeTab.getBoundingClientRect();
  tabBgSlider.style.left = (tr.left - cr.left) + 'px';
  tabBgSlider.style.width = tr.width + 'px';
}

// ---------- 视图切换 ----------
function switchView(view) {
  activeView = view;
  const tabs = { habits: tabHabits, tasks: tabTasks, diary: tabDiary };
  for (const [name, tab] of Object.entries(tabs)) {
    const active = name === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  habitsPanel.hidden = view !== 'habits';
  tasksPanel.hidden = view !== 'tasks';
  diaryPanel.hidden = view !== 'diary';
  closeCalendar();
  updateTabBackground();
}

// ============================================================
// 滑动切换
// ============================================================

// 统一处理滑动：监听 window，根据当前活动面板决定行为
function setupSwipe() {
  // 全局触摸事件监听
  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isTouchSwiping = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (isTouchSwiping) return;
    const touch = e.touches[0];
    const diffX = Math.abs(touch.clientX - touchStartX);
    const diffY = Math.abs(touch.clientY - touchStartY);

    // 水平滑动超过阈值
    if (diffX > 15 && diffX > diffY * 1.5) {
      isTouchSwiping = true;
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!isTouchSwiping) {
      touchStartX = 0;
      return;
    }

    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartX;
    const elapsed = Date.now() - touchStartTime;

    // 重置状态
    touchStartX = 0;
    isTouchSwiping = false;

    // 最小滑动距离和最大时间
    if (Math.abs(diffX) < 50 || elapsed > 500) return;

    // 日历弹出层打开时，不处理任何滑动
    if (calendarPopover.classList.contains('is-open')) return;

    // 当前活动面板
    const isDiaryActive = diaryPanel && !diaryPanel.hidden;
    const isTasksActive = tasksPanel && !tasksPanel.hidden;
    const isHabitsActive = habitsPanel && !habitsPanel.hidden;

    // 日记面板：水平滑动切换日期
    if (isDiaryActive) {
      const currentKey = diaryDate.value || todayKey();
      const currentDate = dateFromKey(currentKey);
      let newDate;
      if (diffX < 0) {
        // 左滑 → 明天
        newDate = addDays(currentDate, 1);
      } else {
        // 右滑 → 昨天
        newDate = addDays(currentDate, -1);
      }
      const newKey = toKey(newDate);
      diaryDate.value = newKey;
      calendarViewDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
      renderDiary();
      renderCalendar();
      return;
    }

    // 其他面板：水平滑动切换视图
    if (isTasksActive || isHabitsActive) {
      const views = ['habits', 'tasks', 'diary'];
      const currentIdx = views.indexOf(activeView);
      if (diffX < 0 && currentIdx < views.length - 1) {
        // 左滑 → 下一个
        switchView(views[currentIdx + 1]);
      } else if (diffX > 0 && currentIdx > 0) {
        // 右滑 → 上一个
        switchView(views[currentIdx - 1]);
      }
    }
  }, { passive: true });
}

// ============================================================
// 配色管理系统
// ============================================================
function getStoredColors() {
  try {
    if (StorageManager._fileHandle) {
      // 文件模式下，尝试从文件加载（异步，这里返回缓存）
      return null;
    }
    const raw = localStorage.getItem(COLOR_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return null;
}
function storeColors(colors) {
  try {
    if (StorageManager._fileHandle) {
      // 保存到文件（异步）
      const data = StorageManager._exportData();
      data.colors = colors;
      StorageManager._fileHandle.createWritable().then(w => w.write(JSON.stringify(data, null, 2)).then(c => c.close())).catch(console.error);
    } else {
      localStorage.setItem(COLOR_CONFIG_KEY, JSON.stringify(colors));
    }
  } catch (e) {}
}
function getCurrentModeColors() {
  const stored = getStoredColors();
  const mode = currentPaletteMode;
  if (stored && stored[mode]) {
    return { ...DEFAULT_COLORS[mode], ...stored[mode] };
  }
  return { ...DEFAULT_COLORS[mode] };
}
function applyColorsToDocument(colors) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    if (value) root.style.setProperty(key, value);
  }
  const sliderColor = colors['--slider-bg'];
  if (sliderColor) {
    tabBgSlider.style.background = sliderColor;
  } else {
    tabBgSlider.style.background = '';
  }
}
function loadAndApplyColors() {
  const colors = getCurrentModeColors();
  applyColorsToDocument(colors);
  updatePaletteInputs(colors);
  if (colorPicker && !colorPicker.hidden && activeColorInput) {
    refreshPickerControls(activeColorInput.value);
  }
}
function syncColorWrap(input, color) {
  const wrap = input.closest('.color-input-wrap');
  if (wrap) wrap.style.background = color;
}
function updatePaletteInputs(colors) {
  const inputs = paletteGroups.querySelectorAll('input[data-var]');
  for (const input of inputs) {
    const varName = input.dataset.var;
    if (colors[varName]) {
      input.value = colors[varName];
      syncColorWrap(input, colors[varName]);
    }
  }
  const sliderVal = colors['--slider-bg'];
  if (sliderVal) {
    paletteSliderColor.value = sliderVal;
    syncColorWrap(paletteSliderColor, sliderVal);
  } else {
    const defaultColor = currentPaletteMode === 'light' ? '#fffdf9' : '#2a2420';
    paletteSliderColor.value = defaultColor;
    syncColorWrap(paletteSliderColor, defaultColor);
  }
}
function saveCurrentColors() {
  const inputs = paletteGroups.querySelectorAll('input[data-var]');
  const colors = {};
  for (const input of inputs) {
    colors[input.dataset.var] = input.value;
  }
  colors['--slider-bg'] = paletteSliderColor.value;
  const stored = getStoredColors() || {};
  stored[currentPaletteMode] = colors;
  storeColors(stored);
  loadAndApplyColors();
  renderPresetList();
}
function resetAllColors() {
  if (!confirm('确定要重置全部配色吗？这将删除所有自定义颜色（亮色和暗色）。')) return;
  if (StorageManager._fileHandle) {
    // 清空内存中的配色
    const colors = getStoredColors() || {};
    delete colors['light'];
    delete colors['dark'];
    storeColors(colors);
  } else {
    localStorage.removeItem(COLOR_CONFIG_KEY);
  }
  loadAndApplyColors();
  showFeedback('已重置全部配色');
}

// ============================================================
// 色块管理
// ============================================================
function getStoredSwatches() {
  try {
    if (StorageManager._fileHandle) {
      return null; // 实际会在 loadFromFile 中处理
    }
    const raw = localStorage.getItem(SWATCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}
function storeSwatches(swatches) {
  try {
    if (StorageManager._fileHandle) {
      const data = StorageManager._exportData();
      data.swatches = swatches;
      StorageManager._fileHandle.createWritable().then(w => w.write(JSON.stringify(data, null, 2)).then(c => c.close())).catch(console.error);
    } else {
      localStorage.setItem(SWATCHES_KEY, JSON.stringify(swatches));
    }
  } catch (e) {}
}

function getSwatchesForVar(varName) {
  const stored = getStoredSwatches();
  if (stored && varName && stored[varName] && Array.isArray(stored[varName]) && stored[varName].length > 0) {
    return [...stored[varName]]; // 返回副本
  }
  return [...(DEFAULT_SWATCHES[varName] || ['#FFFFFF', '#E0E0E0', '#BDBDBD'])];
}

function setSwatchesForVar(varName, colors) {
  const stored = getStoredSwatches();
  stored[varName] = colors;
  storeSwatches(stored);
}

function resetSwatchesForGroup(groupName) {
  window._editingSwatch = null; // 清理编辑状态
  const vars = GROUP_VARS[groupName] || [];
  const stored = getStoredSwatches();
  for (const v of vars) {
    delete stored[v];
  }
  storeSwatches(stored);
  // 重新渲染该分组下的色块
  const groupEl = paletteGroups.querySelector(`.palette-group[data-group="${groupName}"]`);
  if (groupEl) {
    const items = groupEl.querySelectorAll('.palette-item');
    for (const item of items) {
      const input = item.querySelector('input[data-var]');
      if (input) {
        renderSwatchesForItem(item, input.dataset.var);
      }
    }
  }
}

function renderSwatchesForItem(item, varName) {
  const oldContainer = item.querySelector('.swatch-container');
  if (oldContainer) oldContainer.remove();

  const colors = getSwatchesForVar(varName);
  const container = document.createElement('div');
  container.className = 'swatch-container';

  for (const color of colors) {
    const span = document.createElement('span');
    span.className = 'swatch';
    span.style.background = color;
    span.dataset.color = color;
    span.dataset.var = varName;
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label', `颜色 ${color}${color !== colors[0] ? '，双击编辑' : ''}`);

    const defaultList = DEFAULT_SWATCHES[varName] || [];
    if (!defaultList.includes(color)) {
      span.dataset.edited = 'true';
    }

    let clickTimer = null;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const input = item.querySelector('input[data-var]');
        if (input) {
          input.value = color;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 180);
    });

    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      const input = item.querySelector('input[data-var]');
      if (!input) return;
      window._editingSwatch = span;
      openColorPicker(input, color, span);
    });

    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        span.click();
      }
    });

    container.appendChild(span);
  }

  const row = item.querySelector('.palette-item-row');
  if (row) {
    row.parentNode.insertBefore(container, row.nextSibling);
  } else {
    item.appendChild(container);
  }
}

function setupColorInputSync() {
  paletteGroups.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.matches('input[data-var]') && input.id !== 'paletteSliderColor') return;
    const varName = input.dataset.var || '--slider-bg';
    const newColor = input.value;

    if (window._editingSwatch) {
      const swatch = window._editingSwatch;
      swatch.style.background = newColor;
      swatch.dataset.color = newColor;
      swatch.dataset.edited = 'true';
      const item = swatch.closest('.palette-item');
      if (item) {
        const varName2 = item.querySelector('input[data-var]')?.dataset.var || varName;
        const colors = getSwatchesForVar(varName2);
        const idx = colors.findIndex(c => c === swatch.dataset.color || c === newColor);
        if (idx !== -1) {
          colors[idx] = newColor;
        } else {
          colors.push(newColor);
        }
        setSwatchesForVar(varName2, colors);
      }
      window._editingSwatch = null;
    }
    saveCurrentColors();
  });

  document.addEventListener('click', () => {
    if (window._editingSwatch) {
      window._editingSwatch = null;
    }
  });
}

function initAllSwatches() {
  const items = paletteGroups.querySelectorAll('.palette-item');
  for (const item of items) {
    const input = item.querySelector('input[data-var]');
    if (input) {
      renderSwatchesForItem(item, input.dataset.var);
    }
  }
  const sliderItem = paletteSliderColor.closest('.palette-item');
  if (sliderItem) {
    const varName = paletteSliderColor.dataset.var || '--slider-bg';
    renderSwatchesForItem(sliderItem, varName);
  }
}

// ---------- 重置色板（事件委托，只绑定一次） ----------
function setupResetSwatches() {
  // 使用事件委托，移除之前可能绑定的重复监听
  paletteGroups.removeEventListener('click', resetSwatchesHandler);
  paletteGroups.addEventListener('click', resetSwatchesHandler);
}

function resetSwatchesHandler(e) {
  const btn = e.target.closest('.reset-swatches-btn');
  if (!btn) return;
  e.stopPropagation();
  const group = btn.dataset.group;
  if (!group) return;
  const groupName = btn.closest('.palette-group')?.querySelector('h3')?.textContent || group;
  if (!confirm(`确定要重置「${groupName}」的色板吗？`)) return;
  resetSwatchesForGroup(group);
  showFeedback('已重置色板');
}

// ============================================================
// 自研取色器
// ============================================================
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let value = hex.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    value = value.split('').map(ch => ch + ch).join('');
  }
  if (!/^[0-9a-f]{6}$/.test(value)) return null;
  return '#' + value;
}

function hexToHsv(hex) {
  const parsed = parseHex(hex) || '#000000';
  const r = parseInt(parsed.slice(1, 3), 16) / 255;
  const g = parseInt(parsed.slice(3, 5), 16) / 255;
  const b = parseInt(parsed.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToHex(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const val = Math.min(100, Math.max(0, v)) / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getInputForWrap(wrap) {
  return wrap.querySelector('input[data-var]');
}

function refreshPickerControls(hex) {
  const parsed = parseHex(hex);
  if (!parsed) return;
  const { h, s, v } = hexToHsv(parsed);
  const hue = Math.round(h) % 360;
  pickerHue.value = String(hue);
  document.documentElement.style.setProperty('--picker-hue', String(hue));
  pickerSvThumb.style.left = `${s}%`;
  pickerSvThumb.style.top = `${100 - v}%`;
  pickerPreview.style.background = parsed;
  pickerHex.value = parsed.toUpperCase();
  if (activeColorInput) {
    syncColorWrap(activeColorInput, parsed);
  }
}

function positionColorPicker(anchor) {
  const rect = anchor.getBoundingClientRect();
  const pickerRect = colorPicker.getBoundingClientRect();
  const gap = 8;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + pickerRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - pickerRect.width - 8);
  }
  if (top + pickerRect.height > window.innerHeight - 8) {
    top = rect.top - pickerRect.height - gap;
    if (top < 8) top = Math.max(8, window.innerHeight - pickerRect.height - 8);
  }
  colorPicker.style.left = `${Math.round(left)}px`;
  colorPicker.style.top = `${Math.round(top)}px`;
}

function openColorPicker(input, initialHex, editingSwatch = null) {
  if (!input) return;
  window._editingSwatch = editingSwatch;
  activeColorInput = input;
  const hex = parseHex(initialHex) || parseHex(input.value) || '#ffffff';
  input.value = hex;
  refreshPickerControls(hex);
  colorPicker.hidden = false;
  positionColorPicker(input.closest('.color-input-wrap') || input);
}

function closeColorPicker() {
  if (colorPicker) colorPicker.hidden = true;
  activeColorInput = null;
  window._editingSwatch = null;
}

function applyPickerColor(hex) {
  const parsed = parseHex(hex);
  if (!parsed || !activeColorInput) return;
  activeColorInput.value = parsed;
  activeColorInput.dispatchEvent(new Event('input', { bubbles: true }));
  refreshPickerControls(parsed);
}

function svFromEvent(e) {
  const rect = pickerSvArea.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { s: x * 100, v: (1 - y) * 100 };
}

function updateFromSv(e) {
  const { s, v } = svFromEvent(e);
  const hue = Number(pickerHue.value) || 0;
  applyPickerColor(hsvToHex(hue, s, v));
}

function setupColorTriggers() {
  paletteGroups.querySelectorAll('.color-input-wrap').forEach((wrap) => {
    const input = getInputForWrap(wrap);
    if (!input) return;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    input.setAttribute('tabindex', '-1');
    input.setAttribute('aria-hidden', 'true');
    const label = wrap.closest('.palette-item')?.querySelector('label')?.textContent || '颜色';
    wrap.setAttribute('aria-label', `选择${label}颜色`);
  });
}

function setupColorPicker() {
  setupColorTriggers();

  paletteGroups.addEventListener('click', (e) => {
    const wrap = e.target.closest('.color-input-wrap');
    if (!wrap) return;
    e.preventDefault();
    openColorPicker(getInputForWrap(wrap));
  });

  paletteGroups.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const wrap = e.target.closest('.color-input-wrap');
    if (!wrap) return;
    e.preventDefault();
    openColorPicker(getInputForWrap(wrap));
  });

  colorPicker.addEventListener('click', (e) => e.stopPropagation());

  pickerSvArea.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pickerDragging = true;
    if (pickerSvArea.setPointerCapture) pickerSvArea.setPointerCapture(e.pointerId);
    updateFromSv(e);
  });
  pickerSvArea.addEventListener('pointermove', (e) => {
    if (pickerDragging) updateFromSv(e);
  });
  pickerSvArea.addEventListener('pointerup', () => { pickerDragging = false; });
  pickerSvArea.addEventListener('pointercancel', () => { pickerDragging = false; });
  document.addEventListener('pointerup', () => { pickerDragging = false; });

  pickerHue.addEventListener('input', () => {
    if (!activeColorInput) return;
    const hue = Number(pickerHue.value) || 0;
    document.documentElement.style.setProperty('--picker-hue', String(hue));
    const { s, v } = hexToHsv(activeColorInput.value);
    applyPickerColor(hsvToHex(hue, s, v));
  });

  pickerHex.addEventListener('input', () => {
    if (!activeColorInput) return;
    const parsed = parseHex(pickerHex.value);
    if (parsed) applyPickerColor(parsed);
  });
  pickerHex.addEventListener('change', () => {
    if (!activeColorInput) return;
    const parsed = parseHex(pickerHex.value);
    if (parsed) applyPickerColor(parsed);
    else refreshPickerControls(activeColorInput.value);
  });

  document.addEventListener('click', (e) => {
    if (colorPicker.hidden) return;
    if (!e.target.closest('#colorPicker') && !e.target.closest('.color-input-wrap')) {
      closeColorPicker();
    }
  });

  if (palettePanel) {
    palettePanel.addEventListener('scroll', closeColorPicker, { passive: true });
  }
}

// ============================================================
// 预设管理
// ============================================================
function getPresets() {
  try {
    if (StorageManager._fileHandle) {
      // 文件模式下从文件加载，返回空对象让默认预设显示
      return null;
    }
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}
function savePresets(presets) {
  if (!presets || typeof presets !== 'object') return;
  try {
    if (StorageManager._fileHandle) {
      const data = StorageManager._exportData();
      data.presets = presets;
      StorageManager._fileHandle.createWritable().then(w => w.write(JSON.stringify(data, null, 2)).then(c => c.close())).catch(console.error);
    } else {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    }
  } catch (e) {}
}

function renderPresetList() {
  const presets = getPresets();
  if (!presets) {
    presetList.innerHTML = '<li class="preset-empty">文件模式下预设存储在文件中</li>';
    return;
  }
  const names = Object.keys(presets);
  if (names.length === 0) {
    presetList.innerHTML = '<li class="preset-empty">暂无预设，保存当前配色试试</li>';
    return;
  }
  presetList.innerHTML = '';
  for (const name of names) {
    const li = document.createElement('li');
    li.className = 'preset-item';
    const span = document.createElement('span');
    span.className = 'preset-name';
    span.textContent = name;
    const actions = document.createElement('div');
    actions.className = 'preset-actions';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'preset-load';
    loadBtn.textContent = '加载';
    loadBtn.addEventListener('click', () => loadPreset(name));
    const delBtn = document.createElement('button');
    delBtn.className = 'preset-del';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => deletePreset(name));
    actions.append(loadBtn, delBtn);
    li.append(span, actions);
    presetList.appendChild(li);
  }
}

function loadPreset(name) {
  const presets = getPresets();
  const preset = presets[name];
  if (!preset) return;
  const stored = getStoredColors() || {};
  for (const mode of ['light', 'dark']) {
    if (preset[mode]) {
      stored[mode] = { ...stored[mode], ...preset[mode] };
    }
  }
  storeColors(stored);
  loadAndApplyColors();
  renderPresetList();
  showFeedback(`已加载预设「${name}」`);
}

function deletePreset(name) {
  if (!confirm(`确定要删除预设「${name}」吗？`)) return;
  const presets = getPresets();
  delete presets[name];
  savePresets(presets);
  renderPresetList();
  showFeedback(`已删除预设「${name}」`);
}

function saveNewPreset(name) {
  const trimmed = name.trim();
  if (!trimmed) { showFeedback('请输入预设名称'); return; }
  const presets = getPresets();
  if (presets[trimmed]) {
    pendingOverwriteName = trimmed;
    presetOverwriteBtn.style.display = 'inline-flex';
    presetSaveBtn.textContent = '另存为新名称';
    showFeedback(`预设「${trimmed}」已存在，点击“覆盖”或“另存为新名称”`);
    return;
  }
  const currentColors = getStoredColors() || {};
  presets[trimmed] = JSON.parse(JSON.stringify(currentColors));
  savePresets(presets);
  renderPresetList();
  presetNameInput.value = '';
  presetSaveBtn.textContent = '保存为新预设';
  presetOverwriteBtn.style.display = 'none';
  showFeedback(`预设「${trimmed}」已保存`);
}

function overwritePreset(name) {
  const presets = getPresets();
  const currentColors = getStoredColors() || {};
  presets[name] = JSON.parse(JSON.stringify(currentColors));
  savePresets(presets);
  renderPresetList();
  presetNameInput.value = '';
  presetSaveBtn.textContent = '保存为新预设';
  presetOverwriteBtn.style.display = 'none';
  pendingOverwriteName = null;
  showFeedback(`预设「${name}」已覆盖`);
}

// ---------- 配色面板 UI ----------
function togglePaletteMode() {
  currentPaletteMode = currentPaletteMode === 'light' ? 'dark' : 'light';
  updatePaletteModeUI();
  loadAndApplyColors();
  initAllSwatches();
}
function updatePaletteModeUI() {
  const isLight = currentPaletteMode === 'light';
  paletteModeLabel.textContent = isLight ? '亮色模式' : '暗色模式';
  paletteMask.classList.toggle('palette-mode-light', isLight);
}

function syncPaletteModeWithTheme() {
  currentPaletteMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function openPalette() {
  closeColorPicker();
  syncPaletteModeWithTheme();
  updatePaletteModeUI();
  loadAndApplyColors();
  renderPresetList();
  initAllSwatches();
  setupResetSwatches(); // 确保委托已绑定（只绑定一次）
  paletteMask.hidden = false;
}
function closePalette() {
  closeColorPicker();
  syncPaletteModeWithTheme();
  loadAndApplyColors();
  paletteMask.hidden = true;
}

paletteBtn.addEventListener('click', openPalette);
paletteClose.addEventListener('click', closePalette);
paletteMask.addEventListener('click', (e) => { if (e.target === paletteMask) closePalette(); });
paletteModeToggle.addEventListener('click', togglePaletteMode);
paletteResetAll.addEventListener('click', resetAllColors);

presetSaveBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) { showFeedback('请输入预设名称'); return; }
  const presets = getPresets();
  if (presets[name]) {
    pendingOverwriteName = name;
    presetOverwriteBtn.style.display = 'inline-flex';
    presetSaveBtn.textContent = '另存为新名称';
    showFeedback(`预设「${name}」已存在，点击“覆盖”或“另存为新名称”`);
    return;
  }
  saveNewPreset(name);
});
presetOverwriteBtn.addEventListener('click', () => {
  if (pendingOverwriteName) {
    overwritePreset(pendingOverwriteName);
  }
});
presetNameInput.addEventListener('input', () => {
  const name = presetNameInput.value.trim();
  if (name !== pendingOverwriteName) {
    presetOverwriteBtn.style.display = 'none';
    presetSaveBtn.textContent = '保存为新预设';
    pendingOverwriteName = null;
  }
});
presetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); presetSaveBtn.click(); }
});

// ---------- 主题切换 ----------
function applyTheme(theme) {
  const dark = theme === 'dark';
  currentPaletteMode = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', dark);
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? '切换为日间模式' : '切换为夜间模式');
  themeBtn.title = dark ? '切换为日间模式' : '切换为夜间模式';
  loadAndApplyColors();
}
function loadTheme() {
  let theme = null;
  try {
    if (StorageManager._fileHandle) {
      theme = null; // 从文件加载时主题会在 loadFromFile 中处理
    } else {
      theme = localStorage.getItem(THEME_KEY);
    }
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
}

// ---------- 初始化 ----------
async function init() {
  // 先初始化 StorageManager
  await StorageManager.init();
  loadTheme();
  load();
  render();
  renderTasks();
  renderDiary();
  renderPresetList();
  setupColorInputSync();
  setupColorPicker();
  setupResetSwatches(); // 初始化一次委托
  setupSwipe();
  requestAnimationFrame(updateTabBackground);
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(updateTabBackground, 100); });
  // 页面关闭时清理监听
  window.addEventListener('beforeunload', () => { StorageManager.stopWatching(); });
}

// ---------- 事件绑定 ----------
addForm.addEventListener('submit', (e) => { e.preventDefault(); addHabit(habitInput.value, goalInput.value); });
taskForm.addEventListener('submit', (e) => { e.preventDefault(); addTask(taskInput.value); });
clearBtn.addEventListener('click', openConfirm);
cancelClear.addEventListener('click', closeConfirm);
confirmClear.addEventListener('click', clearAllData);
confirmMask.addEventListener('click', (e) => { if (e.target === confirmMask) closeConfirm(); });
cancelGoal.addEventListener('click', closeGoalEditor);
saveGoal.addEventListener('click', saveGoalEditor);
goalMask.addEventListener('click', (e) => { if (e.target === goalMask) closeGoalEditor(); });
goalDialogInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveGoalEditor(); } });
tabHabits.addEventListener('click', () => switchView('habits'));
tabTasks.addEventListener('click', () => switchView('tasks'));
tabDiary.addEventListener('click', () => switchView('diary'));
diaryToday.addEventListener('click', () => { diaryDate.value = todayKey(); calendarViewDate = null; renderDiary(); closeCalendar(); });
diaryDateTrigger.addEventListener('click', () => { if (calendarPopover.classList.contains('is-open')) closeCalendar(); else openCalendar(); });
calPrevMonth.addEventListener('click', () => shiftCalendarMonth(-1));
calNextMonth.addEventListener('click', () => shiftCalendarMonth(1));
calTodayBtn.addEventListener('click', () => { calendarViewDate = new Date(); renderCalendar(); });
document.addEventListener('click', (e) => { if (calendarPopover.classList.contains('is-open') && !e.target.closest('.calendar-wrap')) closeCalendar(); });
saveDiaryBtn.addEventListener('click', saveDiary);
diaryText.addEventListener('input', () => {
  const pendingKey = diaryDate.value;
  const pendingText = diaryText.value;
  clearTimeout(diarySaveTimer);
  diaryStatus.textContent = '编辑中';
  diarySaveTimer = setTimeout(() => {
    const text = pendingText.trim();
    if (text) { diaries[pendingKey] = { text, updatedAt: Date.now() }; } else { delete diaries[pendingKey]; }
    save(); renderDiary(); showDiaryStatus(text ? '已保存' : '已清空');
  }, 700);
});
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  try {
    if (StorageManager._fileHandle) {
      // 主题保存在文件数据中
      const data = StorageManager._exportData();
      data.theme = next;
      StorageManager._fileHandle.createWritable().then(w => w.write(JSON.stringify(data, null, 2)).then(c => c.close())).catch(console.error);
    } else {
      localStorage.setItem(THEME_KEY, next);
    }
  } catch (e) {}
  applyTheme(next);
});
openFileBtn.addEventListener('click', () => {
  closeFileMenu();
  StorageManager.openFile();
});
saveFileBtn.addEventListener('click', () => {
  closeFileMenu();
  StorageManager.saveFile();
});
exportFileBtn.addEventListener('click', () => {
  closeFileMenu();
  StorageManager.exportFile();
});
fileMenuBtn.addEventListener('click', () => {
  if (fileMenu.hidden) {
    fileMenu.hidden = false;
    fileMenuBtn.setAttribute('aria-expanded', 'true');
  } else {
    closeFileMenu();
  }
});
function closeFileMenu() {
  fileMenu.hidden = true;
  fileMenuBtn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.file-btn') && !e.target.closest('.file-menu')) {
    closeFileMenu();
  }
});
if (window.matchMedia) {
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = (e) => {
    let stored = null;
    try {
      if (StorageManager._fileHandle) {
        stored = null; // 从文件加载
      } else {
        stored = localStorage.getItem(THEME_KEY);
      }
    } catch (err) {}
    if (!stored) applyTheme(e.matches ? 'dark' : 'light');
  };
  if (typeof darkMedia.addEventListener === 'function') darkMedia.addEventListener('change', onSystemChange);
  else if (typeof darkMedia.addListener === 'function') darkMedia.addListener(onSystemChange);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (calendarPopover.classList.contains('is-open')) closeCalendar();
  else if (!goalMask.hidden) closeGoalEditor();
  else if (!confirmMask.hidden) closeConfirm();
  else if (!colorPicker.hidden) closeColorPicker();
  else if (!paletteMask.hidden) closePalette();
});

init();