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
}

function updatePomoUI() {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  document.getElementById('pomo-display').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  document.getElementById('pomo-mode').textContent = mode === 'work' ? 'Work 🔴' : 'Break 🟢';

  // Rounds bubbles
  let roundStr = "";
  for (let i = 1; i <= 4; i++) {
    roundStr += i <= (completedRounds % 4) ? "●" : "○";
  }
  document.getElementById('pomo-rounds').textContent = roundStr;

  // Start/Pause Button content
  document.getElementById('pomo-start-btn').textContent = isRunning ? '⏸ Pause' : '▶ Start';

  // Task selection
  document.getElementById('pomo-task-label').textContent = activeTaskId ? `Focusing: ${activeTaskTitle}` : 'Ready for another focused session?';

  // Update Forest tree growth stages
  const treeEmojiEl = document.getElementById('pomo-tree-emoji');
  const treeStatusEl = document.getElementById('pomo-tree-status');
  if (treeEmojiEl && treeStatusEl) {
    if (mode === 'break') {
      treeEmojiEl.textContent = '🌺';
      treeStatusEl.textContent = 'Resting';
      treeEmojiEl.style.transform = 'scale(1.1)';
    } else {
      if (!isRunning) {
        if (secondsRemaining === 1500) {
          treeEmojiEl.textContent = '🤎';
          treeStatusEl.textContent = 'Planted';
          treeEmojiEl.style.transform = 'scale(1)';
        } else {
          treeEmojiEl.textContent = '🪵';
          treeStatusEl.textContent = 'Withered';
          treeEmojiEl.style.transform = 'scale(0.9)';
        }
      } else {
        const elapsedPct = ((1500 - secondsRemaining) / 1500) * 100;
        let emoji = '🤎';
        let status = 'Planted';
        let scale = 1;
        
        if (elapsedPct < 15) {
          emoji = '🤎';
          status = 'Planted';
          scale = 1;
        } else if (elapsedPct < 35) {
          emoji = '🌱';
          status = 'Sprouting';
          scale = 1.05;
        } else if (elapsedPct < 55) {
          emoji = '🌿';
          status = 'Growing';
          scale = 1.1;
        } else if (elapsedPct < 75) {
          emoji = '🪴';
          status = 'Healthy';
          scale = 1.15;
        } else if (elapsedPct < 95) {
          emoji = '🌳';
          status = 'Maturing';
          scale = 1.2;
        } else {
          emoji = '🌸';
          status = 'Blossoming';
          scale = 1.25;
        }
        
        treeEmojiEl.textContent = emoji;
        treeStatusEl.textContent = status;
        treeEmojiEl.style.transform = `scale(${scale})`;
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
      if (document.body.classList.contains('pomo-immersive-active')) {
        fullscreenBtn.textContent = 'Exit Immersive 🧘';
      } else {
        fullscreenBtn.textContent = '🧘 Immersive Focus';
      }
      updateBodySceneClass();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.body.classList.remove('pomo-immersive-active');
      if (fullscreenBtn) fullscreenBtn.textContent = '🧘 Immersive Focus';
      updateBodySceneClass();
    });
  }

  // Escape key to exit immersive
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('pomo-immersive-active')) {
      document.body.classList.remove('pomo-immersive-active');
      if (fullscreenBtn) fullscreenBtn.textContent = '🧘 Immersive Focus';
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
        triggerConfettiCelebration();

        // Push tree to forest
        const trees = ['🌳', '🌸', '🌲', '🌴', '🍁', '🍂', '🎄'];
        const chosenTree = trees[Math.floor(Math.random() * trees.length)];
        const forest = getStorageItem('pomo_forest', []);
        forest.push(chosenTree);
        setStorageItem('pomo_forest', forest);
        renderForestGarden();

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
  if (isRunning && mode === 'work' && secondsRemaining < 1500) {
    const forest = getStorageItem('pomo_forest', []);
    forest.push('🪵');
    setStorageItem('pomo_forest', forest);
    renderForestGarden();
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
  document.getElementById('notif-msg').textContent = `Focused on: "${taskTitle}" 🍅`;
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
    document.body.classList.add(`scene-${currentScene}`);
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
    item.textContent = tree;
    item.style.filter = tree === '🪵' ? 'grayscale(0.6)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))';
    item.title = tree === '🪵' ? 'Failed focus session' : 'Successful focus session';
    grid.appendChild(item);
  });
}
