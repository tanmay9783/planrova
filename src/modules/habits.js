import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { addXP, logDailyActivity } from './gamification.js';

const HABITS_KEY = 'user_habits';
const HABIT_LOG_KEY = 'habit_logs'; // Logs completed habit dates: { habitId: ['YYYY-MM-DD', ...] }

const defaultHabits = [
  { id: 'h1', name: 'Drink 3L Water', streak: 4 },
  { id: 'h2', name: 'Read 10 Pages', streak: 2 },
  { id: 'h3', name: 'Work out', streak: 5 },
  { id: 'h4', name: 'Meditate', streak: 1 }
];

export function initHabits() {
  const habits = getStorageItem(HABITS_KEY, defaultHabits);
  const logs = getStorageItem(HABIT_LOG_KEY, {});
  
  renderHabitsList(habits, logs);
  setupHabitsEvents(habits, logs);
}

function renderHabitsList(habits, logs) {
  const container = document.getElementById('habits-list');
  container.innerHTML = '';
  
  const todayStr = getTodayString();
  
  habits.forEach((habit) => {
    const isCompletedToday = logs[habit.id] && logs[habit.id].includes(todayStr);
    const currentStreak = typeof habit.streak === 'number' && !isNaN(habit.streak) ? habit.streak : 0;
    
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.innerHTML = `
      <div class="habit-name-wrap">
        <div class="habit-checkbox ${isCompletedToday ? 'checked' : ''}" data-id="${habit.id}"></div>
        <span class="habit-name">${habit.name}</span>
      </div>
      <div class="habit-streak" title="7-day badge active" style="display:flex; align-items:center; gap:2px; font-size:11px; color:var(--text-secondary);">
        <svg class="streak-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; color:#f97316;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg> ${currentStreak}
      </div>
    `;
    container.appendChild(row);
  });
  
  // Hook check events
  container.querySelectorAll('.habit-checkbox').forEach(box => {
    box.addEventListener('click', () => {
      const id = box.dataset.id;
      const index = habits.findIndex(h => h.id === id);
      if (index === -1) return;
      
      const isChecked = box.classList.toggle('checked');
      
      if (!logs[id]) logs[id] = [];
      
      if (isChecked) {
        logs[id].push(todayStr);
        habits[index].streak = (typeof habits[index].streak === 'number' && !isNaN(habits[index].streak) ? habits[index].streak : 0) + 1;
        addXP(15);
        logDailyActivity('task');
      } else {
        logs[id] = logs[id].filter(d => d !== todayStr);
        habits[index].streak = Math.max(0, (typeof habits[index].streak === 'number' && !isNaN(habits[index].streak) ? habits[index].streak : 0) - 1);
      }
      
      setStorageItem(HABITS_KEY, habits);
      setStorageItem(HABIT_LOG_KEY, logs);
      initHabits(); // Rerender
    });
  });
}

function setupHabitsEvents(habits, logs) {
  const addBtn = document.getElementById('add-habit-btn');
  
  addBtn.addEventListener('click', () => {
    const name = prompt("Enter habit name:");
    if (!name) return;
    
    const newHabit = {
      id: 'h_' + Date.now(),
      name,
      streak: 0
    };
    
    habits.push(newHabit);
    setStorageItem(HABITS_KEY, habits);
    initHabits();
  });
  
  // Heatmap trigger
  const heatmapBtn = document.getElementById('show-heatmap-btn');
  const modalOverlay = document.getElementById('heatmap-modal-overlay');
  const closeBtn = document.getElementById('heatmap-close-btn');
  
  if (heatmapBtn && modalOverlay) {
    heatmapBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('hidden');
      renderHeatmap(logs);
    });
  }
  
  if (closeBtn && modalOverlay) {
    closeBtn.addEventListener('click', () => {
      modalOverlay.classList.add('hidden');
    });
  }
}

function renderHeatmap(logs) {
  const container = document.getElementById('heatmap-container');
  container.innerHTML = '';
  
  const title = document.createElement('h3');
  title.textContent = "Your Consistency Heatmap (Last 30 Days)";
  title.style.marginBottom = "16px";
  container.appendChild(title);
  
  const grid = document.createElement('div');
  grid.className = 'heatmap';
  
  // Render grid for past 30 days
  const today = new Date();
  const cells = [];
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDate(d);
    
    // Count how many habits completed on this date
    let count = 0;
    Object.keys(logs).forEach(id => {
      if (logs[id].includes(dateStr)) count++;
    });
    
    let level = 0;
    if (count > 0) {
      if (count <= 1) level = 1;
      else if (count <= 2) level = 2;
      else if (count <= 3) level = 3;
      else level = 4;
    }
    
    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.title = `${dateStr}: ${count} habit(s) complete`;
    grid.appendChild(cell);
  }
  
  container.appendChild(grid);
  
  // Legend
  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.gap = '8px';
  legend.style.marginTop = '16px';
  legend.style.fontSize = '11px';
  legend.style.color = 'var(--text-secondary)';
  legend.innerHTML = `
    <span>Less</span>
    <div class="heatmap-cell level-0" style="display:inline-block"></div>
    <div class="heatmap-cell level-1" style="display:inline-block"></div>
    <div class="heatmap-cell level-2" style="display:inline-block"></div>
    <div class="heatmap-cell level-3" style="display:inline-block"></div>
    <div class="heatmap-cell level-4" style="display:inline-block"></div>
    <span>More</span>
  `;
  container.appendChild(legend);
}

function getTodayString() {
  const d = new Date();
  return formatDate(d);
}

function formatDate(d) {
  const year = d.getFullYear();
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}
