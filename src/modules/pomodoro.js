import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { addXP, logDailyActivity } from './gamification.js';

const POMO_STATS_KEY = 'pomodoro_stats';

let currentTimer = null;
let secondsRemaining = 1500; // 25 min default
let isRunning = false;
let mode = 'work'; // 'work' or 'break'
let activeTaskId = null;
let activeTaskTitle = "";
let completedRounds = 0;
let currentScene = 'rain'; // Default focus scene

export function initPomodoro() {
  const stats = getStorageItem(POMO_STATS_KEY, { totalFocusedTime: 0, completedSessions: 0 });

  updatePomoUI();
  updateStatsUI(stats);
  setupPomoEvents(stats);
  renderForestGarden();
  
  const seedPicker = document.getElementById('forest-seed-picker');
  if (seedPicker) {
    seedPicker.value = getStorageItem('forest_selected_seed', 'oak');
    seedPicker.addEventListener('change', (e) => {
      setStorageItem('forest_selected_seed', e.target.value);
      updatePomoUI();
      updateForestPageView();
    });
  }
}

function updatePomoUI() {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  document.getElementById('pomo-display').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  document.getElementById('pomo-mode').textContent = mode === 'work' ? 'Work Mode' : 'Break Mode';

  // Rounds bubbles
  let roundStr = "";
  for (let i = 1; i <= 4; i++) {
    roundStr += i <= (completedRounds % 4) ? "●" : "○";
  }
  document.getElementById('pomo-rounds').textContent = roundStr;

  // Start/Pause Button content
  document.getElementById('pomo-start-btn').textContent = isRunning ? 'Pause' : 'Start';

  // Task selection
  document.getElementById('pomo-task-label').textContent = activeTaskId ? `Focusing: ${activeTaskTitle}` : 'Ready for another focused session?';

  // Update Forest tree growth stages
  const treeContainer = document.getElementById('pomo-tree-container');
  const treeStatusEl = document.getElementById('pomo-tree-status');
  if (treeContainer && treeStatusEl) {
    const selectedSeed = getStorageItem('forest_selected_seed', 'oak');
    if (mode === 'break') {
      treeContainer.innerHTML = getGrowingTreeSVG(selectedSeed, 100, true);
      treeStatusEl.textContent = 'Resting';
      treeContainer.style.transform = 'scale(1.1)';
    } else {
      if (secondsRemaining === 1500) {
        treeContainer.innerHTML = getGrowingTreeSVG(selectedSeed, 0, false);
        treeStatusEl.textContent = 'Planted';
        treeContainer.style.transform = 'scale(1)';
      } else {
        const elapsedPct = ((1500 - secondsRemaining) / 1500) * 100;
        let status = 'Planted';
        let scale = 1;
        
        if (elapsedPct < 15) {
          status = 'Planted';
          scale = 1;
        } else if (elapsedPct < 35) {
          status = 'Sprouting';
          scale = 1.05;
        } else if (elapsedPct < 55) {
          status = 'Growing';
          scale = 1.1;
        } else if (elapsedPct < 75) {
          status = 'Healthy';
          scale = 1.15;
        } else if (elapsedPct < 95) {
          status = 'Maturing';
          scale = 1.2;
        } else {
          status = 'Blossoming';
          scale = 1.25;
        }
        
        if (!isRunning) {
          status += ' (Paused)';
        }
        
        treeContainer.innerHTML = getGrowingTreeSVG(selectedSeed, elapsedPct, false);
        treeStatusEl.textContent = status;
        treeContainer.style.transform = `scale(${scale})`;
      }
    }
  }
}

function updateStatsUI(stats) {
  const h = Math.floor(stats.totalFocusedTime / 60);
  const m = stats.totalFocusedTime % 60;

  const focusVal = document.getElementById('stat-focus');
  if (focusVal) focusVal.textContent = `${h}h ${m}m`;
  const pomoStats = document.getElementById('pomo-stats');
  if (pomoStats) {
    pomoStats.innerHTML = `
      <div style="font-size:11px; color:var(--text-secondary); margin-top:12px;">
        Total: ${h}h ${m}m (${stats.completedSessions} rounds)
      </div>
    `;
  }
}

function setupPomoEvents(stats) {
  const startBtn = document.getElementById('pomo-start-btn');
  const resetBtn = document.getElementById('pomo-reset-btn');
  const fullscreenBtn = document.getElementById('pomo-fullscreen-btn');
  const closeBtn = document.getElementById('pomodoro-modal-close-btn');

  // Immersive Notes Elements
  const notesToggleBtn = document.getElementById('pomo-notes-toggle-btn');
  const notesPanel = document.getElementById('pomo-immersive-notes-panel');
  const notesArrow = document.getElementById('pomo-notes-toggle-arrow');
  const notesTextarea = document.getElementById('pomo-immersive-notes-textarea');
  const saveStatus = document.getElementById('pomo-notes-save-status');

  if (notesToggleBtn && notesPanel) {
    notesToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notesPanel.classList.toggle('hidden');
      if (notesPanel.classList.contains('hidden')) {
        notesPanel.style.right = '-320px';
        notesToggleBtn.style.right = '0';
        if (notesArrow) notesArrow.style.transform = 'rotate(180deg)';
      } else {
        notesPanel.style.right = '0';
        notesToggleBtn.style.right = '320px';
        if (notesArrow) notesArrow.style.transform = 'rotate(0deg)';
        notesTextarea.focus();
      }
    });

    // Load saved immersive notes
    notesTextarea.value = getStorageItem('pomo_immersive_notes', '');

    // Autosave on input
    notesTextarea.addEventListener('input', () => {
      saveStatus.textContent = 'Saving...';
      setStorageItem('pomo_immersive_notes', notesTextarea.value);
      setTimeout(() => {
        saveStatus.textContent = 'Saved';
      }, 500);
    });
  }

  startBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer(stats);
      // Auto play sound matching scene on session start
      if (currentScene === 'rain') playAmbientSound('rain', true);
      else if (currentScene === 'midnight') playAmbientSound('lofi', true);
      else if (currentScene === 'library') playAmbientSound('cafe', true);
      else if (currentScene === 'sprint') playAmbientSound('lofi', true);
      else if (currentScene === 'morning') playAmbientSound('sitar', true);
    }
  });

  resetBtn.addEventListener('click', () => {
    resetTimer();
  });

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      document.body.classList.toggle('pomo-immersive-active');
      const isImmersive = document.body.classList.contains('pomo-immersive-active');
      if (isImmersive) {
        fullscreenBtn.textContent = 'Exit Immersive';
        if (notesToggleBtn) notesToggleBtn.classList.remove('hidden');
      } else {
        fullscreenBtn.textContent = 'Immersive Focus';
        if (notesToggleBtn) notesToggleBtn.classList.add('hidden');
        if (notesPanel) {
          notesPanel.classList.add('hidden');
          notesPanel.style.right = '-320px';
        }
        if (notesToggleBtn) notesToggleBtn.style.right = '0';
        if (notesArrow) notesArrow.style.transform = 'rotate(180deg)';
      }
      updateBodySceneClass();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.body.classList.remove('pomo-immersive-active');
      if (fullscreenBtn) fullscreenBtn.textContent = 'Immersive Focus';
      if (notesToggleBtn) notesToggleBtn.classList.add('hidden');
      if (notesPanel) {
        notesPanel.classList.add('hidden');
        notesPanel.style.right = '-320px';
      }
      if (notesToggleBtn) notesToggleBtn.style.right = '0';
      if (notesArrow) notesArrow.style.transform = 'rotate(180deg)';
      updateBodySceneClass();
    });
  }

  // Escape key to exit immersive
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('pomo-immersive-active')) {
      document.body.classList.remove('pomo-immersive-active');
      if (fullscreenBtn) fullscreenBtn.textContent = 'Immersive Focus';
      if (notesToggleBtn) notesToggleBtn.classList.add('hidden');
      if (notesPanel) {
        notesPanel.classList.add('hidden');
        notesPanel.style.right = '-320px';
      }
      if (notesToggleBtn) notesToggleBtn.style.right = '0';
      if (notesArrow) notesArrow.style.transform = 'rotate(180deg)';
      updateBodySceneClass();
    }
  });

  setupAmbientSounds();
  setupFocusScenes();
}

function startTimer(stats) {
  isRunning = true;
  updatePomoUI();

  currentTimer = setInterval(() => {
    secondsRemaining--;

    if (secondsRemaining <= 0) {
      clearInterval(currentTimer);
      isRunning = false;

      if (mode === 'work') {
        completedRounds++;
        stats.completedSessions++;
        stats.totalFocusedTime += 25; // Log 25 mins focus
        setStorageItem(POMO_STATS_KEY, stats);
        updateStatsUI(stats);

        // Add XP and log activity
        addXP(25);
        logDailyActivity('focus', 25);

        // Notify
        showBrowserNotification("Focus session complete!", "Time for a 5-minute break. Great work!");
        addForestGrowth(100);

        // Switch to break
        mode = 'break';
        secondsRemaining = 300; // 5 min break
      } else {
        showBrowserNotification("Break complete!", "Ready to focus again? Let's start the next round!");

        mode = 'work';
        secondsRemaining = 1500; // 25 mins
      }

      updatePomoUI();
    } else {
      updatePomoUI();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(currentTimer);
  updatePomoUI();
  stopAmbientSound();
}

function resetTimer() {
  if (mode === 'work' && secondsRemaining < 1500) {
    const forest = getStorageItem('pomo_forest', []);
    forest.push('dead');
    setStorageItem('pomo_forest', forest);
    setStorageItem('forest_growth_progress', 0);
    renderForestGarden();
    updateForestPageView();
  }
  isRunning = false;
  clearInterval(currentTimer);
  mode = 'work';
  secondsRemaining = 1500;
  updatePomoUI();
  stopAmbientSound();
}

// Allows setting active task card focus from daily timetable grid
export function setFocusTask(taskId, taskTitle) {
  activeTaskId = taskId;
  activeTaskTitle = taskTitle;

  // Highlight task card with glow
  document.querySelectorAll('.task-card').forEach(card => {
    if (card.dataset.id === taskId) {
      card.classList.add('active-focus');
    } else {
      card.classList.remove('active-focus');
    }
  });

  // Auto start work cycle
  resetTimer();
  updatePomoUI();

  const toast = document.getElementById('notif-toast');
  document.getElementById('notif-msg').textContent = 'Focused on: "' + taskTitle + '"';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function showBrowserNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.svg' });
      }
    });
  }
}

const SOUNDS = {
  rain: '/music/rain.mp3',
  cafe: '/music/tapri.mp3',
  lofi: '/music/lofi.mp3',
  sitar: '/music/sitar.mp3',
  sprint: '/music/lofi.mp3',
  morning: '/music/sitar.mp3'
};

let ambientAudio = null;
let currentSoundType = null;

function setupAmbientSounds() {
  const soundBtns = document.querySelectorAll('.ambient-sound-btn');
  const volumeSlider = document.getElementById('ambient-volume');

  soundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const soundType = btn.dataset.sound;
      playAmbientSound(soundType);
    });
  });

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      if (ambientAudio) {
        ambientAudio.volume = parseFloat(e.target.value);
      }
    });
  }
}

function playAmbientSound(type, forcePlay = false) {
  if (ambientAudio) {
    if (currentSoundType === type && !forcePlay) {
      ambientAudio.pause();
      ambientAudio = null;
      currentSoundType = null;
      updateAmbientUI();
      return;
    }
    ambientAudio.pause();
    ambientAudio = null;
  }

  currentSoundType = type;
  ambientAudio = new Audio(SOUNDS[type]);
  ambientAudio.loop = true;
  ambientAudio.volume = parseFloat(document.getElementById('ambient-volume')?.value || 0.5);
  ambientAudio.play().catch(err => console.log('Ambient audio load error:', err));
  updateAmbientUI();
}

function updateAmbientUI() {
  document.querySelectorAll('.ambient-sound-btn').forEach(btn => {
    if (btn.dataset.sound === currentSoundType) {
      btn.classList.add('active');
      btn.style.borderColor = 'var(--accent)';
      btn.style.background = 'rgba(111,138,183,0.1)';
    } else {
      btn.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.background = '';
    }
  });
}

export function stopAmbientSound() {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio = null;
    currentSoundType = null;
    updateAmbientUI();
  }
}

function setupFocusScenes() {
  const sceneBtns = document.querySelectorAll('.scene-btn');
  sceneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const scene = btn.dataset.scene;
      selectFocusScene(scene);
    });
  });
}

function selectFocusScene(scene) {
  currentScene = scene;

  document.querySelectorAll('.scene-btn').forEach(btn => {
    if (btn.dataset.scene === scene) {
      btn.classList.add('active');
      btn.style.borderColor = 'var(--accent)';
      btn.style.background = 'rgba(111,138,183,0.1)';
    } else {
      btn.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.background = '';
    }
  });

  updateBodySceneClass();

  if (isRunning) {
    if (scene === 'rain') playAmbientSound('rain', true);
    else if (scene === 'midnight') playAmbientSound('lofi', true);
    else if (scene === 'library') playAmbientSound('cafe', true);
    else if (scene === 'sprint') playAmbientSound('lofi', true);
    else if (scene === 'morning') playAmbientSound('sitar', true);
  }
}

function updateBodySceneClass() {
  document.body.classList.remove('scene-rain', 'scene-midnight', 'scene-library', 'scene-sprint', 'scene-morning');
  if (document.body.classList.contains('pomo-immersive-active')) {
    document.body.classList.add('scene-' + currentScene);
    createFocusParticles();
  }
}

function createFocusParticles() {
  const overlay = document.getElementById('pomodoro-modal-overlay');
  if (!overlay) return;

  overlay.querySelectorAll('.focus-particle').forEach(p => p.remove());

  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'focus-particle';
    p.style.left = `${Math.random() * 100}vw`;
    p.style.top = `${Math.random() * 100}vh`;
    p.style.animationDelay = `${Math.random() * 8}s`;

    if (currentScene === 'rain') {
      p.style.width = '1px';
      p.style.height = `${15 + Math.random() * 15}px`;
      p.style.background = 'rgba(120, 158, 212, 0.4)';
      p.style.boxShadow = 'none';
      p.style.animationName = 'rainFall';
      p.style.animationDuration = `${1.5 + Math.random() * 1}s`;
    } else if (currentScene === 'sprint') {
      p.style.width = `${15 + Math.random() * 15}px`;
      p.style.height = '1px';
      p.style.background = 'rgba(226, 125, 125, 0.5)';
      p.style.boxShadow = 'none';
      p.style.animationName = 'sprintStreak';
      p.style.animationDuration = `${1 + Math.random() * 0.8}s`;
    } else {
      const size = `${4 + Math.random() * 6}px`;
      p.style.width = size;
      p.style.height = size;
      p.style.animationDuration = `${8 + Math.random() * 6}s`;

      if (currentScene === 'midnight') {
        p.style.background = 'rgba(162, 138, 212, 0.4)';
        p.style.boxShadow = '0 0 8px rgba(162, 138, 212, 0.8)';
      } else if (currentScene === 'library') {
        p.style.background = 'rgba(212, 171, 106, 0.3)';
        p.style.boxShadow = '0 0 6px rgba(212, 171, 106, 0.5)';
      } else if (currentScene === 'morning') {
        p.style.background = 'rgba(255, 180, 150, 0.25)';
        p.style.boxShadow = '0 0 12px rgba(255, 180, 150, 0.5)';
        p.style.animationName = 'morningFloat';
        p.style.animationDuration = `${10 + Math.random() * 6}s`;
      }
    }

    overlay.appendChild(p);
  }
}

function triggerConfettiCelebration() {
  const overlay = document.getElementById('pomodoro-modal-overlay');
  if (!overlay) return;

  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.style.position = 'absolute';
    c.style.width = `${5 + Math.random() * 8}px`;
    c.style.height = `${5 + Math.random() * 8}px`;
    const colors = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.left = `${50 + (Math.random() - 0.5) * 20}vw`;
    c.style.top = '40vh';
    c.style.borderRadius = '50%';
    c.style.pointerEvents = 'none';
    c.style.zIndex = '99999';
    c.style.transform = 'translateY(0) scale(1)';
    c.style.transition = 'all 2s cubic-bezier(0.16, 1, 0.3, 1)';

    overlay.appendChild(c);

    setTimeout(() => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 200 + Math.random() * 300;
      const x = Math.cos(angle) * velocity;
      const y = Math.sin(angle) * velocity - 100;

      c.style.transform = `translate(${x}px, ${y}px) scale(0.2)`;
      c.style.opacity = '0';
    }, 50);

    setTimeout(() => c.remove(), 2100);
  }
}

export function renderForestGarden() {
  const forest = getStorageItem('pomo_forest', []);
  const grid = document.getElementById('forest-garden-grid');
  const countSpan = document.getElementById('forest-tree-count');
  
  if (!grid) return;
  grid.innerHTML = '';
  
  if (countSpan) countSpan.textContent = forest.length;
  
  if (forest.length === 0) {
    grid.innerHTML = `<span style="grid-column: span 8; font-size: 11px; color: var(--text-muted); font-style: italic; text-align: center; width: 100%;">No trees planted yet. Start focusing!</span>`;
    return;
  }
  
  // Render up to 24 trees (the last 24)
  const recent = forest.slice(-24);
  recent.forEach(tree => {
    const item = document.createElement('span');
    item.innerHTML = getTreeSVG(tree, 20);
    item.style.filter = (tree === 'dead' || tree === '🪵') ? 'grayscale(0.6)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))';
    item.title = (tree === 'dead' || tree === '🪵') ? 'Failed focus session' : 'Grown from focus & tasks';
    grid.appendChild(item);
  });
}

const FOREST_STAGES = [
  { minPct: 0, name: 'Planted Seed' },
  { minPct: 15, name: 'Sprouting' },
  { minPct: 35, name: 'Growing Sapling' },
  { minPct: 55, name: 'Healthy Potted Plant' },
  { minPct: 75, name: 'Maturing Tree' },
  { minPct: 95, name: 'Blossoming Cherry Tree' }
];


function showPomoToast(msg) {
  const toast = document.getElementById('notif-toast');
  const msgEl = document.getElementById('notif-msg');
  if (toast && msgEl) {
    msgEl.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }
}

export function addForestGrowth(pct) {
  try {
    let progress = getStorageItem('forest_growth_progress', 0);
    progress = Math.min(100, Math.max(0, progress + pct));
    
    if (progress >= 100) {
      const selectedSeed = getStorageItem('forest_selected_seed', 'oak');
      const forest = getStorageItem('pomo_forest', []);
      forest.push(selectedSeed);
      setStorageItem('pomo_forest', forest);
      
      const celebrationOverlay = document.getElementById('forest-celebration-overlay');
      const celebrationImg = document.getElementById('celebration-forest-image');
      const celebrationMsg = document.getElementById('celebration-message');
      
      if (celebrationOverlay && celebrationImg && celebrationMsg) {
        celebrationImg.innerHTML = getTreeSVG(selectedSeed, 120);
        celebrationMsg.textContent = `You have successfully grown a mature ${selectedSeed.toUpperCase()} tree in your Focus Forest!`;
        celebrationOverlay.classList.remove('hidden');
        
        triggerConfettiCelebration();
        setTimeout(triggerConfettiCelebration, 600);
        setTimeout(triggerConfettiCelebration, 1200);
        
        setTimeout(() => {
          celebrationOverlay.classList.add('hidden');
        }, 5000);
      }
      
      progress = 0;
      showPomoToast(`Your plant fully blossomed into a ${selectedSeed.toUpperCase()} tree!`);
    }
    
    setStorageItem('forest_growth_progress', progress);
    
    renderForestGarden();
    updateForestPageView();
  } catch (err) {
    console.error("Error in addForestGrowth:", err);
  }
}

export function updateForestPageView() {
  try {
    const progress = getStorageItem('forest_growth_progress', 0);
    const forest = getStorageItem('pomo_forest', []);
    const selectedSeed = getStorageItem('forest_selected_seed', 'oak');
    
    const mainPlantContainer = document.getElementById('forest-main-plant-container');
    const stageEl = document.getElementById('forest-growth-stage');
    const pctEl = document.getElementById('forest-growth-pct');
    const fillEl = document.getElementById('forest-growth-fill');
    const badgeCountEl = document.getElementById('forest-badge-count');
    const gardenGridEl = document.getElementById('forest-page-garden-grid');
    
    if (badgeCountEl) {
      badgeCountEl.textContent = `${forest.length} Tree${forest.length === 1 ? '' : 's'} grown`;
    }
    
    let currentStageName = 'Planted';
    if (progress < 15) currentStageName = 'Planted';
    else if (progress < 35) currentStageName = 'Sprouting';
    else if (progress < 55) currentStageName = 'Growing';
    else if (progress < 75) currentStageName = 'Healthy';
    else if (progress < 95) currentStageName = 'Maturing';
    else currentStageName = 'Blossoming';
    
    if (mainPlantContainer) {
      mainPlantContainer.innerHTML = getGrowingTreeSVG(selectedSeed, progress, false);
      const scale = 1 + (progress % 20) * 0.01;
      mainPlantContainer.style.transform = `scale(${scale})`;
    }
    
    if (stageEl) {
      stageEl.textContent = currentStageName;
    }
    
    if (pctEl) {
      pctEl.textContent = `${Math.round(progress)}% Grow Progress`;
    }
    
    if (fillEl) {
      fillEl.style.width = `${progress}%`;
    }
    
    // Render the weather particles overlay
    const weatherOverlay = document.getElementById('forest-weather-overlay');
    if (weatherOverlay) {
      weatherOverlay.innerHTML = '';
      let particleCount = 0;
      let particleClass = '';
      
      if (currentScene === 'rain') {
        particleCount = 40;
        particleClass = 'rain-drop';
      } else if (currentScene === 'midnight') {
        particleCount = 25;
        particleClass = 'star-particle';
      } else if (currentScene === 'sprint') {
        particleCount = 20;
        particleClass = 'spark-particle';
      } else if (currentScene === 'morning') {
        particleCount = 15;
        particleClass = 'morning-drifter';
      }
      
      for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = `weather-particle ${particleClass}`;
        p.style.left = `${Math.random() * 100}%`;
        p.style.top = `${Math.random() * -10}%`;
        p.style.animationDelay = `${Math.random() * 6}s`;
        p.style.animationDuration = `${3 + Math.random() * 5}s`;
        p.style.opacity = `${0.3 + Math.random() * 0.7}`;
        weatherOverlay.appendChild(p);
      }
    }
    
    if (gardenGridEl) {
      gardenGridEl.innerHTML = '';
      if (forest.length === 0) {
        gardenGridEl.innerHTML = `<span style="grid-column: span 10; font-size: 12px; color: var(--text-muted); font-style: italic; text-align: center; width: 100%;">No trees in your forest yet. Start focus sessions and complete tasks to grow them!</span>`;
      } else {
        forest.forEach(tree => {
          const item = document.createElement('span');
          item.innerHTML = getTreeSVG(tree, 28);
          item.style.filter = (tree === 'dead' || tree === '🪵') ? 'grayscale(0.6)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))';
          item.title = (tree === 'dead' || tree === '🪵') ? 'Failed focus session' : 'Grown from focus & tasks';
          gardenGridEl.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.error("Error in updateForestPageView:", err);
  }
}

// Minimal vector tree SVGs
export function getTreeSVG(treeType, size = 24) {
  let color = '#34d399';
  let path = '';
  const type = (treeType || '').toLowerCase();
  
  if (type === 'dead' || type === '🪵') {
    color = '#6b7280';
    path = `<rect x="10" y="14" width="4" height="8" rx="1" fill="${color}" />
            <path d="M7 16h10" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />`;
  } else if (type === 'sakura' || type === '🌸') {
    color = '#f472b6';
    path = `<rect x="11" y="15" width="2" height="7" rx="0.5" fill="#78350f" />
            <circle cx="12" cy="10" r="6" fill="${color}" opacity="0.9" />
            <circle cx="9" cy="12" r="4" fill="${color}" opacity="0.85" />
            <circle cx="15" cy="12" r="4" fill="${color}" opacity="0.85" />`;
  } else if (type === 'maple' || type === '🍁') {
    color = '#f97316';
    path = `<rect x="11" y="15" width="2" height="7" rx="0.5" fill="#78350f" />
            <path d="M12 4L6 14h12Z" fill="${color}" />
            <path d="M12 8L8 16h8Z" fill="${color}" opacity="0.9" />`;
  } else if (type === 'pine' || type === '🌲') {
    color = '#065f46';
    path = `<rect x="11" y="16" width="2" height="6" rx="0.5" fill="#78350f" />
            <path d="M12 3L7 11h10Z" fill="${color}" />
            <path d="M12 8L6 17h12Z" fill="${color}" opacity="0.9" />`;
  } else if (type === 'palm' || type === '🌴') {
    color = '#10b981';
    path = `<path d="M12 22c0-8-2-12-5-14" stroke="#78350f" stroke-width="2" stroke-linecap="round" fill="none" />
            <path d="M7 8c3-2 6-2 9 0" stroke="${color}" stroke-width="2" stroke-linecap="round" fill="none" />
            <path d="M7 8c1-3 3-5 5-5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" fill="none" />
            <path d="M7 8c-2 2-4 4-5 6" stroke="${color}" stroke-width="1.5" stroke-linecap="round" fill="none" />`;
  } else {
    color = '#059669';
    path = `<rect x="11" y="15" width="2" height="7" rx="0.5" fill="#78350f" />
            <circle cx="12" cy="9" r="6" fill="${color}" />
            <circle cx="8" cy="11" r="5" fill="${color}" opacity="0.9" />
            <circle cx="16" cy="11" r="5" fill="${color}" opacity="0.9" />`;
  }
  
  return `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display: block; overflow: visible;">
      ${path}
    </svg>
  `;
}

export function getGrowingTreeSVG(seedType, progressPct, isResting) {
  if (isResting) {
    return getTreeSVG(seedType, 52);
  }

  let color = '#34d399';
  const type = (seedType || '').toLowerCase();
  if (type === 'sakura') color = '#f472b6';
  else if (type === 'maple') color = '#f97316';
  else if (type === 'pine') color = '#065f46';
  else if (type === 'palm') color = '#10b981';
  else color = '#059669';

  if (progressPct < 15) {
    // Seed
    return `
      <svg viewBox="0 0 24 24" width="36" height="36" style="display: block; overflow: visible;">
        <circle cx="12" cy="18" r="3" fill="#78350f" />
        <rect x="9" y="17" width="6" height="4" fill="#4b5563" rx="1" />
      </svg>
    `;
  } else if (progressPct < 35) {
    // Sprout
    return `
      <svg viewBox="0 0 24 24" width="40" height="40" style="display: block; overflow: visible;">
        <path d="M12 20v-5M12 15c-1-2-3-2-4-2.5M12 16c2-1 3.5-2.5 3-4" stroke="#34d399" stroke-width="2" stroke-linecap="round" fill="none" />
        <rect x="9" y="19" width="6" height="2" fill="#4b5563" rx="0.5" />
      </svg>
    `;
  } else if (progressPct < 55) {
    // Sapling
    return `
      <svg viewBox="0 0 24 24" width="44" height="44" style="display: block; overflow: visible;">
        <path d="M12 20v-8M12 15c-1.5-1.5-3-1.5-4.5-1M12 13c1.5-1.5 3-1.5 4.5-1" stroke="#78350f" stroke-width="2" stroke-linecap="round" fill="none" />
        <circle cx="7" cy="13" r="2.5" fill="${color}" />
        <circle cx="17" cy="11" r="2.5" fill="${color}" />
        <circle cx="12" cy="10" r="3.5" fill="${color}" />
      </svg>
    `;
  } else if (progressPct < 75) {
    // Shrub
    return `
      <svg viewBox="0 0 24 24" width="48" height="48" style="display: block; overflow: visible;">
        <rect x="11" y="14" width="2" height="7" rx="0.5" fill="#78350f" />
        <circle cx="12" cy="9" r="5" fill="${color}" />
        <circle cx="9" cy="11" r="4" fill="${color}" opacity="0.9" />
        <circle cx="15" cy="11" r="4" fill="${color}" opacity="0.9" />
      </svg>
    `;
  } else if (progressPct < 95) {
    // Maturing
    return `
      <svg viewBox="0 0 24 24" width="50" height="50" style="display: block; overflow: visible;">
        <rect x="11" y="13" width="2" height="8" rx="0.5" fill="#78350f" />
        <circle cx="12" cy="8" r="6" fill="${color}" />
        <circle cx="8" cy="10" r="5" fill="${color}" opacity="0.9" />
        <circle cx="16" cy="10" r="5" fill="${color}" opacity="0.9" />
      </svg>
    `;
  } else {
    // Blossoming / Fully Grown
    return getTreeSVG(seedType, 52);
  }
}
