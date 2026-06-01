/**
 * Theme Detector Utility
 * Detects local device clock and date to dynamically adjust the greeting, 
 * background tints, active seasonal/festival themes, and streak icon representation.
 */

export function getTimeOfDayProfile() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return 'morning';
  } else if (hour >= 11 && hour < 17) {
    return 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'evening';
  } else {
    return 'night';
  }
}

export function getGreeting(name = 'Student') {
  const profile = getTimeOfDayProfile();
  const cleanName = name || 'Student';
  switch (profile) {
    case 'morning':
      return `Good morning, ${cleanName}! 🌅`;
    case 'afternoon':
      return `Good afternoon, ${cleanName}! ☀️`;
    case 'evening':
      return `Good evening, ${cleanName}! 🌇`;
    case 'night':
      return `Good night, ${cleanName}! 🌌`;
    default:
      return `Welcome back, ${cleanName}!`;
  }
}

export function getContextualMessage() {
  const hour = new Date().getHours();
  if (hour === 10) return "Time to focus 🎯";
  if (hour === 19) return "Wrap up soon ☕";
  if (hour === 0) return "Late night grind? ⚡";
  
  const profile = getTimeOfDayProfile();
  switch (profile) {
    case 'morning':
      return "Morning ritual is ready. Start your session!";
    case 'afternoon':
      return "Steady focus yields ultimate grades.";
    case 'evening':
      return "Wrap up, log achievements, and wind down.";
    case 'night':
      return "Late night grind? Make it count.";
    default:
      return "Ready to grind? Your desk is active.";
  }
}

export function getAmbientGlow(profile) {
  const currentProfile = profile || getTimeOfDayProfile();
  switch (currentProfile) {
    case 'morning':
      return {
        topColor: '#F59E0B', // Amber
        bottomColor: '#F59E0B',
        opacity: 0.12, // Vibrant amber glow
      };
    case 'afternoon':
      return {
        topColor: '#5A6070', // Neutral greyish/warm
        bottomColor: '#171B22',
        opacity: 0.05,
      };
    case 'evening':
      return {
        topColor: '#8B5CF6', // Purple/Pink cool
        bottomColor: '#EC4899',
        opacity: 0.09,
      };
    case 'night':
      return {
        topColor: '#1E3A8A', // Deep Blue
        bottomColor: '#0F1115',
        opacity: 0.15,
      };
    default:
      return {
        topColor: '#BA7517',
        bottomColor: '#4B6BFB',
        opacity: 0.06,
      };
  }
}

export function getActiveTheme() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (Jan=0, May=4, Oct=9, Nov=10, Dec=11)
  const date = now.getDate();

  // 1. New Semester Kickoff Mode (Jan 1-7 and Jul 1-7)
  if ((month === 0 || month === 6) && date >= 1 && date <= 7) {
    return 'kickoff';
  }
  
  // 2. Holi Week Theme (March 1-7)
  if (month === 2 && date >= 1 && date <= 7) {
    return 'holi';
  }

  // 3. Independence Day Theme (Aug 12-18)
  if (month === 7 && date >= 12 && date <= 18) {
    return 'independence';
  }

  // 4. Diwali Gold Theme (Oct 25 - Nov 15)
  if ((month === 9 && date >= 25) || (month === 10 && date <= 15)) {
    return 'diwali';
  }

  // 5. Exam Season Mode (Apr 15 - May 30 & Nov 16 - Dec 15)
  const isSpringExams = (month === 3 && date >= 1) || month === 4; // Apr & May
  const isWinterExams = (month === 10 && date >= 16) || (month === 11 && date <= 15); // Nov 16 to Dec 15
  if (isSpringExams || isWinterExams) {
    return 'exams';
  }

  return 'none';
}

export function getThemeConfig() {
  const theme = getActiveTheme();
  
  // Default values
  const config = {
    themeId: theme,
    primaryColor: '#BA7517', // Classic Gold
    accentColor: '#4B6BFB',  // Classic Indigo Blue
    streakIcon: 'flame',
    streakColor: '#BA7517',
    greetingPrefix: '',
    brandingMessage: '',
    countdownTitle: 'Exam Countdown',
  };

  switch (theme) {
    case 'diwali':
      config.primaryColor = '#FFD700'; // Diwali Gold
      config.accentColor = '#F59E0B';  // Warm Amber
      config.streakIcon = 'sunny';     // Diya representation in Ionicons
      config.streakColor = '#FFD700';
      config.greetingPrefix = 'Shubh Diwali';
      config.brandingMessage = 'Light up your study desk with focus. 🪔';
      break;
    case 'exams':
      config.primaryColor = '#BA7517'; // Accent Gold
      config.accentColor = '#BA7517';  // Accent Gold
      config.streakColor = '#BA7517';  // Accent Gold
      config.greetingPrefix = 'Exam Week';
      config.brandingMessage = 'Exam Season Mode is active. Focus, grind, succeed! 📚';
      break;
    case 'holi':
      config.primaryColor = '#EC4899'; // Holi Pink
      config.accentColor = '#10B981';  // Green splash
      config.streakColor = '#EC4899';
      config.greetingPrefix = 'Happy Holi';
      config.brandingMessage = 'Happy Holi — but finish your assignment first! 🎨';
      break;
    case 'kickoff':
      config.primaryColor = '#10B981'; // Fresh Green
      config.accentColor = '#3B82F6';  // New beginnings Blue
      config.greetingPrefix = 'New Term';
      config.brandingMessage = 'New term, new you — set your goals! 🚀';
      break;
    case 'independence':
      config.primaryColor = '#F97316'; // Saffron
      config.accentColor = '#22C55E';  // Green
      config.greetingPrefix = 'Jai Hind';
      config.brandingMessage = 'Study hard, make India proud! 🇮🇳';
      break;
    default:
      break;
  }

  return config;
}
