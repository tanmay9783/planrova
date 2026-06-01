import './style.css';
import { preloadCache, getStorageItem } from './utils/storage.js';
import { initProfile } from './modules/profile.js';
import { initThemes } from './modules/themes.js';
import { initQuotes } from './modules/quotes.js';
import { initBrainDump } from './modules/brain-dump.js';
import { initVoiceInput } from './modules/voice.js';
import { initPomodoro, stopAmbientSound } from './modules/pomodoro.js';
import { initHabits } from './modules/habits.js';
import { initMonthlyCalendar, renderMonthlyCalendar } from './modules/monthly-cal.js';
import { initTasks, renderGrid } from './modules/tasks.js';
import { initBudgetTracker } from './modules/budget.js';
import { initHydration } from './modules/hydration.js';
import { initNotes, renderNotesLibrary } from './modules/notes.js';

import { initGamification, populateWeekInReview } from './modules/gamification.js';
import { initThemeToggle, initZenMode, initLivePresence, initCollapsibleSections } from './modules/advanced-focus.js';
import { initAuth } from './modules/auth.js';
import { auth } from './db/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

import { COLORS, TYPOGRAPHY, BORDER_RADIUS } from './utils/tokens.js';
import { initCommandPalette } from './modules/command-palette.js';

function injectCSSVariables() {
  const root = document.documentElement;
  root.style.setProperty('--accent', COLORS.GOLD);
  root.style.setProperty('--bg-app', COLORS.DARK_BG);
  root.style.setProperty('--bg-sidebar', COLORS.CARD_BG);
  root.style.setProperty('--bg-card', COLORS.CARD_BG);
  root.style.setProperty('--border-color', COLORS.BORDER);
  
  root.style.setProperty('--color-notes', COLORS.notes);
  root.style.setProperty('--color-water', COLORS.water);
  root.style.setProperty('--color-budget', COLORS.budget);
  root.style.setProperty('--color-timer', COLORS.timer);
  root.style.setProperty('--color-alarms', COLORS.alarms);

  root.style.setProperty('--font-xs', `${TYPOGRAPHY.xs}px`);
  root.style.setProperty('--font-sm', `${TYPOGRAPHY.sm}px`);
  root.style.setProperty('--font-base', `${TYPOGRAPHY.base}px`);
  root.style.setProperty('--font-lg', `${TYPOGRAPHY.lg}px`);
  root.style.setProperty('--font-xl', `${TYPOGRAPHY.xl}px`);
  root.style.setProperty('--font-2xl', `${TYPOGRAPHY.xxl}px`);
  root.style.setProperty('--line-height-body', TYPOGRAPHY.lineHeight.body);
  root.style.setProperty('--line-height-heading', TYPOGRAPHY.lineHeight.heading);

  root.style.setProperty('--radius-xs', `${BORDER_RADIUS.xs}px`);
  root.style.setProperty('--radius-sm', `${BORDER_RADIUS.sm}px`);
  root.style.setProperty('--radius-md', `${BORDER_RADIUS.md}px`);
  root.style.setProperty('--radius-lg', `${BORDER_RADIUS.lg}px`);
  root.style.setProperty('--radius-xl', `${BORDER_RADIUS.xl}px`);
}

injectCSSVariables();

console.log("⚡ main.js evaluated!");

function runInit() {
  console.log("⚡ runInit called!");

  const safeInit = (name, fn) => {
    try { fn(); } catch (e) { console.error(`Error initializing ${name}:`, e); }
  };

  // 1. Initialize Profile & Settings tabs
  safeInit('Profile', initProfile);
  safeInit('Themes', initThemes);
  safeInit('Quotes', initQuotes);

  // 2. Initialize Core Features
  safeInit('Gamification', initGamification);
  safeInit('MonthlyCalendar', initMonthlyCalendar);
  safeInit('Tasks', initTasks);
  safeInit('BrainDump', initBrainDump);
  safeInit('VoiceInput', initVoiceInput);
  safeInit('Pomodoro', initPomodoro);
  safeInit('Habits', initHabits);
  safeInit('BudgetTracker', initBudgetTracker);
  safeInit('Hydration', initHydration);
  safeInit('Notes', initNotes);
  safeInit('CommandPalette', initCommandPalette);

  // 3. Setup General Layout Triggers & Navigation switches
  safeInit('GeneralUI', setupGeneralUI);
}

function applyTimeOfDayTheme() {
  const hour = new Date().getHours();
  const body = document.body;

  body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');

  if (hour >= 5 && hour < 11) body.classList.add('theme-morning');
  else if (hour >= 11 && hour < 17) body.classList.add('theme-day');
  else if (hour >= 17 && hour < 20) body.classList.add('theme-evening');
  else body.classList.add('theme-night');
}

function initAppFlow() {
  let appInitialized = false;

  // Initialize Auth listeners (login/signup buttons, status updates) immediately
  try {
    initAuth();
  } catch (e) {
    console.error("Error initializing Auth module:", e);
  }

  onAuthStateChanged(auth, async (user) => {
    const authModal = document.getElementById('auth-modal-overlay');
    const closeBtn = document.getElementById('auth-close-btn');

    if (user) {
      if (authModal) authModal.classList.add('hidden');
      if (closeBtn) closeBtn.style.display = ''; // restore close button visibility
      
      if (!appInitialized) {
        appInitialized = true;
        // Wait for DB cache to preload before rendering any module
        await preloadCache();
        runInit();
      }
    } else {
      // Force show auth modal overlay and hide its close button
      if (authModal) {
        authModal.classList.remove('hidden');
        if (closeBtn) closeBtn.style.display = 'none';
      }
      
      // If the app was previously initialized and user logs out, reload to clear memory/UI states
      if (appInitialized) {
        window.location.reload();
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    applyTimeOfDayTheme();
    initAppFlow();
  });
} else {
  applyTimeOfDayTheme();
  initAppFlow();
}

function setupGeneralUI() {
  console.log("⚡ setupGeneralUI called!");
  // Sidebar toggler
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // View switches (Weekly Timetable vs Dedicated Month Calendar)
  const viewWeeklyBtn = document.getElementById('view-weekly-btn');
  const viewCalendarBtn = document.getElementById('view-calendar-btn');
  
  const weeklyGrid = document.getElementById('weekly-grid-view');
  const monthlyCalendar = document.getElementById('monthly-calendar-view');

  if (viewWeeklyBtn && viewCalendarBtn && weeklyGrid && monthlyCalendar) {
    viewWeeklyBtn.addEventListener('click', () => {
      viewWeeklyBtn.classList.add('active');
      viewCalendarBtn.classList.remove('active');

      weeklyGrid.classList.remove('hidden');
      monthlyCalendar.classList.add('hidden');

      renderGrid(); // Rerender weekly grid
    });

    viewCalendarBtn.addEventListener('click', () => {
      viewCalendarBtn.classList.add('active');
      viewWeeklyBtn.classList.remove('active');

      monthlyCalendar.classList.remove('hidden');
      weeklyGrid.classList.add('hidden');

      renderMonthlyCalendar(); // Rerender monthly calendar
    });
  }

  // Settings Tab switches
  const tabs = document.querySelectorAll('.settings-tab');
  const panels = document.querySelectorAll('.settings-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById(`panel-${target}`).classList.add('active');
    });
  });

  // Settings Modal opening / closing
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const settingsOverlay = document.getElementById('settings-modal-overlay');
  const closeSettingsBtn = document.getElementById('settings-close-btn');

  if (openSettingsBtn && settingsOverlay) {
    openSettingsBtn.addEventListener('click', () => {
      settingsOverlay.classList.remove('hidden');
    });
  }

  if (closeSettingsBtn && settingsOverlay) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });
  }

  // Advanced Focus Modules
  initThemeToggle();
  initZenMode();
  initLivePresence();
  initCollapsibleSections();

  // Week in Review Modal
  const wrBtn = document.getElementById('week-review-btn');
  const wrOverlay = document.getElementById('week-review-overlay');
  const wrCloseBtn = document.getElementById('close-week-review-btn');

  if (wrBtn && wrOverlay) {
    wrBtn.addEventListener('click', () => {
      populateWeekInReview();
      wrOverlay.classList.remove('hidden');
    });
  }

  if (wrCloseBtn && wrOverlay) {
    wrCloseBtn.addEventListener('click', () => {
      wrOverlay.classList.add('hidden');
    });
  }

  // Hamburger Apps Hub Drawer Triggers
  const hubBtn = document.getElementById('global-hub-hamburger-btn');
  const hubOverlay = document.getElementById('apps-hub-overlay');
  const hubClose = document.getElementById('apps-hub-close-btn');

  if (hubBtn && hubOverlay) {
    hubBtn.addEventListener('click', () => {
      hubOverlay.classList.remove('hidden');
    });
  }

  if (hubClose && hubOverlay) {
    hubClose.addEventListener('click', () => {
      hubOverlay.classList.add('hidden');
    });
  }

  // Hub Drawer Tile Launch Events
  const tileNotes = document.getElementById('hub-tile-notes');
  const tileWater = document.getElementById('hub-tile-water');
  const tileBudget = document.getElementById('hub-tile-budget');
  const tilePomo = document.getElementById('hub-tile-pomodoro');

  if (tileNotes) {
    tileNotes.addEventListener('click', () => {
      hubOverlay.classList.add('hidden');
      document.getElementById('notes-library-modal-overlay').classList.remove('hidden');
      renderNotesLibrary();
    });
  }

  if (tileWater) {
    tileWater.addEventListener('click', () => {
      hubOverlay.classList.add('hidden');
      document.getElementById('water-modal-overlay').classList.remove('hidden');
    });
  }

  if (tileBudget) {
    tileBudget.addEventListener('click', () => {
      hubOverlay.classList.add('hidden');
      document.getElementById('budget-insights-modal-overlay').classList.remove('hidden');
    });
  }

  if (tilePomo) {
    tilePomo.addEventListener('click', () => {
      hubOverlay.classList.add('hidden');
      document.getElementById('pomodoro-modal-overlay').classList.remove('hidden');
    });
  }

  // Sidebar Nav clicks
  const sidebarNavNotes = document.getElementById('sidebar-nav-notes');
  const sidebarNavTimer = document.getElementById('sidebar-nav-timer');

  if (sidebarNavNotes) {
    sidebarNavNotes.addEventListener('click', () => {
      document.getElementById('notes-library-modal-overlay').classList.remove('hidden');
      renderNotesLibrary();
    });
  }

  if (sidebarNavTimer) {
    sidebarNavTimer.addEventListener('click', () => {
      document.getElementById('pomodoro-modal-overlay').classList.remove('hidden');
    });
  }

  // Sync active states on sidebar nav
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Close modals when clicking overlay outside card
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Prevent closing the auth overlay when the user is logged out (forced auth screen)
        if (overlay.id === 'auth-modal-overlay' && !auth.currentUser) {
          return;
        }
        overlay.classList.add('hidden');
        if (overlay.id === 'pomodoro-modal-overlay') {
          stopAmbientSound();
        }
      }
    });
  });

  // Notes library modal close
  const libraryClose = document.getElementById('notes-library-close-btn');
  if (libraryClose) {
    libraryClose.addEventListener('click', () => {
      document.getElementById('notes-library-modal-overlay').classList.add('hidden');
    });
  }

  // Pomodoro Focus modal close
  const pomoClose = document.getElementById('pomodoro-modal-close-btn');
  if (pomoClose) {
    pomoClose.addEventListener('click', () => {
      document.getElementById('pomodoro-modal-overlay').classList.add('hidden');
      stopAmbientSound();
    });
  }

  // Handle Side Notes drawer click overlay closing
  const drawerOverlay = document.getElementById('notes-drawer-overlay');
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) {
        drawerOverlay.classList.add('hidden');
        renderGrid();
      }
    });
  }

  // Shortcuts modal close
  const shortcutsClose = document.getElementById('shortcuts-close-btn');
  if (shortcutsClose) {
    shortcutsClose.addEventListener('click', () => {
      document.getElementById('shortcuts-modal-overlay').classList.add('hidden');
    });
  }

  // Mobile Bottom Tab clicks
  const mobWeekly = document.getElementById('mobile-tab-weekly');
  const mobSchedule = document.getElementById('mobile-tab-schedule');
  const mobNotes = document.getElementById('mobile-tab-notes');
  const mobTimer = document.getElementById('mobile-tab-timer');
  
  if (mobWeekly) {
    mobWeekly.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      mobWeekly.classList.add('active');
      const btn = document.getElementById('view-weekly-btn');
      if (btn) btn.click();
    });
  }
  if (mobSchedule) {
    mobSchedule.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      mobSchedule.classList.add('active');
      const btn = document.getElementById('view-calendar-btn');
      if (btn) btn.click();
    });
  }
  if (mobNotes) {
    mobNotes.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      mobNotes.classList.add('active');
      document.getElementById('notes-library-modal-overlay').classList.remove('hidden');
      renderNotesLibrary();
    });
  }
  if (mobTimer) {
    mobTimer.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      mobTimer.classList.add('active');
      document.getElementById('pomodoro-modal-overlay').classList.remove('hidden');
    });
  }

  // Sync mobile dashboard values periodically
  setInterval(syncMobileDashboard, 1000);

  setupKeyboardShortcuts();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlays = document.querySelectorAll('.modal-overlay, .notes-drawer-overlay, .day-detail-panel, #command-palette-overlay, #shortcuts-modal-overlay');
      overlays.forEach(overlay => overlay.classList.add('hidden'));
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const palette = document.getElementById('command-palette-overlay');
      if (palette) {
        palette.classList.toggle('hidden');
        if (!palette.classList.contains('hidden')) {
          document.getElementById('command-palette-input').focus();
        }
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const sheet = document.getElementById('shortcuts-modal-overlay');
      if (sheet) sheet.classList.toggle('hidden');
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const todayStr = new Date().toISOString().split('T')[0];
      import('./modules/notes.js').then(m => {
        m.openNotesDrawer(todayStr);
      });
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
      e.preventDefault();
      document.getElementById('pomodoro-modal-overlay').classList.remove('hidden');
    }
    
    // Check if user is typing in inputs to prevent triggering nav shortcuts
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }
    
    if (e.key === '1') {
      const btn = document.getElementById('view-weekly-btn');
      if (btn) btn.click();
    } else if (e.key === '2') {
      const habitsSection = document.getElementById('habits-section');
      if (habitsSection) habitsSection.classList.remove('collapsed');
    } else if (e.key === '3') {
      const notesBtn = document.getElementById('notes-library-modal-overlay');
      if (notesBtn) {
        notesBtn.classList.remove('hidden');
        import('./modules/notes.js').then(m => m.renderNotesLibrary());
      }
    } else if (e.key === '4') {
      document.getElementById('pomodoro-modal-overlay').classList.remove('hidden');
    } else if (e.key === '5') {
      const btn = document.getElementById('view-calendar-btn');
      if (btn) btn.click();
    }
  });
}

function syncMobileDashboard() {
  const levelState = getStorageItem('gamification', { level: 1, xp: 0, tasksCompletedToday: 0, waterLoggedToday: 0 });
  const waterSettings = getStorageItem('hydration_settings', { goal: 2000 });
  
  const mobLevel = document.getElementById('mobile-level-display');
  const mobXp = document.getElementById('mobile-xp-display');
  const mobStreak = document.getElementById('mobile-streak-display');
  const mobWaterVol = document.getElementById('mobile-water-volume');
  const mobWaterPct = document.getElementById('mobile-water-pct');
  const mobScoreLetter = document.getElementById('mobile-score-letter');
  const mobPetEmoji = document.getElementById('mobile-pet-emoji');
  
  const levelDisplay = document.getElementById('level-display');
  if (mobLevel && levelDisplay) mobLevel.textContent = levelDisplay.textContent;
  
  const xpDisplay = document.getElementById('xp-display');
  if (mobXp && xpDisplay) mobXp.textContent = xpDisplay.textContent;
  
  const streakEl = document.getElementById('streak-count');
  if (mobStreak && streakEl) mobStreak.textContent = streakEl.textContent;
  
  // water
  const logs = getStorageItem('hydration_logs', []);
  const d = new Date();
  const year = d.getFullYear();
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  const todayStr = [year, month, day].join('-');
  const todayLogs = logs.filter(l => l.date === todayStr);
  const waterVolume = todayLogs.reduce((sum, l) => sum + parseInt(l.amount), 0);

  const waterGoal = waterSettings.goal || 2000;
  const pct = Math.min(100, Math.max(0, Math.round((waterVolume / waterGoal) * 100)));
  if (mobWaterVol) mobWaterVol.textContent = `${waterVolume} / ${waterGoal} ml`;
  if (mobWaterPct) mobWaterPct.textContent = `${pct}% complete`;
  
  // score
  const scoreLetterEl = document.getElementById('daily-score-letter');
  if (mobScoreLetter && scoreLetterEl) mobScoreLetter.textContent = `${scoreLetterEl ? scoreLetterEl.textContent : 'F'} Score`;
  
  // pet/plant emoji
  const petContainer = document.getElementById('virtual-pet-container');
  if (mobPetEmoji && petContainer) {
    mobPetEmoji.textContent = petContainer.textContent;
  }
}
