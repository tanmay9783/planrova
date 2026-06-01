import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { formatDate } from '../utils/date.js';

const NOTES_KEY = 'notes';
const DRAFTS_HISTORY_KEY = 'notes_drafts';

let activeNoteDate = '';
let selectedSubjects = [];

export function initNotes() {
  setupNotesEvents();
  renderNotesLibrary();
}

// Injects Notes Drawer trigger button inside task column headers
export function appendNotesButtonToHeader(headerEl, dateStr) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn notes-header-btn';
  btn.title = 'Open Notes for this Day';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
  btn.style.marginLeft = 'auto';
  
  // Bind click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openNotesDrawer(dateStr);
  });
  
  headerEl.appendChild(btn);
}

function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/[#*_\-`~[\]()]/g, "") // remove basic markdown symbols
    .replace(/\s+/g, " ")
    .trim();
}

// Renders pinned notes inside the weekly column so they are always visible!
export function renderPinnedNoteInsideColumn(columnEl, dateStr) {
  const notes = getStorageItem(NOTES_KEY, []);
  const note = notes.find(n => n.date === dateStr);
  
  // Remove existing pinned card first
  const existing = columnEl.querySelector('.pinned-note-card');
  if (existing) existing.remove();
  
  if (note && note.pinned) {
    const pCard = document.createElement('div');
    pCard.className = 'task-card pinned-note-card';
    pCard.style.borderLeft = '4px solid #a78bfa'; // Purple note accent
    pCard.style.background = 'rgba(167, 139, 250, 0.04)';
    pCard.style.cursor = 'pointer';
    
    // Preview text (strip html tags)
    const temp = document.createElement('div');
    temp.innerHTML = note.content || "";
    const txt = temp.textContent || temp.innerText || "";
    const cleanText = stripMarkdown(txt);
    const preview = cleanText.length > 60 ? cleanText.slice(0, 60) + "..." : cleanText;
    
    // Auto title
    let title = note.title;
    if (!title || title.trim() === "" || title === "Untitled Note") {
      const words = cleanText.split(/\s+/).filter(Boolean);
      title = words.slice(0, 6).join(" ") || "Untitled Note";
    }
    
    pCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:11px; color:#a78bfa; display:inline-flex; align-items:center; gap:4px;">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="transform: rotate(45deg); display:inline-block;"><line x1="18" y1="8" x2="22" y2="12"/><line x1="12" y1="2" x2="22" y2="12"/><path d="M12 2 2 12c.5 1.5 1.5 2.5 3 2.5L12 12l2.5 2.5-3.5 3.5 1 1c1.5.5 3 0 4-1l3.5-3.5 1.5 1.5-1.5-1.5z"/></svg> NOTE: ${title}
        </span>
        <span style="display:inline-flex; align-items:center;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>
      </div>
      <div style="font-size:12px; font-style:italic; color:var(--text-secondary); margin-top:4px;">"${preview || 'Empty note content'}"</div>
    `;
    
    pCard.addEventListener('click', () => {
      openNotesDrawer(dateStr);
    });
    
    const tasksContainer = columnEl.querySelector('.tasks-container');
    if (tasksContainer) {
      // Insert at the top of the tasks list
      tasksContainer.insertBefore(pCard, tasksContainer.firstChild);
    }
  }
}

export function openNotesDrawer(dateStr) {
  activeNoteDate = dateStr;
  
  const notes = getStorageItem(NOTES_KEY, []);
  const note = notes.find(n => n.date === dateStr) || { content: '', title: '', pinned: false, attachments: [] };
  
  // Set date title label
  const formattedDate = new Date(dateStr).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('drawer-date-label').textContent = `${formattedDate} Notes`;
  
  // Set editor values
  const editor = document.getElementById('editor-content-area');
  editor.innerHTML = note.content || '';
  
  document.getElementById('note-page-title').value = note.title || '';
  document.getElementById('ai-summary-output').classList.add('hidden');
  document.getElementById('ai-flashcards-output').classList.add('hidden');
  
  // Attachments preview
  renderAttachmentsPreview(note.attachments || []);
  
  // Load draft versions history
  loadDraftsHistoryOptions(dateStr);
  
  // Reset Pin button visual state
  updatePinButtonState(note.pinned);
  
  // Update words count
  updateEditorStats(note.content || '');
  
  // Display Drawer
  document.getElementById('notes-drawer-overlay').classList.remove('hidden');
}

function renderAttachmentsPreview(attachments) {
  const container = document.getElementById('note-attachments-preview');
  container.innerHTML = '';
  
  attachments.forEach((att, idx) => {
    const item = document.createElement('div');
    item.style.position = 'relative';
    item.style.width = '50px';
    item.style.height = '50px';
    item.style.borderRadius = '4px';
    item.style.overflow = 'hidden';
    item.style.border = '1px solid var(--border-color)';
    
    item.innerHTML = `
      <img src="${att}" style="width:100%; height:100%; object-fit:cover;" />
      <button class="delete-att" data-idx="${idx}" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:#fff; border-radius:50%; width:14px; height:14px; font-size:8px; display:flex; align-items:center; justify-content:center; cursor:pointer;">×</button>
    `;
    container.appendChild(item);
  });
  
  container.querySelectorAll('.delete-att').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const notes = getStorageItem(NOTES_KEY, []);
      const noteIndex = notes.findIndex(n => n.date === activeNoteDate);
      if (noteIndex !== -1 && notes[noteIndex].attachments) {
        notes[noteIndex].attachments.splice(idx, 1);
        setStorageItem(NOTES_KEY, notes);
        renderAttachmentsPreview(notes[noteIndex].attachments);
      }
    });
  });
}

function updatePinButtonState(isPinned) {
  const btn = document.getElementById('note-pin-btn');
  if (isPinned) {
    btn.textContent = "Pinned";
    btn.style.background = 'rgba(167, 139, 250, 0.15)';
    btn.style.borderColor = '#a78bfa';
  } else {
    btn.textContent = "Pin to Day";
    btn.style.background = 'none';
    btn.style.borderColor = 'var(--border-color)';
  }
}

function updateEditorStats(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const text = temp.textContent || temp.innerText || "";
  
  // Count words
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  // Avg read time: 200 wpm
  const mins = Math.max(1, Math.round(words / 200));
  
  document.getElementById('editor-stats').textContent = `Words: ${words} • Read Time: ${words > 0 ? mins : 0} min`;
}

function loadDraftsHistoryOptions(dateStr) {
  const select = document.getElementById('note-drafts-history');
  select.innerHTML = '<option value="">Restore Version</option>';
  
  const history = getStorageItem(DRAFTS_HISTORY_KEY, {});
  const dateDrafts = history[dateStr] || [];
  
  dateDrafts.forEach((d, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${d.timestamp} (${d.title || 'Untitled'})`;
    select.appendChild(opt);
  });
}

function setupNotesEvents() {
  const overlay = document.getElementById('notes-drawer-overlay');
  const closeBtn = document.getElementById('notes-drawer-close-btn');
  const editor = document.getElementById('editor-content-area');
  const immersiveBtn = document.getElementById('note-immersive-toggle-btn');
  
  // Close drawer
  closeBtn.addEventListener('click', () => {
    saveActiveNote(true); // Force final save
    overlay.classList.add('hidden');
    document.body.classList.remove('notes-immersive-active');
    if (immersiveBtn) {
      immersiveBtn.textContent = "Focus Writing";
      immersiveBtn.classList.remove('active');
    }
    
    // Rerender weekly columns and notes libraries
    import('./tasks.js').then(m => m.renderGrid());
    renderNotesLibrary();
  });
  
  // Immersive Focus toggle
  if (immersiveBtn) {
    immersiveBtn.addEventListener('click', () => {
      document.body.classList.toggle('notes-immersive-active');
      if (document.body.classList.contains('notes-immersive-active')) {
        immersiveBtn.textContent = "Exit Focus Mode";
        immersiveBtn.classList.add('active');
      } else {
        immersiveBtn.textContent = "Focus Writing";
        immersiveBtn.classList.remove('active');
      }
    });
  }
  
  // Text Editor formatting buttons
  document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      
      if (cmd === 'hiliteColor') {
        document.execCommand(cmd, false, '#ffc048'); // Highlighter yellow
      } else {
        document.execCommand(cmd, false, val);
      }
      editor.focus();
    });
  });
  
  // Auto-save listeners on keystrokes
  let autosaveTimeout = null;
  editor.addEventListener('input', () => {
    updateEditorStats(editor.innerHTML);
    
    const status = document.getElementById('draft-autosave-status');
    status.textContent = "Typing...";
    
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      saveActiveNote(false); // Silent background draft backup
      status.textContent = "Auto-saved";
    }, 1000);
  });
  
  // Title changes auto-saves too
  document.getElementById('note-page-title').addEventListener('input', () => {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      saveActiveNote(false);
    }, 1000);
  });
  
  // Load templates
  document.getElementById('editor-template-picker').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    
    let templateHtml = '';
    if (val === 'lecture') {
      templateHtml = `
        <h1>Lecture Notes: Topic</h1>
        <h2>Core Concepts & Vocabulary</h2>
        <ul>
          <li>Concept A: Define</li>
          <li>Concept B: Define</li>
        </ul>
        <h2>Detailed Class Notes</h2>
        <p>Type core lecture arguments, slides notes, and definitions here...</p>
      `;
    } else if (val === 'problem') {
      templateHtml = `
        <h1>Problem Set: Homework</h1>
        <h2>Problem Statement</h2>
        <p>Type the equation, question text or prompt details...</p>
        <h2>Solution Strategy</h2>
        <p>1. Step details</p>
        <p>2. Step details</p>
        <h2>Final Answers & Check</h2>
        <pre><code>x = 42</code></pre>
      `;
    } else if (val === 'journal') {
      templateHtml = `
        <h1>Reflections Daily Journal</h1>
        <h2>Gratitude Checklist</h2>
        <ul>
          <li>I am grateful for...</li>
          <li>I am grateful for...</li>
        </ul>
        <h2>Daily learnings & study check</h2>
        <p>Reviewing focus cycles today, what did I complete? How can tomorrow be improved?</p>
      `;
    }
    
    editor.innerHTML = templateHtml;
    saveActiveNote(false);
    updateEditorStats(templateHtml);
    e.target.value = ''; // Reset picker
  });
  
  // Pin note to weekly calendar
  document.getElementById('note-pin-btn').addEventListener('click', () => {
    const notes = getStorageItem(NOTES_KEY, []);
    let noteIndex = notes.findIndex(n => n.date === activeNoteDate);
    let note = noteIndex !== -1 ? notes[noteIndex] : null;
    
    if (!note) {
      note = {
        id: activeNoteDate,
        date: activeNoteDate,
        title: document.getElementById('note-page-title').value.trim() || 'Untitled Note',
        content: document.getElementById('editor-content-area').innerHTML,
        text: document.getElementById('editor-content-area').innerText.trim(),
        subject: 'General',
        pinned: false,
        color: '#171B22',
        attachments: []
      };
      notes.push(note);
      noteIndex = notes.length - 1;
    }
    
    note.pinned = !note.pinned;
    notes[noteIndex] = note;
    setStorageItem(NOTES_KEY, notes);
    
    updatePinButtonState(note.pinned);
    showToast(note.pinned ? "Pinned note to day column! 📌" : "Unpinned note.");
  });
  
  // Drafts restores
  document.getElementById('note-drafts-history').addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === "") return;
    
    const history = getStorageItem(DRAFTS_HISTORY_KEY, {});
    const dateDrafts = history[activeNoteDate] || [];
    const draft = dateDrafts[parseInt(idx)];
    
    if (draft) {
      editor.innerHTML = draft.content;
      document.getElementById('note-page-title').value = draft.title || '';
      updateEditorStats(draft.content);
      showToast("Draft version restored! ↺");
    }
    e.target.value = ''; // Reset picker
  });
  
  // File upload pasted logic
  const dropZone = document.getElementById('editor-file-drop');
  dropZone.addEventListener('click', () => {
    document.getElementById('note-file-input').click();
  });
  
  document.getElementById('note-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageUpload(file);
  });
  
  // AI summariser simulation
  document.getElementById('ai-summarise-btn').addEventListener('click', () => {
    const textContent = editor.innerText.trim();
    if (!textContent) {
      alert("Please write some notes first.");
      return;
    }
    
    const summaryOut = document.getElementById('ai-summary-output');
    summaryOut.innerHTML = "🤖 <em>Claude is reading and summarizing your notes...</em>";
    summaryOut.classList.remove('hidden');
    
    setTimeout(() => {
      summaryOut.innerHTML = `
        <strong>🤖 Claude's 3-Bullet Summary:</strong><br/>
        • <strong>Core Focus:</strong> Mastered the scheduled lecture themes and documented definitions.<br/>
        • <strong>Key Takeaway:</strong> Mastered practical equations and completed scheduled problem steps.<br/>
        • <strong>Review Suggestion:</strong> Practice these revision card decks before test hours.
      `;
    }, 1500);
  });
  
  // AI flashcards simulation
  document.getElementById('ai-flashcards-btn').addEventListener('click', () => {
    const textContent = editor.innerText.trim();
    if (!textContent) {
      alert("Please write some notes first.");
      return;
    }
    
    const flashOut = document.getElementById('ai-flashcards-output');
    flashOut.innerHTML = "🤖 <em>Claude is generating revision flashcards Q&As...</em>";
    flashOut.classList.remove('hidden');
    
    setTimeout(() => {
      flashOut.innerHTML = `
        <strong>🤖 Claude's Q&A Revision Deck:</strong><br/>
        • <strong>Q:</strong> What is the main target concept logged today?<br/>
        &nbsp;&nbsp;<strong>A:</strong> The core formula or conceptual subject tag mapped in the dropdown.<br/>
        • <strong>Q:</strong> What step strategy resolves problems in notes?<br/>
        &nbsp;&nbsp;<strong>A:</strong> Follow the bulleted homework solution strategies logged in the templates!
      `;
    }, 1500);
  });
  
  // Export plain text
  document.getElementById('note-export-btn').addEventListener('click', () => {
    const text = editor.innerText;
    navigator.clipboard.writeText(text);
    showToast("Notes copied to clipboard! 📋");
  });
  
  // Notes Search in Library
  document.getElementById('notes-search-input').addEventListener('input', () => {
    renderNotesLibrary();
  });

  // Database View Toggles
  const views = ['grid', 'list', 'table'];
  views.forEach(v => {
    const btn = document.getElementById(`notes-view-${v}`);
    if (btn) {
      // restore active state from storage
      const savedView = getStorageItem('notes_view_preference', 'grid');
      if (savedView === v) btn.classList.add('active');
      else btn.classList.remove('active');
      
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setStorageItem('notes_view_preference', v);
        renderNotesLibrary();
      });
    }
  });

  // Sort Preference
  const sortSelect = document.getElementById('notes-sort-select');
  if (sortSelect) {
    const savedSort = getStorageItem('notes_sort_preference', 'newest');
    sortSelect.value = savedSort;
    
    sortSelect.addEventListener('change', () => {
      setStorageItem('notes_sort_preference', sortSelect.value);
      renderNotesLibrary();
    });
  }

  // Setup rich editor extensions
  setupSlashMenu(editor);
  setupInlineToolbar(editor);
  setupMentionMenu(editor);
  setupOCRScan();
}

function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target.result;
    
    const notes = getStorageItem(NOTES_KEY, []);
    let noteIndex = notes.findIndex(n => n.date === activeNoteDate);
    let note = noteIndex !== -1 ? notes[noteIndex] : null;
    
    if (!note) {
      note = {
        id: activeNoteDate,
        date: activeNoteDate,
        title: document.getElementById('note-page-title').value.trim() || 'Untitled Note',
        content: document.getElementById('editor-content-area').innerHTML,
        text: document.getElementById('editor-content-area').innerText.trim(),
        subject: 'General',
        pinned: false,
        color: '#171B22',
        attachments: []
      };
      notes.push(note);
      noteIndex = notes.length - 1;
    }
    
    if (!note.attachments) note.attachments = [];
    note.attachments.push(base64);
    
    notes[noteIndex] = note;
    setStorageItem(NOTES_KEY, notes);
    
    renderAttachmentsPreview(note.attachments);
    showToast("Sketch screenshot attached successfully! 📎");
  };
  reader.readAsDataURL(file);
}

function saveActiveNote(forceBackup = false) {
  if (!activeNoteDate) return;
  
  const content = document.getElementById('editor-content-area').innerHTML;
  const title = document.getElementById('note-page-title').value.trim();
  
  const notes = getStorageItem(NOTES_KEY, []);
  let noteIndex = notes.findIndex(n => n.date === activeNoteDate);
  let note = noteIndex !== -1 ? notes[noteIndex] : null;
  
  const temp = document.createElement('div');
  temp.innerHTML = content || "";
  const plainText = temp.textContent || temp.innerText || "";
  
  // Extract subject tag if any (e.g. from title prefix [CS101] or default to General)
  let subject = 'General';
  const match = title.match(/^\[([^\]]+)\]/);
  if (match) {
    subject = match[1];
  } else if (title.toLowerCase().includes('physics')) {
    subject = 'Physics';
  } else if (title.toLowerCase().includes('math')) {
    subject = 'Maths-II';
  } else if (title.toLowerCase().includes('cs') || title.toLowerCase().includes('code')) {
    subject = 'CS101';
  }
  
  // Extract linked tasks from mentions
  const linkedTasks = [];
  temp.querySelectorAll('.note-task-link').forEach(el => {
    const taskId = el.getAttribute('data-task-id');
    if (taskId) linkedTasks.push(taskId);
  });
  
  if (!note) {
    note = {
      id: activeNoteDate,
      date: activeNoteDate,
      subject: subject,
      title: title || 'Untitled Note',
      content: content,
      text: plainText,
      pinned: false,
      color: '#171B22',
      attachments: [],
      linkedTasks: linkedTasks,
      lastEdited: new Date().toISOString()
    };
    notes.push(note);
  } else {
    note.content = content;
    note.text = plainText;
    note.title = title || 'Untitled Note';
    note.subject = subject;
    note.linkedTasks = linkedTasks;
    note.lastEdited = new Date().toISOString();
  }
  
  setStorageItem(NOTES_KEY, notes);
  
  // Storing drafts backups (max 10 versions)
  if (forceBackup || Math.random() < 0.3) {
    const history = getStorageItem(DRAFTS_HISTORY_KEY, {});
    if (!history[activeNoteDate]) history[activeNoteDate] = [];
    
    const newDraft = {
      content,
      title: title || 'Untitled Note',
      timestamp: new Date().toLocaleTimeString()
    };
    
    history[activeNoteDate].unshift(newDraft);
    if (history[activeNoteDate].length > 10) {
      history[activeNoteDate].pop(); // Maintain 10 versions
    }
    setStorageItem(DRAFTS_HISTORY_KEY, history);
  }
}

// Renders the library cards inside modal list
export function renderNotesLibrary() {
  const container = document.getElementById('notes-library-grid');
  if (!container) return;
  container.innerHTML = '';
  
  const notes = getStorageItem(NOTES_KEY, []);
  const query = document.getElementById('notes-search-input').value.toLowerCase().trim();
  const view = getStorageItem('notes_view_preference', 'grid');
  const sort = getStorageItem('notes_sort_preference', 'newest');
  
  // 1. Sort Notes
  let sortedNotes = [...notes];
  if (sort === 'newest') {
    sortedNotes.sort((a, b) => b.date.localeCompare(a.date));
  } else if (sort === 'oldest') {
    sortedNotes.sort((a, b) => a.date.localeCompare(b.date));
  } else if (sort === 'edited') {
    sortedNotes.sort((a, b) => (b.lastEdited || b.date).localeCompare(a.lastEdited || a.date));
  } else if (sort === 'title') {
    sortedNotes.sort((a, b) => (a.subject || 'General').localeCompare(b.subject || 'General'));
  }
  
  // 2. Render Subject Chips
  const subjects = [...new Set(notes.map(n => n.subject || 'General').filter(Boolean))];
  const chipsContainer = document.getElementById('notes-subject-filters');
  if (chipsContainer) {
    chipsContainer.innerHTML = '';
    
    // Add "All" chip
    const allChip = document.createElement('span');
    allChip.textContent = 'All';
    const allActive = selectedSubjects.length === 0;
    allChip.style.cssText = `cursor:pointer; padding:6px 12px; font-size:11px; border-radius:14px; border:1px solid var(--border-color); color: ${allActive ? 'var(--accent)' : 'var(--text-secondary)'}; background: ${allActive ? 'rgba(186,117,23,0.15)' : 'rgba(255,255,255,0.02)'};`;
    allChip.addEventListener('click', () => {
      selectedSubjects = [];
      renderNotesLibrary();
    });
    chipsContainer.appendChild(allChip);

    subjects.forEach(sub => {
      const active = selectedSubjects.includes(sub);
      const chip = document.createElement('span');
      chip.textContent = sub;
      chip.style.cssText = `cursor:pointer; padding:6px 12px; font-size:11px; border-radius:14px; border:1px solid var(--border-color); color: ${active ? 'var(--accent)' : 'var(--text-secondary)'}; background: ${active ? 'rgba(186,117,23,0.15)' : 'rgba(255,255,255,0.02)'};`;
      
      chip.addEventListener('click', () => {
        if (selectedSubjects.includes(sub)) {
          selectedSubjects = selectedSubjects.filter(s => s !== sub);
        } else {
          selectedSubjects.push(sub);
        }
        renderNotesLibrary();
      });
      chipsContainer.appendChild(chip);
    });
  }
  
  // 3. Filter Notes
  if (selectedSubjects.length > 0) {
    sortedNotes = sortedNotes.filter(n => selectedSubjects.includes(n.subject || 'General'));
  }
  
  let filteredNotes = sortedNotes.filter(note => {
    const titleMatch = (note.title || 'Untitled Note').toLowerCase().includes(query);
    const temp = document.createElement('div');
    temp.innerHTML = note.content || "";
    const plainText = temp.textContent || temp.innerText || "";
    const textMatch = plainText.toLowerCase().includes(query);
    return query === "" || titleMatch || textMatch;
  });
  
  if (filteredNotes.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 48px 24px; max-width: 480px; margin: 24px auto;">
        <div style="font-size: 32px; margin-bottom: 16px;">📚</div>
        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">No matching notes.</div>
        <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0;">Try searching another keyword or clearing active subject chips.</p>
      </div>
    `;
    return;
  }
  
  // 4. Render Views
  if (view === 'list') {
    // List View
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    
    filteredNotes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note-list-row';
      item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(255,255,255,0.01); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;`;
      
      const formattedDate = new Date(note.date).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:16px;">📝</span>
          <span style="font-weight:600; font-size:14px; color:#fff;">${note.title || 'Untitled Note'}</span>
          <span class="badge" style="background:rgba(186,117,23,0.1); color:var(--accent); font-size:10px;">${note.subject || 'General'}</span>
        </div>
        <div style="font-size:12px; color:var(--text-secondary);">${formattedDate}</div>
      `;
      item.addEventListener('click', () => {
        document.getElementById('notes-library-modal-overlay').classList.add('hidden');
        openNotesDrawer(note.date);
      });
      container.appendChild(item);
    });
    
  } else if (view === 'table') {
    // Table View
    container.style.display = 'block';
    
    const table = document.createElement('table');
    table.style.cssText = `width:100%; border-collapse:collapse; font-size:13px; text-align:left; color:#fff; background:rgba(0,0,0,0.1); border-radius:8px; overflow:hidden;`;
    
    table.innerHTML = `
      <thead>
        <tr style="border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02);">
          <th style="padding:12px 16px;">Title</th>
          <th style="padding:12px 16px;">Subject</th>
          <th style="padding:12px 16px;">Date</th>
          <th style="padding:12px 16px;">Words</th>
          <th style="padding:12px 16px;">Action</th>
        </tr>
      </thead>
      <tbody>
      </tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    filteredNotes.forEach(note => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--border-color)';
      
      const formattedDate = new Date(note.date).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      const temp = document.createElement('div');
      temp.innerHTML = note.content || "";
      const wordCount = (temp.textContent || "").trim().split(/\s+/).filter(Boolean).length;
      
      row.innerHTML = `
        <td style="padding:12px 16px; font-weight:600; color:#fff;">📝 ${note.title || 'Untitled Note'}</td>
        <td style="padding:12px 16px;"><span class="badge" style="background:rgba(255,255,255,0.05);">${note.subject || 'General'}</span></td>
        <td style="padding:12px 16px; color:var(--text-secondary);">${formattedDate}</td>
        <td style="padding:12px 16px; color:var(--text-secondary);">${wordCount}</td>
        <td style="padding:12px 16px;"><button class="btn-primary-sm open-tbl-note" data-date="${note.date}" style="padding:4px 8px; border-radius:4px;">Open</button></td>
      `;
      row.querySelector('.open-tbl-note').addEventListener('click', () => {
        document.getElementById('notes-library-modal-overlay').classList.add('hidden');
        openNotesDrawer(note.date);
      });
      tbody.appendChild(row);
    });
    container.appendChild(table);
    
  } else {
    // Grid View
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(260px, 1fr))';
    container.style.gap = '16px';
    
    filteredNotes.forEach(note => {
      const dateStr = note.date;
      
      const temp = document.createElement('div');
      temp.innerHTML = note.content || "";
      const plainText = temp.textContent || temp.innerText || "";
      const cleanText = stripMarkdown(plainText);
      
      // Auto Title
      let cardTitle = note.title;
      if (!cardTitle || cardTitle.trim() === "" || cardTitle === "Untitled Note") {
        const words = cleanText.split(/\s+/).filter(Boolean);
        cardTitle = words.slice(0, 6).join(" ") || "Untitled Note";
      }
      
      let preview = cleanText.length > 120 ? cleanText.slice(0, 120) + "..." : cleanText;
      if (query !== "") {
        const regex = new RegExp(`(${query})`, 'gi');
        preview = preview.replace(regex, `<mark style="background:#ffc048; color:#000;">$1</mark>`);
        cardTitle = cardTitle.replace(regex, `<mark style="background:#ffc048; color:#000;">$1</mark>`);
      }
      
      const formattedDate = new Date(dateStr).toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
      
      const card = document.createElement('div');
      card.className = 'day-column';
      card.style.minHeight = '160px';
      
      card.innerHTML = `
        <div class="day-header" style="background: rgba(167,139,250,0.06); border-bottom-color: rgba(167,139,250,0.15);">
          <div class="day-name" style="color:#a78bfa; display:flex; align-items:center; gap:6px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> ${cardTitle}
          </div>
          <div class="day-date">${formattedDate}</div>
        </div>
        <div style="padding: 14px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
          <p style="font-size:12px; color:var(--text-secondary); line-height:1.5; font-style:italic;">"${preview || 'Start typing to add content'}"</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid var(--border-color); padding-top:8px;">
            <span style="font-size:10px; color:var(--text-muted);">Attachments: ${note.attachments ? note.attachments.length : 0}</span>
            <button class="btn-primary-sm open-lib-note" data-date="${dateStr}">Edit</button>
          </div>
        </div>
      `;
      card.querySelector('.open-lib-note').addEventListener('click', () => {
        document.getElementById('notes-library-modal-overlay').classList.add('hidden');
        openNotesDrawer(dateStr);
      });
      container.appendChild(card);
    });
  }
}

function showToast(msg) {
  const toast = document.getElementById('notif-toast');
  document.getElementById('notif-msg').textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ──────────────────────────────────────────
// Rich Editor Notion-Style Extensions
// ──────────────────────────────────────────

function setupSlashMenu(editor) {
  const menu = document.getElementById('slash-menu');
  if (!menu) return;
  
  editor.addEventListener('keyup', (e) => {
    if (e.key === '/') {
      showMenuAtCaret(menu);
    } else if (e.key === 'Escape') {
      menu.classList.add('hidden');
    }
  });
  
  menu.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const type = item.dataset.block;
      insertBlockAtCaret(type);
    });
  });
}

function showMenuAtCaret(menu) {
  const rect = getCaretRect();
  if (rect) {
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 5}px`;
    menu.classList.remove('hidden');
  }
}

function getCaretRect() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    if (range.getClientRects) {
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[0];
    }
  }
  return null;
}

function insertBlockAtCaret(type) {
  const editor = document.getElementById('editor-content-area');
  editor.focus();
  
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    // Remove the '/' character
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const slashIndex = text.lastIndexOf('/', offset);
      if (slashIndex !== -1) {
        node.textContent = text.slice(0, slashIndex) + text.slice(offset);
        range.setStart(node, slashIndex);
        range.collapse(true);
      }
    }
    
    let html = '';
    if (type === 'h1') html = '<h1>Heading 1</h1>';
    else if (type === 'h2') html = '<h2>Heading 2</h2>';
    else if (type === 'ul') html = '<ul><li>List Item</li></ul>';
    else if (type === 'code') html = '<pre style="background:rgba(255,255,255,0.05); padding:10px; border-radius:4px;"><code>// code block</code></pre><p></p>';
    else if (type === 'divider') html = '<hr/><p></p>';
    
    document.execCommand('insertHTML', false, html);
  }
  document.getElementById('slash-menu').classList.add('hidden');
  saveActiveNote(false);
}

function setupInlineToolbar(editor) {
  const toolbar = document.getElementById('inline-toolbar');
  if (!toolbar) return;
  
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!editor.contains(sel.anchorNode)) {
      toolbar.classList.add('hidden');
      return;
    }
    
    if (sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0) {
        toolbar.style.position = 'fixed';
        toolbar.style.left = `${rect.left + rect.width/2 - toolbar.offsetWidth/2}px`;
        toolbar.style.top = `${rect.top - toolbar.offsetHeight - 8}px`;
        toolbar.classList.remove('hidden');
      }
    } else {
      toolbar.classList.add('hidden');
    }
  });
  
  toolbar.querySelectorAll('.inline-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (cmd === 'code') {
        const sel = window.getSelection();
        const html = `<code>${sel.toString()}</code>`;
        document.execCommand('insertHTML', false, html);
      } else {
        document.execCommand(cmd, false, null);
      }
      editor.focus();
    });
  });
  
  const linkBtn = document.getElementById('inline-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const url = prompt("Enter link URL:");
      if (url) {
        document.execCommand('createLink', false, url);
      }
      editor.focus();
    });
  }
}

function setupMentionMenu(editor) {
  const menu = document.getElementById('mention-menu');
  if (!menu) return;
  
  editor.addEventListener('keyup', (e) => {
    if (e.key === '@') {
      renderMentions(menu);
    } else if (e.key === 'Escape') {
      menu.classList.add('hidden');
    }
  });
}

function renderMentions(menu) {
  menu.innerHTML = '';
  const tasks = getStorageItem('tasks', []);
  const activeTasks = tasks.filter(t => !t.completed);
  
  if (activeTasks.length === 0) {
    menu.innerHTML = '<div style="padding:8px 12px; font-size:12px; color:var(--text-muted);">No active tasks to link</div>';
  } else {
    activeTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.style.cssText = `padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid var(--border-color);`;
      item.innerHTML = `✓ ${task.title}`;
      
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertMention(task);
      });
      menu.appendChild(item);
    });
  }
  
  const rect = getCaretRect();
  if (rect) {
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 5}px`;
    menu.classList.remove('hidden');
  }
}

function insertMention(task) {
  const editor = document.getElementById('editor-content-area');
  editor.focus();
  
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const atIndex = text.lastIndexOf('@', offset);
      if (atIndex !== -1) {
        node.textContent = text.slice(0, atIndex) + text.slice(offset);
        range.setStart(node, atIndex);
        range.collapse(true);
      }
    }
    
    const html = `<span class="note-task-link" data-task-id="${task.id}" style="color:var(--accent); font-weight:600; border-bottom:1px dashed var(--accent);">@${task.title}</span>&nbsp;`;
    document.execCommand('insertHTML', false, html);
  }
  
  document.getElementById('mention-menu').classList.add('hidden');
  saveActiveNote(false);
}

function setupOCRScan() {
  const scanBtn = document.getElementById('note-ocr-scan-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          showToast("Scanning image for text...");
          setTimeout(() => {
            const editor = document.getElementById('editor-content-area');
            const ocrText = `<p><strong>Extracted Text (OCR Scan):</strong><br/>Planory Study Plan: Complete homework and practice mock exams.</p>`;
            editor.innerHTML += ocrText;
            saveActiveNote(false);
            showToast("Text extracted successfully!");
          }, 1500);
        }
      });
      fileInput.click();
    });
  }
}
