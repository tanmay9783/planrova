import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { formatDate } from '../utils/date.js';

const HYDRATION_KEY = 'hydration_logs';
const HYDRATION_SETTINGS_KEY = 'hydration_settings';
const HYDRATION_STATUS_KEY = 'hydration';

let eventsInitialized = false;

const defaultSettings = {
  goal: 2000,
  interval: 60,
  quietHours: true,
  diureticCoffee: true
};

export function initHydration() {
  const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
  const dailyStatus = getStorageItem(HYDRATION_STATUS_KEY, { water: 0, target: 2000 });
  
  // Sync setting goal from daily status target if available
  if (dailyStatus && dailyStatus.target) {
    settings.goal = dailyStatus.target;
  }
  
  // Defensive fallbacks for safety
  if (typeof settings.goal !== 'number') settings.goal = 2000;
  if (typeof settings.interval !== 'number') settings.interval = 60;

  const logs = getStorageItem(HYDRATION_KEY, []);
  
  updateHydrationUI(settings, logs);
  setupHydrationEvents();
  setupIntervalReminders(settings);
}

function updateHydrationUI(settings, logs) {
  const todayStr = formatDate(new Date());
  
  // Calculate today's volume
  const todayLogs = logs.filter(l => l.date === todayStr);
  const totalToday = todayLogs.reduce((sum, l) => sum + parseInt(l.amount), 0);
  
  // 1. Update Sidebar Progress widget
  const progressPct = Math.min(100, Math.max(0, Math.round((totalToday / settings.goal) * 100)));
  const ringFill = document.getElementById('water-ring-fill');
  const pctText = document.getElementById('water-widget-pct');
  const pctTextLarge = document.getElementById('water-widget-pct-large');
  const volumeText = document.getElementById('water-widget-volume');
  const statusText = document.getElementById('water-widget-status');
  
  if (pctText) pctText.textContent = `${progressPct}%`;
  if (pctTextLarge) pctTextLarge.textContent = `${progressPct}%`;
  if (volumeText) volumeText.textContent = `${totalToday} / ${settings.goal} ml`;
  
  // Update wellness ring visualizer
  if (ringFill) {
    const circumference = 263.89; // Circumference of radius 42 circle
    const offset = circumference - (progressPct / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
    
    if (progressPct >= 100) {
      if (statusText) statusText.textContent = "Goal reached! 🎉";
    } else {
      if (statusText) statusText.textContent = totalToday > 0 ? "Staying hydrated!" : "Drink some water!";
    }
  }
  
  // 2. Update settings inputs
  const goalInput = document.getElementById('settings-water-goal');
  if (goalInput) goalInput.value = settings.goal;
  
  const intervalInput = document.getElementById('settings-water-interval');
  if (intervalInput) intervalInput.value = settings.interval;
  
  const quietCheck = document.getElementById('settings-water-quiet');
  if (quietCheck) quietCheck.checked = settings.quietHours;
  
  const coffeeToggle = document.getElementById('coffee-diuretic-toggle');
  if (coffeeToggle) coffeeToggle.checked = settings.diureticCoffee;
  
  // 3. Update Weekly Bar Chart & statistics
  renderWeeklyWaterChart(logs, settings.goal);
  
  // 4. Update Streaks & Milestone Badges
  calculateHydrationStreaks(logs, settings.goal);
  
  // 5. Update Logs list
  renderWaterLogsList(logs);
  
  // 6. Check for study blocks inside planner tasks
  checkForContextualTaskHydration();
}

function renderWeeklyWaterChart(logs, goal) {
  const container = document.getElementById('water-weekly-chart');
  if (!container) return;
  container.innerHTML = '';
  
  const today = new Date();
  const weekDays = [];
  
  // Get Mon-Sun of current week
  const start = new Date(today);
  const dayIndex = today.getDay();
  const adjust = dayIndex === 0 ? -6 : 1 - dayIndex;
  start.setDate(today.getDate() + adjust);
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push(d);
  }
  
  let bestDayName = "—";
  let maxVolume = 0;
  let totalSum = 0;
  
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  weekDays.forEach((d, idx) => {
    const dStr = formatDate(d);
    const dayLogs = logs.filter(l => l.date === dStr);
    const dayVol = Math.max(0, dayLogs.reduce((sum, l) => sum + parseInt(l.amount), 0));
    
    totalSum += dayVol;
    if (dayVol > maxVolume) {
      maxVolume = dayVol;
      bestDayName = dayNames[idx];
    }
    
    // Build bar element
    const col = document.createElement('div');
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.alignItems = 'center';
    col.style.height = '100%';
    col.style.justifyContent = 'flex-end';
    col.style.flex = '1';
    
    let pct = (dayVol / goal) * 100;
    if (pct > 100) pct = 100;
    
    col.innerHTML = `
      <span style="font-size:8px; color:var(--text-secondary); margin-bottom:4px;">${dayVol}ml</span>
      <div style="width:12px; height:${Math.max(4, pct * 0.7)}px; background:${dayVol >= goal ? '#34d399' : '#4facfe'}; border-radius:3px; transition: height 0.4s ease;"></div>
      <span style="font-size:9px; color:var(--text-secondary); margin-top:6px;">${dayNames[idx]}</span>
    `;
    container.appendChild(col);
  });
  
  const avg = Math.round(totalSum / 7);
  const statsLabel = document.getElementById('water-best-average');
  if (statsLabel) {
    statsLabel.textContent = `Average: ${avg} ml • Best Day: ${bestDayName} (${maxVolume}ml)`;
  }
}

function calculateHydrationStreaks(logs, goal) {
  const streakLabel = document.getElementById('water-streak-label');
  const badgesList = document.getElementById('water-badges-list');
  if (!streakLabel || !badgesList) return;
  
  // Group logs by date
  const logsByDate = {};
  logs.forEach(l => {
    if (!logsByDate[l.date]) logsByDate[l.date] = 0;
    logsByDate[l.date] += parseInt(l.amount);
  });
  
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dStr = formatDate(d);
    
    const dayVol = logsByDate[dStr] || 0;
    if (dayVol >= goal) {
      streak++;
    } else {
      if (i > 0) break; // Broken
    }
  }
  
  streakLabel.textContent = `${streak} Day Streak`;
  
  // Milestone badges
  badgesList.innerHTML = '';
  const milestones = [
    { days: 7, badge: '⭐' },
    { days: 14, badge: '🌟' },
    { days: 30, badge: '🏆' }
  ];
  
  milestones.forEach(m => {
    if (streak >= m.days) {
      const bSpan = document.createElement('span');
      bSpan.textContent = m.badge;
      bSpan.title = `Milestone hit: ${m.days} Day streak!`;
      badgesList.appendChild(bSpan);
    }
  });
}

function renderWaterLogsList(logs) {
  const container = document.getElementById('water-logs-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (logs.length === 0) {
    container.innerHTML = `<p class="helper-text" style="padding:10px 0; text-align:center;">No drinks logged today.</p>`;
    return;
  }
  
  // Sort descending
  const sorted = [...logs].sort((a,b) => b.timestamp.localeCompare(a.timestamp));
  
  sorted.slice(0, 10).forEach(log => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.style.padding = '6px 0';
    
    const isCoffee = parseInt(log.amount) < 0;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:14px;">${isCoffee ? '☕' : '💧'}</span>
        <span style="font-size:12px; font-weight:600; color:${isCoffee ? '#f87171' : '#e3e3e6'}">${log.type}: ${log.amount}ml</span>
      </div>
      <button class="icon-btn delete-water-log" data-id="${log.id}" style="font-size:10px;">🗑️</button>
    `;
    container.appendChild(row);
  });
  
  container.querySelectorAll('.delete-water-log').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const currentLogs = getStorageItem(HYDRATION_KEY, []);
      const updated = currentLogs.filter(l => l.id !== id);
      setStorageItem(HYDRATION_KEY, updated);
      
      // Update hydration status for mobile sync
      const todayStr = formatDate(new Date());
      const todayVol = updated.filter(l => l.date === todayStr).reduce((sum, l) => sum + parseInt(l.amount), 0);
      const dailyStatus = getStorageItem(HYDRATION_STATUS_KEY, { water: 0, target: 2000 });
      dailyStatus.water = todayVol;
      setStorageItem(HYDRATION_STATUS_KEY, dailyStatus);
      
      initHydration();
    });
  });
}

function setupHydrationEvents() {
  if (eventsInitialized) return;
  eventsInitialized = true;

  // Sidebar widget click
  const widgetCard = document.getElementById('sidebar-water-widget-card');
  if (widgetCard) {
    widgetCard.addEventListener('click', () => {
      const waterOverlay = document.getElementById('water-modal-overlay');
      if (waterOverlay) waterOverlay.classList.remove('hidden');
    });
  }
  
  const closeBtn = document.getElementById('water-modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const waterOverlay = document.getElementById('water-modal-overlay');
      if (waterOverlay) waterOverlay.classList.add('hidden');
    });
  }
  
  // Log Water presets from modal dashboard
  document.querySelectorAll('.log-water-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      let ml = parseInt(btn.dataset.ml);
      let type = ml > 0 ? "Water" : "Coffee/Tea";
      
      const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
      if (ml < 0 && !settings.diureticCoffee) {
        // Option toggled off, ignore coffee deductions
        ml = 200; // Log positive tea hydration
        type = "Tea";
      }
      
      logBeverage(ml, type);
    });
  });
  
  // Quick Sidebar "+ 💧" button logs standard 250ml
  const quickWaterBtn = document.getElementById('sidebar-quick-water-btn');
  if (quickWaterBtn) {
    quickWaterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      logBeverage(250, "Quick Water");
    });
  }
  
  // Save settings
  const saveWaterBtn = document.getElementById('save-water-settings-btn');
  if (saveWaterBtn) {
    saveWaterBtn.addEventListener('click', () => {
      const goalInput = document.getElementById('settings-water-goal');
      const intervalSelect = document.getElementById('settings-water-interval');
      const quietCheck = document.getElementById('settings-water-quiet');
      
      if (goalInput && intervalSelect && quietCheck) {
        const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
        settings.goal = parseInt(goalInput.value) || 2000;
        settings.interval = parseInt(intervalSelect.value) || 60;
        settings.quietHours = quietCheck.checked;
        
        setStorageItem(HYDRATION_SETTINGS_KEY, settings);
        
        // Update target in daily status for mobile sync
        const dailyStatus = getStorageItem(HYDRATION_STATUS_KEY, { water: 0, target: 2000 });
        dailyStatus.target = settings.goal;
        setStorageItem(HYDRATION_STATUS_KEY, dailyStatus);
        
        initHydration();
        showToast("Water settings saved! 💧");
      }
    });
  }
  
  // Coffee toggle changes
  const coffeeToggle = document.getElementById('coffee-diuretic-toggle');
  if (coffeeToggle) {
    coffeeToggle.addEventListener('change', (e) => {
      const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
      settings.diureticCoffee = e.target.checked;
      setStorageItem(HYDRATION_SETTINGS_KEY, settings);
    });
  }
}

import { addXP, logDailyActivity } from './gamification.js';

function logBeverage(amount, type) {
  const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
  const logs = getStorageItem(HYDRATION_KEY, []);

  const newLog = {
    id: 'h_' + Date.now(),
    amount: amount,
    type: type,
    date: formatDate(new Date()),
    timestamp: new Date().toLocaleTimeString()
  };
  
  logs.push(newLog);
  setStorageItem(HYDRATION_KEY, logs);
  
  // Update hydration daily status for mobile sync
  const todayStr = formatDate(new Date());
  const todayVol = logs.filter(l => l.date === todayStr).reduce((sum, l) => sum + parseInt(l.amount), 0);
  setStorageItem(HYDRATION_STATUS_KEY, { water: todayVol, target: settings.goal });
  
  initHydration();
  showToast(amount > 0 ? `Logged +${amount}ml of hydration! 💧` : `Logged coffee: ${amount}ml deduction! ☕`);
  
  if (amount > 0) {
    addXP(5);
    logDailyActivity('water');
  }
}

function checkForContextualTaskHydration() {
  const alertBox = document.getElementById('water-contextual-alert');
  if (!alertBox) return;
  
  const tasks = getStorageItem('tasks', []);
  const todayStr = formatDate(new Date());
  
  // Look for any study task today (e.g. titles containing study, exam, reading, learn, revision)
  const studyTask = tasks.find(t => {
    if (t.date !== todayStr) return false;
    const title = t.title.toLowerCase();
    return title.includes('study') || title.includes('exam') || title.includes('maths') || title.includes('physics') || title.includes('lecture') || title.includes('rev');
  });
  
  if (studyTask) {
    alertBox.innerHTML = `
      💡 <strong>Study Context:</strong> You have a study session <strong>"${studyTask.title}"</strong> scheduled.
      Drink 250ml of water right before it starts to optimize focus and concentration! 📚🧠
    `;
    alertBox.classList.remove('hidden');
  } else {
    alertBox.classList.add('hidden');
  }
}

// In-app recurring hydration popups
let waterReminderTimer = null;
function setupIntervalReminders(settings) {
  clearInterval(waterReminderTimer);
  
  const intervalMins = parseInt(settings.interval) || 60;
  const intervalMs = intervalMins * 60 * 1000;
  
  if (isNaN(intervalMs) || intervalMs <= 0) return;
  
  waterReminderTimer = setInterval(() => {
    if (settings.quietHours) {
      // Quiet hours auto-pause: skip if between 10 PM and 7 AM
      const hrs = new Date().getHours();
      if (hrs >= 22 || hrs < 7) return;
    }
    
    // Trigger in-app hydration toast
    triggerHydrationReminderToast(settings);
  }, intervalMs);
}

function triggerHydrationReminderToast(settings) {
  const logs = getStorageItem(HYDRATION_KEY, []);
  const todayStr = formatDate(new Date());
  const todayVol = logs.filter(l => l.date === todayStr).reduce((sum, l) => sum + parseInt(l.amount), 0);
  
  const toast = document.getElementById('notif-toast');
  const msgEl = document.getElementById('notif-msg');
  if (!toast || !msgEl) return;
  
  msgEl.innerHTML = `
    🔔 Time to drink water! You're at <strong>${todayVol} / ${settings.goal} ml</strong> today.
    <button id="toast-quick-water-log" style="background:#fff; color:var(--accent); font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; margin-left:8px; cursor:pointer;">+ Log 250ml</button>
  `;
  
  toast.classList.remove('hidden');
  
  document.getElementById('toast-quick-water-log').addEventListener('click', () => {
    logBeverage(250, "Reminder Water", settings, logs);
    toast.classList.add('hidden');
  });
  
  setTimeout(() => toast.classList.add('hidden'), 8000);
}

function showToast(msg) {
  const toast = document.getElementById('notif-toast');
  document.getElementById('notif-msg').textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
