import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { getStartOfWeek, getWeekDays, formatDate, formatTime, getDayName, getFormattedDateRange } from '../utils/date.js';
import { setFocusTask } from './pomodoro.js';
import { renderMonthlyCalendar } from './monthly-cal.js';
import { appendNotesButtonToHeader, renderPinnedNoteInsideColumn, openNotesDrawer } from './notes.js';

const TASKS_KEY = 'tasks';
let currentWeekStart = getStartOfWeek(new Date());
let lastDeletedTask = null;
let deleteTimeout = null;

// Initialize tasks and grid
export function initTasks() {
  setupNavigation();
  renderGrid();
  setupModalEvents();
  setupDropZones();
}

export function renderGrid() {
  const leftCol = document.getElementById('left-col');
  const rightCol = document.getElementById('right-col');
  if (!leftCol || !rightCol) return;
  
  leftCol.innerHTML = '';
  rightCol.innerHTML = '';
  
  const days = getWeekDays(currentWeekStart);
  
  // Set toolbar dates label
  document.getElementById('week-label').textContent = getFormattedDateRange(currentWeekStart);
  
  const tasks = getStorageItem(TASKS_KEY, []);
  const todayStr = formatDate(new Date());
  
  // Distribute days as in the reference image:
  // Left Column: Monday, Wednesday, Friday
  // Right Column: Tuesday, Thursday, Saturday, Sunday
  
  days.forEach((day, index) => {
    const dayStr = formatDate(day);
    const isToday = dayStr === todayStr;
    const dayNum = day.getDay(); // 0 is Sunday, 1 is Monday...
    
    const col = document.createElement('div');
    col.className = `day-column ${isToday ? 'today' : ''}`;
    col.dataset.date = dayStr;
    
    // Friday (index 4 or dayNum 5) is made tall to match Sat + Sun!
    if (dayNum === 5) {
      col.classList.add('friday-tall');
    }
    
    col.innerHTML = `
      <div class="day-header">
        <div class="day-name">${getDayName(day)}</div>
        <div class="day-date" style="margin-left: 8px;">${day.toLocaleString('default', { month: 'short' })} ${day.getDate()}</div>
      </div>
      <div class="ruled-container">
        <div class="tasks-container" data-date="${dayStr}"></div>
      </div>
    `;
    
    // Append Note drawer launch icon 📝 inside column header
    const header = col.querySelector('.day-header');
    appendNotesButtonToHeader(header, dayStr);
    
    // Append according to reference layout:
    // Left: Mon (1), Wed (3), Fri (5)
    // Right: Tue (2), Thu (4), Sat (6), Sun (0)
    col.addEventListener('click', (e) => {
      if (e.target.closest('.task-card') || e.target.closest('button') || e.target.closest('.notes-header-btn')) {
        return;
      }
      openDayDetailPanel(dayStr);
    });

    if (dayNum === 1 || dayNum === 3 || dayNum === 5) {
      leftCol.appendChild(col);
    } else {
      rightCol.appendChild(col);
    }
    
    // Render matching tasks
    const container = col.querySelector('.tasks-container');
    const dayTasks = tasks.filter(t => t.date === dayStr);
    
    // Sort tasks by start time
    dayTasks.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    
    dayTasks.forEach(task => {
      const card = createTaskCard(task);
      container.appendChild(card);
    });
    
    // Render pinned note at the top of the tasks list if active!
    renderPinnedNoteInsideColumn(col, dayStr);

    // If day has no tasks and no pinned note, show premium empty state
    const notes = getStorageItem('notes', {});
    const note = notes[dayStr];
    const hasPinnedNote = note && note.pinned;
    if (dayTasks.length === 0 && !hasPinnedNote) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-day-placeholder';
      emptyDiv.innerHTML = `
        <div style="font-size: 18px; margin-bottom: 8px;">✨</div>
        <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary); line-height: 1.5;">Clear schedule. A calm mind starts here.</div>
      `;
      container.appendChild(emptyDiv);
    }
  });
  
  updateStatistics(tasks);
  
  // Unify and update the dedicated monthly calendar view!
  renderMonthlyCalendar();
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card ${task.completed ? 'completed' : ''}`;
  card.draggable = true;
  card.dataset.id = task.id;
  card.style.setProperty('--category-color', `var(--color-${task.category || 'other'})`);
  
  // Linked notes check
  const notes = getStorageItem('notes', []);
  const linkedNote = notes.find(n => n.linkedTasks && n.linkedTasks.includes(task.id));
  const noteIndicator = linkedNote ? `<span class="task-linked-note-indicator" data-date="${linkedNote.date}" title="Linked Note: ${linkedNote.title || 'UntitledNote'}" style="cursor:pointer; margin-left: 6px; font-size:11px;">📎</span>` : '';
  
  card.innerHTML = `
    <div class="task-card-header">
      <div class="task-card-title-wrap">
        <div class="drag-handle" style="cursor: grab; opacity: 0.4; margin-right: 4px; font-weight:700; user-select:none;">⋮⋮</div>
        <div class="task-checkbox ${task.completed ? 'checked' : ''}"></div>
        <div class="task-title">${task.title} ${noteIndicator}</div>
      </div>
      <div class="task-priority-dot" style="background-color: var(--color-${task.priority || 'medium'})" title="${task.priority} priority"></div>
    </div>
    ${task.desc ? `<div style="font-size:11px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-left:36px;">${task.desc}</div>` : ''}
    <div class="task-card-footer" style="padding-left: 36px;">
      <div class="task-card-time">
        🕒 ${task.startTime ? formatTime(task.startTime) : 'All Day'}
      </div>
      <div class="task-actions">
        <button class="icon-btn focus-pomo-btn" title="Focus session">🍅</button>
        <button class="icon-btn edit-task-btn" title="Edit">✏️</button>
        <button class="icon-btn delete-task-btn" title="Delete">🗑️</button>
      </div>
    </div>
  `;
  
  // Drag logic
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', `task:${task.id}`);
    card.classList.add('dragging');
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
  
  // Toggle Check
  card.querySelector('.task-checkbox').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskCompletion(task.id);
  });
  
  // Focus Pomodoro
  card.querySelector('.focus-pomo-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    setFocusTask(task.id, task.title);
  });
  
  // Edit Task
  card.querySelector('.edit-task-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(task);
  });
  
  // Delete Task
  card.querySelector('.delete-task-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTaskWithUndo(task.id);
  });

  // Note link click
  const badge = card.querySelector('.task-linked-note-indicator');
  if (badge) {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      import('./notes.js').then(m => m.openNotesDrawer(badge.dataset.date));
    });
  }
  
  return card;
}

import { addXP, logDailyActivity } from './gamification.js';

function toggleTaskCompletion(id) {
  const tasks = getStorageItem(TASKS_KEY, []);
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return;
  
  tasks[index].completed = !tasks[index].completed;
  setStorageItem(TASKS_KEY, tasks);
  renderGrid();
  updateStreak();
  
  if (tasks[index].completed) {
    addXP(10);
    logDailyActivity('task');
  }
}

function updateStatistics(tasks) {
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  
  const totalEl = document.getElementById('stat-total');
  const doneEl = document.getElementById('stat-done');
  
  if (totalEl) totalEl.textContent = total;
  if (doneEl) doneEl.textContent = done;
  
  // Update productive day (most completed tasks)
  const completionsPerDay = {};
  tasks.forEach(t => {
    if (t.completed) {
      completionsPerDay[t.date] = (completionsPerDay[t.date] || 0) + 1;
    }
  });
  
  let bestDayStr = "—";
  let maxCount = 0;
  
  Object.keys(completionsPerDay).forEach(date => {
    if (completionsPerDay[date] > maxCount) {
      maxCount = completionsPerDay[date];
      bestDayStr = new Date(date).toLocaleDateString('default', { weekday: 'short', day: 'numeric' });
    }
  });
  
  const prodEl = document.getElementById('stat-productive');
  if (prodEl) prodEl.textContent = bestDayStr;
}

// Streak Tracking calculation
function updateStreak() {
  const tasks = getStorageItem(TASKS_KEY, []);
  
  // Group tasks by date
  const tasksByDate = {};
  tasks.forEach(t => {
    if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
    tasksByDate[t.date].push(t);
  });
  
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDate(d);
    
    const dayTasks = tasksByDate[dateStr] || [];
    if (dayTasks.length > 0 && dayTasks.every(t => t.completed)) {
      streak++;
    } else {
      if (i > 0) break; // Streak broken
    }
  }
  
  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = streak;
}

function deleteTaskWithUndo(id) {
  const tasks = getStorageItem(TASKS_KEY, []);
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return;
  
  // Cache for undo
  lastDeletedTask = { ...tasks[index] };
  tasks.splice(index, 1);
  setStorageItem(TASKS_KEY, tasks);
  renderGrid();
  
  // Trigger 5s Undo Notification
  const toast = document.getElementById('undo-toast');
  const progress = document.getElementById('undo-progress');
  
  document.getElementById('undo-msg').textContent = `Task "${lastDeletedTask.title}" deleted.`;
  toast.classList.remove('hidden');
  
  // Animate progress bar
  progress.style.transition = 'none';
  progress.style.width = '100%';
  
  setTimeout(() => {
    progress.style.transition = 'width 5s linear';
    progress.style.width = '0%';
  }, 50);
  
  clearTimeout(deleteTimeout);
  deleteTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    lastDeletedTask = null;
  }, 5000);
}

// Hook Undo button click
let lastMovedTaskInfo = null;

document.getElementById('undo-btn').addEventListener('click', () => {
  if (lastDeletedTask) {
    const tasks = getStorageItem(TASKS_KEY, []);
    tasks.push(lastDeletedTask);
    setStorageItem(TASKS_KEY, tasks);
    renderGrid();
    
    document.getElementById('undo-toast').classList.add('hidden');
    lastDeletedTask = null;
    clearTimeout(deleteTimeout);
  } else if (lastMovedTaskInfo) {
    const tasks = getStorageItem(TASKS_KEY, []);
    const idx = tasks.findIndex(t => t.id === lastMovedTaskInfo.id);
    if (idx !== -1) {
      tasks[idx].date = lastMovedTaskInfo.oldDate;
      setStorageItem(TASKS_KEY, tasks);
      renderGrid();
    }
    document.getElementById('undo-toast').classList.add('hidden');
    lastMovedTaskInfo = null;
    clearTimeout(deleteTimeout);
  }
});

// Setup navigation arrows
function setupNavigation() {
  document.getElementById('prev-week-btn').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderGrid();
  });
  
  document.getElementById('next-week-btn').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderGrid();
  });
}

// Add directly (useful for Voice NLP and Brain Dump converts)
export function addTaskDirectly(taskObj) {
  const tasks = getStorageItem(TASKS_KEY, []);
  
  const newTask = {
    id: 't_' + Date.now(),
    title: taskObj.title,
    desc: taskObj.desc || '',
    date: taskObj.date,
    startTime: taskObj.startTime || '',
    endTime: taskObj.endTime || '',
    category: taskObj.category || 'other',
    priority: taskObj.priority || 'medium',
    completed: false
  };
  
  tasks.push(newTask);
  setStorageItem(TASKS_KEY, tasks);
  renderGrid();
  
  // Trigger check for hydration context update since study task may be added
  import('./hydration.js').then(m => m.initHydration());
}

// Add/Edit modal handlers
let activeEditingTask = null;

function setupModalEvents() {
  const addBtn = document.getElementById('add-task-btn');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const saveBtn = document.getElementById('modal-save-btn');
  const overlay = document.getElementById('task-modal-overlay');
  
  const openModal = () => {
    activeEditingTask = null;
    document.getElementById('modal-title').textContent = "Add Task";
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-date').value = formatDate(new Date());
    document.getElementById('task-start').value = '';
    document.getElementById('task-end').value = '';
    document.getElementById('task-category').value = 'work';
    
    // Reset priority picker
    document.querySelectorAll('.priority-btn').forEach(b => {
      if (b.dataset.p === 'medium') b.classList.add('active');
      else b.classList.remove('active');
    });
    
    overlay.classList.remove('hidden');
  };
  
  addBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  cancelBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  
  // Priority picker click handlers
  document.getElementById('priority-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.priority-btn');
    if (!btn) return;
    
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
  
  saveBtn.addEventListener('click', () => {
    const title = document.getElementById('task-title').value.trim();
    if (!title) {
      alert("Please enter a task title.");
      return;
    }
    
    const desc = document.getElementById('task-desc').value.trim();
    const date = document.getElementById('task-date').value;
    const startTime = document.getElementById('task-start').value;
    const endTime = document.getElementById('task-end').value;
    const category = document.getElementById('task-category').value;
    const priority = document.querySelector('.priority-btn.active').dataset.p;
    
    const tasks = getStorageItem(TASKS_KEY, []);
    
    if (activeEditingTask) {
      // Modify
      const idx = tasks.findIndex(t => t.id === activeEditingTask.id);
      if (idx !== -1) {
        tasks[idx] = {
          ...tasks[idx],
          title,
          desc,
          date,
          startTime,
          endTime,
          category,
          priority
        };
      }
    } else {
      // New
      const newTask = {
        id: 't_' + Date.now(),
        title,
        desc,
        date,
        startTime,
        endTime,
        category,
        priority,
        completed: false
      };
      
      tasks.push(newTask);
    }
    
    setStorageItem(TASKS_KEY, tasks);
    overlay.classList.add('hidden');
    renderGrid();
    
    // Check for hydration context update since study task may be added
    import('./hydration.js').then(m => m.initHydration());
  });
}

function openEditModal(task) {
  activeEditingTask = task;
  document.getElementById('modal-title').textContent = "Edit Task";
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-desc').value = task.desc || '';
  document.getElementById('task-date').value = task.date;
  document.getElementById('task-start').value = task.startTime || '';
  document.getElementById('task-end').value = task.endTime || '';
  document.getElementById('task-category').value = task.category || 'work';
  
  document.querySelectorAll('.priority-btn').forEach(b => {
    if (b.dataset.p === task.priority) b.classList.add('active');
    else b.classList.remove('active');
  });
  
  document.getElementById('task-modal-overlay').classList.remove('hidden');
}

// Drag & Drop zones
let lastWeekShiftTime = 0;

function setupDropZones() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  // Handle dropping onto day grid column containers
  document.getElementById('weekly-grid-view').addEventListener('dragover', (e) => {
    const col = e.target.closest('.day-column');
    if (!col) return;
    
    e.preventDefault();
    col.classList.add('drag-over-active');
    
    // Cross-week drag: Shift to previous or next week if dragging near screen edges
    const clientX = e.clientX;
    const now = Date.now();
    if (now - lastWeekShiftTime > 1500) {
      if (clientX < 150) {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderGrid();
        lastWeekShiftTime = now;
      } else if (clientX > window.innerWidth - 150) {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderGrid();
        lastWeekShiftTime = now;
      }
    }
  });
  
  document.getElementById('weekly-grid-view').addEventListener('dragleave', (e) => {
    const col = e.target.closest('.day-column');
    if (!col) return;
    
    col.classList.remove('drag-over-active');
  });
  
  document.getElementById('weekly-grid-view').addEventListener('drop', async (e) => {
    const col = e.target.closest('.day-column');
    if (!col) return;
    
    col.classList.remove('drag-over-active');
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;
    
    const [type, idOrIdx] = dragData.split(':');
    const targetDate = col.dataset.date;
    
    if (type === 'task') {
      const tasks = getStorageItem(TASKS_KEY, []);
      const index = tasks.findIndex(t => t.id === idOrIdx);
      if (index === -1) return;
      
      const oldDate = tasks[index].date;
      if (oldDate === targetDate) return;
      
      // Cache for undo
      lastMovedTaskInfo = { id: idOrIdx, oldDate, newDate: targetDate };
      
      // Update local task date
      tasks[index].date = targetDate;
      setStorageItem(TASKS_KEY, tasks);
      renderGrid();
      
      // Trigger Undo Toast
      const toast = document.getElementById('undo-toast');
      const progress = document.getElementById('undo-progress');
      const dayName = new Date(targetDate).toLocaleDateString('default', { weekday: 'long' });
      
      document.getElementById('undo-msg').textContent = `Task moved to ${dayName}.`;
      toast.classList.remove('hidden');
      
      // Animate progress bar
      progress.style.transition = 'none';
      progress.style.width = '100%';
      
      setTimeout(() => {
        progress.style.transition = 'width 5s linear';
        progress.style.width = '0%';
      }, 50);
      
      clearTimeout(deleteTimeout);
      deleteTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        lastMovedTaskInfo = null;
      }, 5000);
      
    } else if (type === 'dump') {
      // Move from Brain Dump
      const dumpIdx = parseInt(idOrIdx);
      const dumps = getStorageItem('brain_dump', []);
      const val = dumps[dumpIdx];
      
      if (val) {
        // Add as task
        const newTask = {
          title: typeof val === 'string' ? val : val.text, // support both string & unified object format
          date: targetDate,
          category: 'personal',
          priority: 'medium'
        };
        addTaskDirectly(newTask);
        
        // Remove from dump
        dumps.splice(dumpIdx, 1);
        setStorageItem('brain_dump', dumps);
        
        // Rerender braindump list
        import('./brain-dump.js').then(m => m.initBrainDump());
      }
    }
  });
}

export function openDayDetailPanel(dateStr) {
  const panel = document.getElementById('day-detail-panel');
  if (!panel) return;
  
  // Set date title
  const dateObj = new Date(dateStr);
  const formattedDate = dateObj.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('day-detail-title').textContent = formattedDate;
  panel.dataset.date = dateStr;
  
  // Render sub sections
  renderPanelTasks(dateStr);
  renderPanelNotes(dateStr);
  renderPanelFocus(dateStr);
  renderPanelWater(dateStr);
  
  // Setup quick add
  const addBtn = document.getElementById('panel-add-task-btn');
  const inputWrap = document.getElementById('panel-quick-add-wrap');
  const input = document.getElementById('panel-quick-add-input');
  
  if (addBtn && inputWrap && input) {
    // reset input
    input.value = '';
    inputWrap.classList.add('hidden');
    
    // clear listeners to prevent duplicates
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    newAddBtn.addEventListener('click', () => {
      inputWrap.classList.toggle('hidden');
      if (!inputWrap.classList.contains('hidden')) {
        input.focus();
      }
    });
    
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const title = newInput.value.trim();
        if (title) {
          const activeDate = panel.dataset.date;
          const newTask = {
            title,
            date: activeDate,
            category: 'work',
            priority: 'medium'
          };
          addTaskDirectly(newTask);
          newInput.value = '';
          inputWrap.classList.add('hidden');
          renderPanelTasks(activeDate);
        }
      }
    });
  }
  
  // Close handler
  const closeBtn = document.getElementById('day-detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
  }
  
  // Show panel
  panel.classList.remove('hidden');
}

function renderPanelTasks(dateStr) {
  const container = document.getElementById('panel-tasks-list');
  if (!container) return;
  container.innerHTML = '';
  
  const tasks = getStorageItem(TASKS_KEY, []);
  const dayTasks = tasks.filter(t => t.date === dateStr);
  
  if (dayTasks.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-secondary); font-style:italic; padding: 4px 0;">No tasks today</div>`;
    return;
  }
  
  dayTasks.forEach(task => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.padding = '8px 0';
    item.style.borderBottom = '1px solid var(--border-color)';
    
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" style="width:16px; height:16px;"></div>
        <span style="font-size:13px; text-decoration: ${task.completed ? 'line-through' : 'none'}; color: ${task.completed ? 'var(--text-muted)' : 'var(--text-primary)'};">${task.title}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted);">${task.startTime || ''}</div>
    `;
    
    item.querySelector('.task-checkbox').addEventListener('click', () => {
      toggleTaskCompletion(task.id);
      renderPanelTasks(dateStr);
    });
    
    container.appendChild(item);
  });
}

function renderPanelNotes(dateStr) {
  const container = document.getElementById('panel-notes-list');
  if (!container) return;
  container.innerHTML = '';
  
  const notes = getStorageItem('notes', []);
  const note = notes.find(n => n.date === dateStr);
  
  if (!note || (!note.title && !note.content)) {
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0;">
        <span style="font-size:12px; color:var(--text-secondary); font-style:italic;">No notes for this day</span>
        <button class="btn-primary-sm" id="panel-create-note-btn" style="font-size:11px; padding:4px 8px; border-radius:6px; background:var(--accent);">Write Note</button>
      </div>
    `;
    container.querySelector('#panel-create-note-btn').addEventListener('click', () => {
      document.getElementById('day-detail-panel').classList.add('hidden');
      openNotesDrawer(dateStr);
    });
    return;
  }
  
  const div = document.createElement('div');
  div.style.display = 'flex';
  div.style.justifyContent = 'space-between';
  div.style.alignItems = 'center';
  div.style.padding = '8px 12px';
  div.style.background = 'rgba(255,255,255,0.02)';
  div.style.border = '1px solid var(--border-color)';
  div.style.borderRadius = '6px';
  div.style.cursor = 'pointer';
  
  div.innerHTML = `
    <span style="font-size:13px; font-weight:600; color:var(--accent);">📝 ${note.title || 'Untitled Note'}</span>
    <span style="font-size:11px; color:var(--text-secondary);">Edit ✏️</span>
  `;
  
  div.addEventListener('click', () => {
    document.getElementById('day-detail-panel').classList.add('hidden');
    openNotesDrawer(dateStr);
  });
  
  container.appendChild(div);
}

function renderPanelFocus(dateStr) {
  const el = document.getElementById('panel-focus-summary');
  if (!el) return;
  
  const gamificationState = getStorageItem('gamification', {});
  const todayStr = new Date().toDateString();
  const dateObj = new Date(dateStr);
  
  if (dateObj.toDateString() === todayStr) {
    el.textContent = `${gamificationState.focusMinutesToday || 0}m focused today`;
  } else {
    el.textContent = `—`;
  }
}

function renderPanelWater(dateStr) {
  const el = document.getElementById('panel-water-summary');
  if (!el) return;
  
  const gamificationState = getStorageItem('gamification', {});
  const todayStr = new Date().toDateString();
  const dateObj = new Date(dateStr);
  
  if (dateObj.toDateString() === todayStr) {
    el.textContent = `${(gamificationState.waterLoggedToday || 0) * 250} / 2000 ml drank`;
  } else {
    el.textContent = `—`;
  }
}

// Global window listener to close panel when clicking elsewhere
document.addEventListener('click', (e) => {
  const panel = document.getElementById('day-detail-panel');
  if (panel && !panel.classList.contains('hidden')) {
    if (!panel.contains(e.target) && !e.target.closest('.day-column') && !e.target.closest('.cal-cell')) {
      panel.classList.add('hidden');
    }
  }
});
