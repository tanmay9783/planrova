import { getStorageItem, setStorageItem } from '../utils/storage.js';

const PROFILE_KEY = 'user_profile';

const defaultProfile = {
  name: 'Tanmay',
  bio: 'Builder & Innovator ☕',
  timezone: 'Asia/Kolkata',
  avatar: '🦁',
  onboarded: false
};

export function initProfile() {
  const profile = getStorageItem(PROFILE_KEY, defaultProfile);
  
  // Elements
  const onboardingOverlay = document.getElementById('onboarding-overlay');
  const profileNameDisplay = document.getElementById('profile-name-display');
  const profileBioDisplay = document.getElementById('profile-bio-display');
  const profileAvatarDisplay = document.getElementById('profile-avatar-display');
  
  if (!profile.onboarded) {
    onboardingOverlay.classList.remove('hidden');
    setupOnboardingEvents(profile);
  } else {
    onboardingOverlay.classList.add('hidden');
    updateProfileUI(profile);
  }
  
  setupSettingsProfileEvents(profile);
  setupWorkspaceSettings();
}

function updateProfileUI(profile) {
  document.getElementById('profile-name-display').textContent = profile.name;
  document.getElementById('profile-bio-display').textContent = profile.bio;
  document.getElementById('profile-avatar-display').textContent = profile.avatar;
  
  // Update Workspace Hub Title
  const hubTitle = document.getElementById('workspace-hub-title');
  if (hubTitle) {
    hubTitle.textContent = `⚡ ${profile.name} Workspace Hub`;
  }
  
  // Set in Settings page inputs
  document.getElementById('settings-name').value = profile.name;
  document.getElementById('settings-bio').value = profile.bio;
  
  // Select matching avatar option in settings
  const avatarOpts = document.querySelectorAll('#settings-avatar-picker .avatar-opt');
  avatarOpts.forEach(opt => {
    if (opt.dataset.avatar === profile.avatar) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
}

function setupOnboardingEvents(profile) {
  const saveBtn = document.getElementById('onboarding-save');
  const nameInput = document.getElementById('profile-name-input');
  const bioInput = document.getElementById('profile-bio-input');
  const tzInput = document.getElementById('profile-timezone-input');
  const avatarPicker = document.getElementById('avatar-picker');
  
  let selectedAvatar = '🦁';
  
  avatarPicker.addEventListener('click', (e) => {
    const opt = e.target.closest('.avatar-opt');
    if (!opt) return;
    
    avatarPicker.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected');
    selectedAvatar = opt.dataset.avatar;
  });
  
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Radhe Planner';
    const bio = bioInput.value.trim() || 'My Focus Area';
    const timezone = tzInput.value;
    
    const updatedProfile = {
      name,
      bio,
      timezone,
      avatar: selectedAvatar,
      onboarded: true
    };
    
    setStorageItem(PROFILE_KEY, updatedProfile);
    document.getElementById('onboarding-overlay').classList.add('hidden');
    updateProfileUI(updatedProfile);
  });
}

function setupSettingsProfileEvents(profile) {
  const saveBtn = document.getElementById('save-profile-btn');
  const avatarPicker = document.getElementById('settings-avatar-picker');
  if (!saveBtn || !avatarPicker) return;
  
  let selectedAvatar = profile.avatar;
  
  avatarPicker.addEventListener('click', (e) => {
    const opt = e.target.closest('.avatar-opt');
    if (!opt) return;
    
    avatarPicker.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected');
    selectedAvatar = opt.dataset.avatar;
  });
  
  saveBtn.addEventListener('click', () => {
    const name = document.getElementById('settings-name').value.trim() || 'Radhe Planner';
    const bio = document.getElementById('settings-bio').value.trim() || 'My Focus Area';
    
    const updatedProfile = {
      name,
      bio,
      timezone: profile.timezone,
      avatar: selectedAvatar,
      onboarded: true
    };
    
    setStorageItem(PROFILE_KEY, updatedProfile);
    updateProfileUI(updatedProfile);
    
    // Show notification toast
    const toast = document.getElementById('notif-toast');
    document.getElementById('notif-msg').textContent = "Profile updated successfully! ✨";
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  });
  
  // Hook open profile edit button
  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      document.getElementById('settings-modal-overlay').classList.remove('hidden');
      // Open account tab
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      const accountTab = document.querySelector('.settings-tab[data-tab="account"]');
      if (accountTab) accountTab.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      const accountPanel = document.getElementById('panel-account');
      if (accountPanel) accountPanel.classList.add('active');
    });
  }
}

function setupWorkspaceSettings() {
  // 1. Appearance Settings: Dark/Light Mode
  const darkmodeBtn = document.getElementById('settings-darkmode-toggle');
  if (darkmodeBtn) {
    const updateDarkmodeBtnText = () => {
      const isLight = document.body.classList.contains('theme-light');
      darkmodeBtn.textContent = isLight ? "Light Mode" : "Dark Mode";
    };
    
    updateDarkmodeBtnText();
    
    darkmodeBtn.addEventListener('click', () => {
      const themeToggleBtn = document.getElementById('theme-toggle-btn');
      if (themeToggleBtn) {
        themeToggleBtn.click();
        updateDarkmodeBtnText();
      }
    });
  }

  // 2. Font Size Pickers (S, M, L)
  const fontsizeBtns = document.querySelectorAll('.fontsize-btn');
  const savedSize = getStorageItem('planory_font_size', 'M');
  
  const applyFontSize = (sz) => {
    const root = document.documentElement;
    fontsizeBtns.forEach(btn => {
      if (btn.dataset.sz === sz) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    
    if (sz === 'S') {
      root.style.setProperty('--font-base', '12px');
      root.style.setProperty('--font-lg', '14px');
      root.style.setProperty('--font-xl', '18px');
      root.style.setProperty('--font-2xl', '20px');
    } else if (sz === 'L') {
      root.style.setProperty('--font-base', '16px');
      root.style.setProperty('--font-lg', '18px');
      root.style.setProperty('--font-xl', '22px');
      root.style.setProperty('--font-2xl', '26px');
    } else {
      // M (Default)
      root.style.setProperty('--font-base', '14px');
      root.style.setProperty('--font-lg', '16px');
      root.style.setProperty('--font-xl', '20px');
      root.style.setProperty('--font-2xl', '24px');
    }
  };
  
  applyFontSize(savedSize);
  
  fontsizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sz = btn.dataset.sz;
      setStorageItem('planory_font_size', sz);
      applyFontSize(sz);
    });
  });

  // 3. Study Preferences
  const saveStudyBtn = document.getElementById('save-study-prefs-btn');
  const sessionInput = document.getElementById('settings-study-session');
  const breakInput = document.getElementById('settings-study-break');
  const soundInput = document.getElementById('settings-study-sound');
  const goalInput = document.getElementById('settings-study-goal');
  
  const studyPrefs = getStorageItem('planory_study_prefs', {
    session: 25,
    break: 5,
    sound: 'none',
    goalHours: 4
  });
  
  if (sessionInput) sessionInput.value = studyPrefs.session;
  if (breakInput) breakInput.value = studyPrefs.break;
  if (soundInput) soundInput.value = studyPrefs.sound;
  if (goalInput) goalInput.value = studyPrefs.goalHours;
  
  if (saveStudyBtn) {
    saveStudyBtn.addEventListener('click', () => {
      const updated = {
        session: parseInt(sessionInput.value) || 25,
        break: parseInt(breakInput.value) || 5,
        sound: soundInput.value || 'none',
        goalHours: parseFloat(goalInput.value) || 4
      };
      setStorageItem('planory_study_prefs', updated);
      
      const toast = document.getElementById('notif-toast');
      document.getElementById('notif-msg').textContent = "Study preferences saved! 📚";
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    });
  }

  // 4. Notifications
  const toggles = {
    water: document.getElementById('notif-toggle-water'),
    deadline: document.getElementById('notif-toggle-deadline'),
    habit: document.getElementById('notif-toggle-habit')
  };
  
  const savedNotifs = getStorageItem('planory_notifications_enabled', {
    water: true,
    deadline: true,
    habit: true
  });
  
  Object.keys(toggles).forEach(k => {
    const el = toggles[k];
    if (el) {
      el.checked = savedNotifs[k] !== false;
      el.addEventListener('change', () => {
        savedNotifs[k] = el.checked;
        setStorageItem('planory_notifications_enabled', savedNotifs);
      });
    }
  });

  // 5. Data Management
  const exportBtn = document.getElementById('data-export-btn');
  const clearBtn = document.getElementById('data-clear-btn');
  const deleteBtn = document.getElementById('data-delete-btn');
  
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const keys = ['user_profile', 'theme_settings', 'tasks', 'hydration', 'gamification', 'notes', 'habits', 'expenses', 'planory_study_prefs', 'planory_light_mode', 'planory_font_size', 'planory_notifications_enabled'];
      const data = {};
      keys.forEach(k => {
        try {
          const val = localStorage.getItem(k);
          if (val !== null) data[k] = JSON.parse(val);
        } catch(e) {
          data[k] = localStorage.getItem(k);
        }
      });
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'planory-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to clear your study history and logs? This will reset your streaks and daily progress, but keep your profile.")) {
        localStorage.removeItem('tasks');
        localStorage.removeItem('hydration');
        localStorage.removeItem('gamification');
        localStorage.removeItem('habits');
        localStorage.removeItem('expenses');
        alert("Study history cleared! Relaunching Planory...");
        window.location.reload();
      }
    });
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm("WARNING: This will permanently delete your account profile and all data. This action cannot be undone. Proceed?")) {
        localStorage.clear();
        alert("All local data deleted. Good luck!");
        window.location.reload();
      }
    });
  }
}
