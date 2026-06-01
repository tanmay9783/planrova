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

  let logs = getStorageItem(HYDRATION_KEY, []);
  if (!Array.isArray(logs)) logs = [];
  
  updateHydrationUI(settings, logs);
  setupHydrationEvents();
  setupIntervalReminders(settings);
  renderCustomBeverages();
}

function updateHydrationUI(settings, logs) {
  if (!Array.isArray(logs)) logs = [];
  const todayStr = formatDate(new Date());
  
  // Calculate today's volume
  const todayLogs = logs.filter(l => l.date === todayStr);
  const totalToday = todayLogs.reduce((sum, l) => sum + parseInt(l.amount || 0), 0);
  
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
      if (statusText) statusText.textContent = "Goal reached!";
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
  if (!Array.isArray(logs)) logs = [];
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
    const dayVol = Math.max(0, dayLogs.reduce((sum, l) => sum + parseInt(l.amount || 0), 0));
    
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
  if (!Array.isArray(logs)) logs = [];
  const streakLabel = document.getElementById('water-streak-label');
  const badgesList = document.getElementById('water-badges-list');
  if (!streakLabel || !badgesList) return;
  
  // Group logs by date
  const logsByDate = {};
  logs.forEach(l => {
    if (!logsByDate[l.date]) logsByDate[l.date] = 0;
    logsByDate[l.date] += parseInt(l.amount || 0);
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
    { days: 7, badge: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#fbbf24; margin-right:2px; display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
    { days: 14, badge: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#fbbf24; margin-right:2px; display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
    { days: 30, badge: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#fbbf24; margin-right:2px; display:inline-block;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34M12 2a7 7 0 0 0-7 7c0 2.52 1.34 4.73 3.33 6h7.34A7 7 0 0 0 12 2z"/></svg>` }
  ];
  
  milestones.forEach(m => {
    if (streak >= m.days) {
      const bSpan = document.createElement('span');
      bSpan.innerHTML = m.badge;
      bSpan.title = `Milestone hit: ${m.days} Day streak!`;
      badgesList.appendChild(bSpan);
    }
  });
}

function renderWaterLogsList(logs) {
  if (!Array.isArray(logs)) logs = [];
  const container = document.getElementById('water-logs-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (logs.length === 0) {
    container.innerHTML = `<p class="helper-text" style="padding:10px 0; text-align:center;">No drinks logged today.</p>`;
    return;
  }
  
  // Sort descending safely
  const sorted = [...logs].sort((a,b) => {
    const timeA = a.timestamp || '';
    const timeB = b.timestamp || '';
    return timeB.localeCompare(timeA);
  });
  
  sorted.slice(0, 10).forEach(log => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.style.padding = '6px 0';
    
    const isCoffee = parseInt(log.amount) < 0;
    const logIcon = isCoffee 
      ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#f87171; display:block;"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" x2="14" y1="11" y2="15"/></svg>`
      : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#789ed4; display:block;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="display:inline-flex; align-items:center;">${logIcon}</span>
        <span style="font-size:12px; font-weight:600; color:${isCoffee ? '#f87171' : '#e3e3e6'}">${log.type}: ${log.amount}ml</span>
      </div>
      <button class="icon-btn delete-water-log" data-id="${log.id}" style="display:inline-flex; align-items:center; justify-content:center; padding:4px;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
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

  // Direct click listener to ensure it always captures clicks reliably
  const quickBtn = document.getElementById('sidebar-quick-water-btn');
  if (quickBtn) {
    quickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      logBeverage(250, "Quick Water");
    });
  }

  // Custom beverage creator button listener
  const addCustomBtn = document.getElementById('add-custom-drink-btn');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nameInput = document.getElementById('custom-drink-name');
      const amountInput = document.getElementById('custom-drink-amount');
      if (nameInput && amountInput) {
        const name = nameInput.value.trim();
        const amount = parseInt(amountInput.value);
        if (name && amount > 0) {
          const customs = getStorageItem('custom_beverages', []);
          if (!customs.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            customs.push({ name, amount });
            setStorageItem('custom_beverages', customs);
            renderCustomBeverages();
            nameInput.value = '';
            amountInput.value = '';
            showToast(`Added ${name} preset!`);
          } else {
            showToast("Beverage already exists");
          }
        } else {
          showToast("Enter a valid name and volume");
        }
      }
    });
  }

  document.body.addEventListener('click', (e) => {
    // 1. Sidebar widget click
    const widgetCard = e.target.closest('#sidebar-water-widget-card');
    if (widgetCard) {
      const waterOverlay = document.getElementById('water-modal-overlay');
      if (waterOverlay) waterOverlay.classList.remove('hidden');
      return;
    }
    
    // 2. Modal close button click
    const closeBtn = e.target.closest('#water-modal-close-btn');
    if (closeBtn) {
      const waterOverlay = document.getElementById('water-modal-overlay');
      if (waterOverlay) waterOverlay.classList.add('hidden');
      return;
    }
    
    // 3. Log Water presets from modal dashboard
    const presetBtn = e.target.closest('.log-water-preset');
    if (presetBtn) {
      let ml = parseInt(presetBtn.dataset.ml);
      let type = ml > 0 ? "Water" : "Coffee/Tea";
      
      const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
      if (ml < 0 && !settings.diureticCoffee) {
        ml = 200;
        type = "Tea";
      }
      logBeverage(ml, type);
      return;
    }
    
    // 4. Quick Sidebar "+ 💧" button
    const quickWaterBtn = e.target.closest('#sidebar-quick-water-btn');
    if (quickWaterBtn) {
      e.stopPropagation();
      logBeverage(250, "Quick Water");
      return;
    }
    
    // 5. Save settings button
    const saveWaterBtn = e.target.closest('#save-water-settings-btn');
    if (saveWaterBtn) {
      const goalInput = document.getElementById('settings-water-goal');
      const intervalSelect = document.getElementById('settings-water-interval');
      const quietCheck = document.getElementById('settings-water-quiet');
      
      if (goalInput && intervalSelect && quietCheck) {
        const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
        settings.goal = parseInt(goalInput.value) || 2000;
        settings.interval = parseInt(intervalSelect.value) || 60;
        settings.quietHours = quietCheck.checked;
        
        setStorageItem(HYDRATION_SETTINGS_KEY, settings);
        
        const dailyStatus = getStorageItem(HYDRATION_STATUS_KEY, { water: 0, target: 2000 });
        dailyStatus.target = settings.goal;
        setStorageItem(HYDRATION_STATUS_KEY, dailyStatus);
        
        initHydration();
        showToast("Water settings saved!");
      }
      return;
    }
  });

  // Coffee toggle changes
  document.body.addEventListener('change', (e) => {
    const coffeeToggle = e.target.closest('#coffee-diuretic-toggle');
    if (coffeeToggle) {
      const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
      settings.diureticCoffee = coffeeToggle.checked;
      setStorageItem(HYDRATION_SETTINGS_KEY, settings);
    }
  });
}

import { addXP, logDailyActivity } from './gamification.js';

function logBeverage(amount, type) {
  try {
    const settings = getStorageItem(HYDRATION_SETTINGS_KEY, defaultSettings);
    const logs = getStorageItem(HYDRATION_KEY, []);

    const newLog = {
      id: 'h_' + Date.now(),
      amount: parseInt(amount) || 250,
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
    showToast(amount > 0 ? `Logged +${amount}ml of hydration!` : `Logged coffee: ${amount}ml deduction!`);
    
    if (amount > 0) {
      addXP(5);
      logDailyActivity('water');
    }
  } catch (err) {
    console.error("Error in logBeverage:", err);
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

function renderCustomBeverages() {
  const container = document.getElementById('water-presets-grid');
  if (!container) return;

  container.querySelectorAll('.custom-preset-btn').forEach(btn => btn.remove());

  const customs = getStorageItem('custom_beverages', []);
  if (!Array.isArray(customs)) return;

  customs.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'btn-ghost log-water-preset custom-preset-btn';
    btn.dataset.ml = c.amount;
    btn.style.padding = '8px 12px';
    btn.style.fontSize = '12px';
    btn.textContent = `${c.name} (${c.amount}ml)`;
    container.appendChild(btn);
  });
}
