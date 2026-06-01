import { getStorageItem, setStorageItem } from '../utils/storage.js';

export function initThemeToggle() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (!themeToggleBtn) return;
  
  // Check local storage for preference
  const isLightMode = getStorageItem('planory_light_mode', false);
  if (isLightMode) {
    document.body.classList.add('theme-light');
    document.body.classList.remove('dark');
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('dark');
  }

  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.add('theme-transitioning');
    document.body.classList.toggle('theme-light');
    document.body.classList.toggle('dark');
    const currentlyLight = document.body.classList.contains('theme-light');
    setStorageItem('planory_light_mode', currentlyLight);
    
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 450);
  });
}

export function initZenMode() {
  const zenBtn = document.getElementById('zen-mode-btn');
  if (!zenBtn) return;
  
  let isZenMode = false;
  
  zenBtn.addEventListener('click', () => {
    isZenMode = !isZenMode;
    const sidebar = document.querySelector('.sidebar');
    const statBar = document.querySelector('.stat-bar');
    const quoteBar = document.querySelector('.daily-quote-bar');
    
    if (isZenMode) {
      document.body.classList.add('zen-active');
      if (sidebar) sidebar.style.display = 'none';
      if (statBar) statBar.style.display = 'none';
      if (quoteBar) quoteBar.style.opacity = '0';
      zenBtn.style.color = 'var(--accent)';
      zenBtn.style.transform = 'scale(1.2)';
    } else {
      document.body.classList.remove('zen-active');
      if (sidebar) sidebar.style.display = 'flex';
      if (statBar) statBar.style.display = 'flex';
      if (quoteBar) quoteBar.style.opacity = '1';
      zenBtn.style.color = '';
      zenBtn.style.transform = 'scale(1)';
    }
  });
}

export function initLivePresence() {
  const presenceCount = document.getElementById('presence-count-sidebar') || document.getElementById('presence-count');
  if (!presenceCount) return;
  
  // Base number of simulated users
  let baseUsers = Math.floor(Math.random() * 15) + 10; 
  
  presenceCount.textContent = `${baseUsers} studying now`;
  
  // Randomly fluctuate the number every few seconds to make it feel alive
  setInterval(() => {
    // 30% chance to change
    if (Math.random() > 0.7) {
      const change = Math.random() > 0.5 ? 1 : -1;
      baseUsers += change;
      // Keep it somewhat realistic
      if (baseUsers < 5) baseUsers = 5;
      if (baseUsers > 40) baseUsers = 40;
      
      presenceCount.textContent = `${baseUsers} studying now`;
    }
  }, 4000);
}

export function initCollapsibleSections() {
  const toggles = document.querySelectorAll('.sidebar-section.toggle-collapse');
  toggles.forEach(section => {
    const header = section.querySelector('.section-header');
    const targetId = section.getAttribute('data-target');
    const body = document.getElementById(targetId);
    
    if (header && body) {
      // Toggle collapse on click
      header.addEventListener('click', (e) => {
        // Prevent toggle if clicking internal action buttons (like add-habit-btn)
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) {
          return;
        }
        
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
        
        // Save state to localStorage
        const collapsedState = getStorageItem('planory_collapsed_sections', {});
        collapsedState[targetId] = body.classList.contains('collapsed');
        setStorageItem('planory_collapsed_sections', collapsedState);
      });
      
      // Load saved state or set default
      const savedState = getStorageItem('planory_collapsed_sections', {});
      if (savedState[targetId] !== undefined) {
        if (savedState[targetId]) {
          header.classList.add('collapsed');
          body.classList.add('collapsed');
        } else {
          header.classList.remove('collapsed');
          body.classList.remove('collapsed');
        }
      } else {
        // Default to collapsed for secondary widgets (hydration, habits, brain dump)
        if (targetId !== 'streak-pet-section') {
          header.classList.add('collapsed');
          body.classList.add('collapsed');
        }
      }
    }
  });
}
