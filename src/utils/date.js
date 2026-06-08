// Date utilities for Radhe Planner

export function getStartOfWeek(date) {
  // If passed a string like '2026-06-08', parse as local noon to avoid UTC timezone shift
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : new Date(date);
  const day = d.getDay();
  // Adjust to start on Monday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function getWeekDays(startDate) {
  const days = [];
  const start = typeof startDate === 'string' ? new Date(startDate + 'T12:00:00') : new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${minutes} ${ampm}`;
}

export function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

export function getMonthName(date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[date.getMonth()];
}

export function getFormattedDateRange(startDate) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  if (start.getMonth() === end.getMonth()) {
    return `${getMonthName(start)} ${start.getFullYear()}`;
  } else if (start.getFullYear() === end.getFullYear()) {
    return `${getMonthName(start)} - ${getMonthName(end)} ${start.getFullYear()}`;
  } else {
    return `${getMonthName(start)} ${start.getFullYear()} - ${getMonthName(end)} ${end.getFullYear()}`;
  }
}
