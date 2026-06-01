import { auth } from '../db/firebase.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { startRealtimeSync, stopRealtimeSync, syncPendingChanges } from '../db/syncEngine.js';
import { getStorageItem } from '../utils/storage.js';

function triggerWelcomeAnimation() {
  if (sessionStorage.getItem('welcome_shown')) return;
  sessionStorage.setItem('welcome_shown', 'true');
  
  const welcomeOverlay = document.getElementById('welcome-loader-overlay');
  const welcomeUserText = document.getElementById('welcome-user-name');
  
  if (welcomeOverlay) {
    const profile = getStorageItem('user_profile', { name: 'User' });
    if (welcomeUserText) {
      welcomeUserText.textContent = `Welcome back, ${profile.name}`;
    }
    
    welcomeOverlay.classList.remove('hidden');
    void welcomeOverlay.offsetWidth; // force reflow
    welcomeOverlay.style.opacity = '1';
    
    setTimeout(() => {
      welcomeOverlay.style.opacity = '0';
      setTimeout(() => {
        welcomeOverlay.classList.add('hidden');
      }, 800);
    }, 2200);
  }
}

export function initAuth() {
  const authBtn = document.getElementById('auth-login-btn');
  const authModal = document.getElementById('auth-modal-overlay');
  const closeBtn = document.getElementById('auth-close-btn');
  
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const passGroup = document.getElementById('auth-password-group');
  const forgotLink = document.getElementById('auth-forgot-link');
  const forgotInfo = document.getElementById('auth-forgot-info');
  const errorMsg = document.getElementById('auth-error-msg');
  
  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');
  const modeSelector = document.getElementById('auth-mode-selector');
  const primarySubmit = document.getElementById('auth-primary-submit');
  const backToLoginBtn = document.getElementById('auth-back-to-login');
  
  let currentMode = 'login'; // 'login', 'signup', 'forgot'

  const setAuthMode = (mode) => {
    currentMode = mode;
    errorMsg.style.display = 'none';
    
    // Reset message custom success styles if any
    errorMsg.style.color = '';
    errorMsg.style.borderColor = '';
    errorMsg.style.background = '';
    
    if (mode === 'login') {
      if (tabLogin) {
        tabLogin.classList.add('active');
        tabLogin.style.background = 'var(--accent)';
        tabLogin.style.color = '#000';
      }
      if (tabSignup) {
        tabSignup.classList.remove('active');
        tabSignup.style.background = 'none';
        tabSignup.style.color = 'var(--text-secondary)';
      }
      if (modeSelector) modeSelector.style.display = 'flex';
      if (passGroup) passGroup.style.display = 'flex';
      if (forgotInfo) forgotInfo.style.display = 'none';
      if (backToLoginBtn) backToLoginBtn.style.display = 'none';
      if (primarySubmit) primarySubmit.textContent = 'Log In';
    } else if (mode === 'signup') {
      if (tabSignup) {
        tabSignup.classList.add('active');
        tabSignup.style.background = 'var(--accent)';
        tabSignup.style.color = '#000';
      }
      if (tabLogin) {
        tabLogin.classList.remove('active');
        tabLogin.style.background = 'none';
        tabLogin.style.color = 'var(--text-secondary)';
      }
      if (modeSelector) modeSelector.style.display = 'flex';
      if (passGroup) passGroup.style.display = 'flex';
      if (forgotInfo) forgotInfo.style.display = 'none';
      if (backToLoginBtn) backToLoginBtn.style.display = 'none';
      if (primarySubmit) primarySubmit.textContent = 'Create Account';
    } else if (mode === 'forgot') {
      if (modeSelector) modeSelector.style.display = 'none';
      if (passGroup) passGroup.style.display = 'none';
      if (forgotInfo) forgotInfo.style.display = 'flex';
      if (backToLoginBtn) backToLoginBtn.style.display = 'block';
      if (primarySubmit) primarySubmit.textContent = 'Send Reset Link';
    }
  };

  // Bind Swapping Listeners
  if (tabLogin) tabLogin.addEventListener('click', () => setAuthMode('login'));
  if (tabSignup) tabSignup.addEventListener('click', () => setAuthMode('signup'));
  if (forgotLink) forgotLink.addEventListener('click', () => setAuthMode('forgot'));
  if (backToLoginBtn) backToLoginBtn.addEventListener('click', () => setAuthMode('login'));

  // Handle Auth State Changes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Logged in
      const statusDot = '<span class="auth-dot" style="width: 6px; height: 6px; background: var(--color-success); border-radius: 50%; display: inline-block; margin-right: 4px;"></span>';
      authBtn.innerHTML = statusDot + 'Synced';
      authBtn.style.color = 'var(--color-success)';
      authBtn.title = `Logged in as ${user.email} (Click to logout)`;
      
      authModal.classList.add('hidden');
      if (closeBtn) closeBtn.style.display = '';
      
      // Start Background Sync Engine!
      startRealtimeSync();
      syncPendingChanges(); // initial push if any
      
      // Welcome Loader Animation
      triggerWelcomeAnimation();
    } else {
      // Logged out
      const statusDot = '<span class="auth-dot" style="width: 6px; height: 6px; background: var(--text-muted); border-radius: 50%; display: inline-block; margin-right: 4px;"></span>';
      authBtn.innerHTML = statusDot + 'Off';
      authBtn.style.color = 'var(--text-muted)';
      authBtn.title = 'Enable Cloud Sync';
      
      authModal.classList.remove('hidden');
      if (closeBtn) closeBtn.style.display = 'none';
      
      stopRealtimeSync();
    }
  });

  // Toggle Auth Modal / Logout
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      if (auth.currentUser) {
        if (confirm('Log out of Cloud Sync? Data will remain locally.')) {
          signOut(auth);
        }
      } else {
        authModal.classList.remove('hidden');
        setAuthMode('login');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (!auth.currentUser) return; // Prevent close if not logged in
      authModal.classList.add('hidden');
    });
  }

  // Handle Submit
  if (primarySubmit) {
    primarySubmit.addEventListener('click', async () => {
      errorMsg.style.display = 'none';
      const email = emailInput.value.trim();
      const password = passInput.value;
      
      if (!email) {
        errorMsg.textContent = "Please enter an email address.";
        errorMsg.style.display = 'block';
        return;
      }
      
      if (currentMode !== 'forgot' && !password) {
        errorMsg.textContent = "Please enter a password.";
        errorMsg.style.display = 'block';
        return;
      }

      try {
        if (currentMode === 'login') {
          await signInWithEmailAndPassword(auth, email, password);
        } else if (currentMode === 'signup') {
          await createUserWithEmailAndPassword(auth, email, password);
        } else if (currentMode === 'forgot') {
          await sendPasswordResetEmail(auth, email);
          
          errorMsg.textContent = "Password reset email sent! Please check your inbox.";
          errorMsg.style.color = 'var(--color-success)';
          errorMsg.style.borderColor = 'rgba(52, 211, 153, 0.15)';
          errorMsg.style.background = 'rgba(52, 211, 153, 0.05)';
          errorMsg.style.display = 'block';
          
          setTimeout(() => {
            setAuthMode('login');
          }, 3500);
        }
      } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
      }
    });
  }
}
