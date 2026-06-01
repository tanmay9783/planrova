import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { formatDate } from '../utils/date.js';

let currentMonth = new Date(); // Stores month we are viewing

export function initMonthlyCalendar() {
  setupCalendarEvents();
  renderMonthlyCalendar();
}

export function renderMonthlyCalendar() {
  const grid = document.getElementById('calendar-month-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  // Set month title label
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  document.getElementById('cal-month-label').textContent = `${months[month]} ${year}`;
  
  // Get first day of the month
  const firstDay = new Date(year, month, 1);
  // Get day index (0 for Sunday, 1 for Monday...)
  let firstDayIndex = firstDay.getDay();
  // Adjust so Monday is 0 and Sunday is 6
  firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  
  // Number of days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();
  // Number of days in previous month (to fill blank cells)
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  const tasks = getStorageItem('tasks', []);
  const todayStr = formatDate(new Date());
  
  // Render empty cells from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = formatDate(prevDate);
    const cell = createCalendarCell(dayNum, dateStr, false, tasks, todayStr);
    grid.appendChild(cell);
  }
  
  // Render actual month cells
  for (let d = 1; d <= totalDays; d++) {
    const currDate = new Date(year, month, d);
    const dateStr = formatDate(currDate);
    const cell = createCalendarCell(d, dateStr, true, tasks, todayStr);
    grid.appendChild(cell);
  }
  
  // Render blank cells for next month to complete the grid (multiple of 7)
  const totalCellsSoFar = firstDayIndex + totalDays;
  const nextMonthCells = 42 - totalCellsSoFar; // 6 rows standard
  for (let n = 1; n <= nextMonthCells; n++) {
    const nextDate = new Date(year, month + 1, n);
    const dateStr = formatDate(nextDate);
    const cell = createCalendarCell(n, dateStr, false, tasks, todayStr);
    grid.appendChild(cell);
  }
}

function createCalendarCell(dayNum, dateStr, isCurrentMonth, tasks, todayStr) {
  const cell = document.createElement('div');
  cell.className = `cal-cell ${isCurrentMonth ? '' : 'other-month'} ${dateStr === todayStr ? 'today' : ''}`;
  cell.dataset.date = dateStr;
  
  // Filter tasks matching this cell date
  const dayTasks = tasks.filter(t => t.date === dateStr && !t.completed);
  const hasTasks = dayTasks.length > 0;
  
  cell.innerHTML = `
    <span class="cal-cell-num">${dayNum}</span>
    <div class="cal-cell-bullets">
      ${hasTasks ? '<span class="cal-gold-dot" style="display:block; width:4px; height:4px; border-radius:50%; background:#BA7517; margin: 4px auto 0 auto;"></span>' : ''}
    </div>
  `;
  
  // Click on date cell to open Day Detail Panel
  cell.addEventListener('click', () => {
    import('./tasks.js').then(m => m.openDayDetailPanel(dateStr));
  });
  
  return cell;
}

function openAddTaskForDate(dateStr) {
  document.getElementById('modal-title').textContent = "Add Task";
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-date').value = dateStr;
  document.getElementById('task-start').value = '';
  document.getElementById('task-end').value = '';
  document.getElementById('task-category').value = 'work';
  
  document.querySelectorAll('.priority-btn').forEach(b => {
    if (b.dataset.p === 'medium') b.classList.add('active');
    else b.classList.remove('active');
  });
  
  document.getElementById('task-modal-overlay').classList.remove('hidden');
}

function setupCalendarEvents() {
  document.getElementById('cal-prev-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderMonthlyCalendar();
  });
  
  document.getElementById('cal-next-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderMonthlyCalendar();
  });
}
