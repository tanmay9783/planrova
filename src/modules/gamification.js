import { getStorageItem, setStorageItem } from '../utils/storage.js';
import { formatDate } from '../utils/date.js';

const GAMIFICATION_KEY = 'gamification';

const defaultState = {
  xp: 0,
  level: 1,
  tasksCompletedToday: 0,
  waterLoggedToday: 0,
  focusMinutesToday: 0,
  lastUpdated: new Date().toDateString()
};

const CORE_STAGES = [
  { minLevel: 1, name: 'Basic Core', msg: 'Focus Core is online. Complete tasks to power it up!' },
  { minLevel: 3, name: 'Dual Core', msg: 'Focus Core has evolved to Dual Core status!' },
  { minLevel: 5, name: 'Tri-Core', msg: 'Focus Core is glowing brightly with clean energy!' },
  { minLevel: 10, name: 'Quad-Core', msg: 'Focus Core is highly efficient and spinning rapidly!' },
  { minLevel: 15, name: 'Nova Core', msg: 'Focus Core is pulsing at maximum focus capacity!' },
  { minLevel: 20, name: 'Quantum Core', msg: 'Focus Core has reached ultimate quantum synchronization!' }
];

export function getCoreSVG(level, isSleepy, isThirsty) {
  let color = 'var(--accent)';
  let spinDuration = '6s';
  let orbitRings = 1;
  let hasOuterNodes = false;
  let pulseClass = '';

  if (isThirsty) {
    color = '#f87171'; // Warning red
    spinDuration = '0s'; // Static
    pulseClass = 'thirsty-pulse';
  } else if (isSleepy) {
    color = '#4b5563'; // Sleepy gray
    spinDuration = '20s'; // Very slow
  } else {
    // Normal active states
    if (level >= 20) {
      color = '#a78bfa'; // Purple
      spinDuration = '2s';
      orbitRings = 4;
      hasOuterNodes = true;
      pulseClass = 'quantum-pulse';
    } else if (level >= 15) {
      color = '#10b981'; // Green
      spinDuration = '3s';
      orbitRings = 3;
      hasOuterNodes = true;
      pulseClass = 'nova-pulse';
    } else if (level >= 10) {
      color = '#3b82f6'; // Blue
      spinDuration = '4s';
      orbitRings = 3;
      hasOuterNodes = true;
    } else if (level >= 5) {
      color = '#fbbf24'; // Yellow
      spinDuration = '5s';
      orbitRings = 2;
    } else if (level >= 3) {
      color = '#ec4899'; // Pink
      spinDuration = '6s';
      orbitRings = 2;
    }
  }

  // Generate rings HTML
  let ringsHTML = '';
  for (let i = 1; i <= orbitRings; i++) {
    const radius = 14 + i * 8;
    const direction = i % 2 === 0 ? 'reverse' : 'normal';
    ringsHTML += `
      <circle cx="50" cy="50" r="${radius}" 
        fill="none" 
        stroke="${color}" 
        stroke-width="1.5" 
        stroke-dasharray="8 6" 
        style="transform-origin: center; animation: spinCore ${spinDuration} linear infinite ${direction}; opacity: ${0.8 - i * 0.15};" 
      />`;
  }

  // Orbiting outer nodes if level is high
  let nodesHTML = '';
  if (hasOuterNodes && !isThirsty && !isSleepy) {
    nodesHTML = `
      <circle cx="50" cy="10" r="3" fill="${color}" style="transform-origin: center; animation: spinCore 4s linear infinite;" />
      <circle cx="50" cy="90" r="3" fill="${color}" style="transform-origin: center; animation: spinCore 4s linear infinite reverse;" />
    `;
  }

  // Central orb
  const centralOrbRadius = isThirsty ? 8 : (isSleepy ? 10 : 12);
  const coreHTML = `
    <svg viewBox="0 0 100 100" class="focus-core-svg ${pulseClass}" style="width: 100%; height: 100%; overflow: visible; display: block;">
      <!-- Glowing background aura -->
      <circle cx="50" cy="50" r="${centralOrbRadius}" fill="${color}" style="opacity: 0.35; filter: blur(4px); transform-origin: center; animation: pulseCore 2s ease-in-out infinite alternate;" />
      <!-- Central solid core -->
      <circle cx="50" cy="50" r="${centralOrbRadius}" fill="${color}" style="transform-origin: center;" />
      <!-- Orbiting dashed rings -->
      ${ringsHTML}
      <!-- Orbiting nodes -->
      ${nodesHTML}
    </svg>
  `;
  return coreHTML;
}

export function initGamification() {
  checkDailyReset();
  updateUI();
  setupShareButton();
}

function setupShareButton() {
  const shareBtn = document.getElementById('share-wrapped-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      shareBtn.textContent = "Generating... ⏳";
      try {
        // Load html2canvas dynamically
        if (!window.html2canvas) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        
        const card = document.getElementById('week-review-content');
        // Hide the share button during capture
        shareBtn.style.display = 'none';
        
        const canvas = await window.html2canvas(card, {
          backgroundColor: null,
          scale: 2
        });
        
        shareBtn.style.display = '';
        
        const imgData = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'planory-week-wrapped.png';
        link.href = imgData;
        link.click();
        
        shareBtn.textContent = "📤 Share card";
      } catch (err) {
        console.error("html2canvas failed", err);
        shareBtn.textContent = "Failed to export";
        alert("Failed to export. Take a standard screenshot instead!");
      }
    });
  }
}

function checkDailyReset() {
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  const today = new Date().toDateString();
  
  if (state.lastUpdated !== today) {
    // Reset daily stats
    state.tasksCompletedToday = 0;
    state.waterLoggedToday = 0;
    state.focusMinutesToday = 0;
    state.lastUpdated = today;
    setStorageItem(GAMIFICATION_KEY, state);
  }
}

export function addXP(amount) {
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  state.xp += amount;
  
  const xpNeeded = getXPForNextLevel(state.level);
  let leveledUp = false;
  
  if (state.xp >= xpNeeded) {
    state.xp -= xpNeeded;
    state.level += 1;
    leveledUp = true;
  }
  
  setStorageItem(GAMIFICATION_KEY, state);
  updateUI();
  
  if (leveledUp) {
    playLevelUpEffect(state.level);
  }
}

export function logDailyActivity(type, amount = 1) {
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  if (type === 'task') state.tasksCompletedToday += amount;
  if (type === 'water') state.waterLoggedToday += amount;
  if (type === 'focus') state.focusMinutesToday += amount;
  
  setStorageItem(GAMIFICATION_KEY, state);
  updateUI();
}

function getXPForNextLevel(level) {
  return Math.floor(100 * Math.pow(1.2, level - 1));
}

function updateUI() {
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  
  // 1. Update Level & XP Bar
  const levelDisplay = document.getElementById('level-display');
  const xpDisplay = document.getElementById('xp-display');
  const xpProgressFill = document.getElementById('xp-progress-fill');
  
  if (levelDisplay) levelDisplay.textContent = `Level ${state.level}`;
  
  const xpNeeded = getXPForNextLevel(state.level);
  if (xpDisplay) xpDisplay.textContent = `${Math.floor(state.xp)} / ${Math.floor(xpNeeded)} XP`;
  
  if (xpProgressFill) {
    const pct = Math.min(100, Math.max(0, (state.xp / xpNeeded) * 100));
    xpProgressFill.style.width = `${pct}%`;
    
    // Update avatar ring fill
    const avatarRingFill = document.getElementById('avatar-ring-fill');
    if (avatarRingFill) {
      const circumference = 276.46; // Circumference of radius 44 circle
      const offset = circumference - (pct / 100) * circumference;
      avatarRingFill.style.strokeDashoffset = offset;
    }
  }
  
  // 2. Update Virtual Pet
  const petContainer = document.getElementById('virtual-pet-container');
  const petMsg = document.getElementById('pet-status-msg');
  
  if (petContainer && petMsg) {
    // Check if thirsty (no logs in last 4 hours or no logs today)
    const logs = getStorageItem('hydration_logs', []);
    const todayStr = formatDate(new Date());
    const todayLogs = logs.filter(l => l.date === todayStr);
    let isThirsty = false;
    
    if (todayLogs.length === 0) {
      isThirsty = true;
    } else {
      const latestLog = todayLogs.reduce((latest, current) => {
        const currentEpoch = parseInt(current.id.replace('h_', '')) || 0;
        const latestEpoch = parseInt(latest.id.replace('h_', '')) || 0;
        return currentEpoch > latestEpoch ? current : latest;
      }, todayLogs[0]);
      const latestEpoch = parseInt(latestLog.id.replace('h_', '')) || 0;
      if (Date.now() - latestEpoch > 4 * 60 * 60 * 1000) {
        isThirsty = true;
      }
    }

    const isSleepy = state.tasksCompletedToday === 0 && state.level > 1;

    let currentStage = CORE_STAGES[0];
    for (let i = CORE_STAGES.length - 1; i >= 0; i--) {
      if (state.level >= CORE_STAGES[i].minLevel) {
        currentStage = CORE_STAGES[i];
        break;
      }
    }
    
    petContainer.innerHTML = getCoreSVG(state.level, isSleepy, isThirsty);
    
    if (isThirsty) {
      petMsg.textContent = "Focus Core depleted. Log hydration to revive.";
      petContainer.style.opacity = '0.5';
      petContainer.style.animation = 'none';
    } else if (isSleepy) {
      petMsg.textContent = "Focus Core is in low-power standby mode. Complete a task to activate.";
      petContainer.style.opacity = '0.7';
      petContainer.style.animation = 'floatFlame 4s ease-in-out infinite alternate';
    } else {
      petMsg.textContent = currentStage.msg;
      petContainer.style.opacity = '1';
      petContainer.style.animation = 'floatFlame 2.5s ease-in-out infinite alternate';
    }
  }

  // 3. Update Daily Score Ring
  const ringFill = document.getElementById('daily-score-ring-fill');
  const scoreLetter = document.getElementById('daily-score-letter');
  const tooltip = document.getElementById('score-tooltip');
  
  const scoreBreakdown = calculateDailyScoreNumeric(state);
  const scoreVal = scoreBreakdown.score;
  const grade = getLetterGrade(scoreVal);
  
  if (scoreLetter) scoreLetter.textContent = grade;
  if (ringFill) {
    // 100 is max. Circumference of radius 16 circle is 100.53
    const circumference = 100.53;
    const offset = circumference - (Math.min(100, scoreVal) / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
    
    // Green when doing well: red < 40, amber 40-70, green > 70
    if (scoreVal >= 70) {
      ringFill.style.stroke = '#34d399'; // Green
    } else if (scoreVal >= 40) {
      ringFill.style.stroke = '#fbbf24'; // Amber
    } else {
      ringFill.style.stroke = '#f87171'; // Red
    }
  }
  
  if (tooltip) {
    tooltip.textContent = `Tasks ${scoreBreakdown.tasks}% + Focus ${scoreBreakdown.focus}% + Habits ${scoreBreakdown.habits}% + Water ${scoreBreakdown.water}%`;
  }
  
  // 4. Update Streak Aura Class
  const streakCard = document.querySelector('.streak-card');
  if (streakCard) {
    if (state.tasksCompletedToday > 0 || state.focusMinutesToday > 0 || state.waterLoggedToday > 0) {
      streakCard.classList.add('active-aura');
    } else {
      streakCard.classList.remove('active-aura');
    }
  }
}

export function calculateDailyScoreNumeric(state) {
  let tasksPoints = Math.min(40, (state.tasksCompletedToday || 0) * 10);
  let focusPoints = Math.min(30, (state.focusMinutesToday || 0));
  let habitsPoints = Math.min(20, (state.habitsCompletedToday || 0) * 5);
  let waterPoints = Math.min(10, (state.waterLoggedToday || 0) * 2);
  
  return {
    score: tasksPoints + focusPoints + habitsPoints + waterPoints,
    tasks: tasksPoints,
    focus: focusPoints,
    habits: habitsPoints,
    water: waterPoints
  };
}

function getLetterGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function calculateWeeklyGrade(tasksCount) {
  if (tasksCount >= 25) return 'A+';
  if (tasksCount >= 20) return 'A';
  if (tasksCount >= 16) return 'B+';
  if (tasksCount >= 12) return 'C+';
  if (tasksCount >= 8) return 'C';
  if (tasksCount >= 4) return 'D';
  return 'F';
}

export function populateWeekInReview() {
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  
  const weeklyTasks = Math.max(state.tasksCompletedToday * 4, 12);
  const weeklyFocusMins = Math.max(state.focusMinutesToday * 3, 120);
  const focusHours = Math.round(weeklyFocusMins / 60);
  
  const grade = calculateWeeklyGrade(weeklyTasks);
  
  const scoreEl = document.getElementById('wr-score');
  const tasksEl = document.getElementById('wr-tasks');
  const focusEl = document.getElementById('wr-focus');
  const bestDayEl = document.getElementById('wr-best-day');
  
  if (scoreEl) scoreEl.textContent = grade;
  if (tasksEl) tasksEl.textContent = weeklyTasks;
  if (focusEl) focusEl.textContent = `${focusHours}h`;
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (bestDayEl) bestDayEl.textContent = days[new Date().getDay() - 1] || 'Friday';
}

function playLevelUpEffect(level) {
  // Create a stunning full-screen level up effect with an evolution card
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.pointerEvents = 'all';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.style.background = 'rgba(9, 8, 11, 0.85)';
  overlay.style.backdropFilter = 'blur(20px)';
  overlay.style.transition = 'opacity 0.5s ease';
  
  const card = document.createElement('div');
  card.style.width = '360px';
  card.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.005) 100%)';
  card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  card.style.boxShadow = '0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
  card.style.borderRadius = '24px';
  card.style.padding = '32px';
  card.style.textAlign = 'center';
  card.style.animation = 'slideUpBounce 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  // Get stage name
  const state = getStorageItem(GAMIFICATION_KEY, defaultState);
  let currentStage = CORE_STAGES[0];
  for (let i = CORE_STAGES.length - 1; i >= 0; i--) {
    if (level >= CORE_STAGES[i].minLevel) {
      currentStage = CORE_STAGES[i];
      break;
    }
  }

  const svgHTML = getCoreSVG(level, false, false);
  card.innerHTML = `
    <div style="width: 80px; height: 80px; margin: 0 auto 20px auto; animation: floatFlame 3s ease-in-out infinite alternate;">${svgHTML}</div>
    <h2 style="font-family: var(--font-display); font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 8px;">Level Up!</h2>
    <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 24px;">
      Your Focus Core has evolved to <strong>${currentStage.name}</strong> at Level ${level}!
    </p>
    <button class="btn-primary" id="level-up-confirm-btn" style="width: 100%; padding: 12px; border-radius: 12px; font-weight: 700;">Continue ✓</button>
  `;
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const confirmBtn = card.querySelector('#level-up-confirm-btn');
  confirmBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
  });
  
  // Play subtle sound if browser allows
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log("Audio autoplay prevented"));
  } catch(e) {}
}

// Global hook for animations
if (typeof window !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUpBounce {
      0% { transform: translateY(50px) scale(0.8); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes fadeInOut {
      0% { opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
