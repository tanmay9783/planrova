import { getStorageItem } from '../utils/storage.js';

export function initCommandPalette() {
  const overlay = document.getElementById('command-palette-overlay');
  const input = document.getElementById('command-palette-input');
  const results = document.getElementById('command-palette-results');
  
  if (!overlay || !input || !results) return;
  
  let selectedIndex = 0;
  let currentItems = [];
  
  input.addEventListener('input', () => {
    selectedIndex = 0;
    renderResults();
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentItems.length;
      updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
      updateActiveItem();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentItems[selectedIndex]) {
        executeItem(currentItems[selectedIndex]);
      }
    }
  });
  
  // Close when clicking outside card
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
    }
  });
  
  function getItems() {
    const query = input.value.toLowerCase().trim();
    const actions = [
      { id: 'act_add_task', type: 'action', title: '+ Add Task', desc: 'Create a new task in your planner', action: () => document.getElementById('add-task-btn').click() },
      { id: 'act_pomo', type: 'action', title: '⏱️ Start Pomodoro', desc: 'Launch pomodoro focus timer session', action: () => document.getElementById('pomodoro-modal-overlay').classList.remove('hidden') },
      { id: 'act_water', type: 'action', title: '💧 Log Water', desc: 'Log water intake or update settings', action: () => document.getElementById('water-modal-overlay').classList.remove('hidden') },
      { id: 'act_budget', type: 'action', title: '💸 Open Budget', desc: 'Log budget expenses or settings', action: () => document.getElementById('budget-insights-modal-overlay').classList.remove('hidden') },
      { id: 'act_cal', type: 'action', title: '📅 Go to Calendar', desc: 'Switch to Month Calendar view', action: () => document.getElementById('view-calendar-btn').click() },
      { id: 'act_weekly', type: 'action', title: '🏠 Go to Weekly Timetable', desc: 'Switch to Weekly view', action: () => document.getElementById('view-weekly-btn').click() }
    ];
    
    if (!query) {
      // Return recent items (or default actions + some recents)
      const tasks = getStorageItem('tasks', []).slice(0, 3);
      const notes = getStorageItem('notes', []).slice(0, 3);
      
      const recents = [];
      notes.forEach(n => recents.push({ id: `note_${n.date}`, type: 'note', title: `📝 ${n.title || 'Untitled Note'}`, desc: `Note for ${n.date}`, action: () => {
        import('./notes.js').then(m => m.openNotesDrawer(n.date));
      }}));
      tasks.forEach(t => recents.push({ id: `task_${t.id}`, type: 'task', title: `✓ ${t.title}`, desc: `Task in ${t.date}`, action: () => {} }));
      
      return [...actions, ...recents];
    }
    
    // Filter matching actions, notes and tasks
    const filteredActions = actions.filter(a => a.title.toLowerCase().includes(query) || a.desc.toLowerCase().includes(query));
    
    const tasks = getStorageItem('tasks', []);
    const matchingTasks = tasks.filter(t => t.title.toLowerCase().includes(query) || (t.desc && t.desc.toLowerCase().includes(query)))
      .map(t => ({ id: `task_${t.id}`, type: 'task', title: `✓ ${t.title}`, desc: `Task on ${t.date}`, action: () => {} }));
      
    const notes = getStorageItem('notes', []);
    const matchingNotes = notes.filter(n => (n.title && n.title.toLowerCase().includes(query)) || (n.content && n.content.toLowerCase().includes(query)))
      .map(n => ({ id: `note_${n.date}`, type: 'note', title: `📝 ${n.title || 'Untitled Note'}`, desc: `Note on ${n.date}`, action: () => {
        import('./notes.js').then(m => m.openNotesDrawer(n.date));
      }}));
      
    return [...filteredActions, ...matchingNotes, ...matchingTasks];
  }
  
  function renderResults() {
    currentItems = getItems();
    results.innerHTML = '';
    
    if (currentItems.length === 0) {
      results.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">No results found.</div>`;
      return;
    }
    
    currentItems.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = `command-palette-item ${idx === selectedIndex ? 'active' : ''}`;
      row.style.padding = '10px 16px';
      row.style.cursor = 'pointer';
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '2px';
      
      row.innerHTML = `
        <div style="font-weight:600; font-size:14px; color:#fff;">${item.title}</div>
        <div style="font-size:11px; color:var(--text-secondary);">${item.desc}</div>
      `;
      
      row.addEventListener('click', () => {
        executeItem(item);
      });
      
      results.appendChild(row);
    });
  }
  
  function updateActiveItem() {
    const rows = results.querySelectorAll('.command-palette-item');
    rows.forEach((row, idx) => {
      if (idx === selectedIndex) {
        row.classList.add('active');
        row.scrollIntoView({ block: 'nearest' });
      } else {
        row.classList.remove('active');
      }
    });
  }
  
  function executeItem(item) {
    overlay.classList.add('hidden');
    input.value = '';
    item.action();
  }
  
  // Expose it on the search button too if user clicks
  const searchBtn = document.getElementById('global-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      overlay.classList.remove('hidden');
      input.focus();
      selectedIndex = 0;
      renderResults();
    });
  }
}
