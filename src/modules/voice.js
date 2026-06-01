import { parseNaturalLanguageTask } from '../utils/nlp.js';
import { addTaskDirectly } from './tasks.js';
import { appendBrainDump } from './brain-dump.js';

export function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported in this browser.");
    // Hide mic buttons or show warning on click
    const micButtons = [
      document.getElementById('global-voice-btn'),
      document.getElementById('brain-dump-voice-btn')
    ];
    micButtons.forEach(btn => {
      if (btn) btn.title = "Voice Input not supported in this browser";
    });
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // Supports multilingual inputs naturally or fallback
  
  // Elements
  const voiceOverlay = document.getElementById('voice-overlay');
  const voiceStatus = document.getElementById('voice-status');
  const voicePreview = document.getElementById('voice-preview');
  const voiceCancelBtn = document.getElementById('voice-cancel-btn');
  const voiceConfirmBtn = document.getElementById('voice-confirm-btn');
  
  let targetMode = "global"; // "global" (tasks) or "braindump"
  let parsedTask = null;
  let finalTranscript = "";
  
  const startListening = (mode) => {
    targetMode = mode;
    parsedTask = null;
    finalTranscript = "";
    
    voiceStatus.textContent = "Listening... Speak in Hindi or English";
    voicePreview.textContent = "";
    voiceConfirmBtn.classList.add('hidden');
    voiceOverlay.classList.remove('hidden');
    
    try {
      recognition.start();
    } catch (e) {
      console.error("Speech recognition error:", e);
    }
  };
  
  // Attach triggers
  document.getElementById('global-voice-btn').addEventListener('click', () => startListening("global"));
  document.getElementById('brain-dump-voice-btn').addEventListener('click', () => startListening("braindump"));
  
  voiceCancelBtn.addEventListener('click', () => {
    try { recognition.stop(); } catch(e) {}
    voiceOverlay.classList.add('hidden');
  });
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    finalTranscript = transcript;
    voicePreview.textContent = `"${transcript}"`;
    
    if (targetMode === "global") {
      const parsedTasks = parseNaturalLanguageTask(transcript);
      parsedTask = parsedTasks;
      voiceStatus.textContent = parsedTasks.length > 1 ? `Parsed ${parsedTasks.length} Tasks!` : "Task Parsed!";
      
      let tasksHtml = `
        <div style="font-weight:600; color:var(--text-secondary); margin-bottom:12px; font-style:italic;">"${transcript}"</div>
        <div style="display:flex; flex-direction:column; gap:8px; text-align:left; font-size:13px;">
      `;
      
      parsedTasks.forEach((task, idx) => {
        tasksHtml += `
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:10px 14px; border-radius:12px; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; color:var(--text-primary);">${idx+1}. ${task.title}</span>
              <span class="badge" style="background:rgba(var(--accent-rgb), 0.1); color:var(--accent); font-size:10px; font-weight:700; text-transform:capitalize;">${task.category}</span>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
              <span style="display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> ${task.date}</span>
              <span style="display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${task.startTime ? task.startTime + (task.endTime ? ' - ' + task.endTime : '') : 'All Day'}</span>
              <span style="display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ${task.priority} priority</span>
              ${task.recurring ? `<span style="display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23 3 19l4-15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> ${task.recurrenceType}</span>` : ''}
            </div>
          </div>
        `;
      });
      
      tasksHtml += `</div>`;
      voicePreview.innerHTML = tasksHtml;
      voiceConfirmBtn.classList.remove('hidden');
    } else {
      voiceStatus.textContent = "Brain Dump Parsed!";
      voiceConfirmBtn.classList.remove('hidden');
    }
  };
  
  recognition.onerror = (event) => {
    voiceStatus.textContent = `Error: ${event.error}`;
    console.error("Speech Recognition Error:", event.error);
  };
  
  recognition.onend = () => {
    if (!finalTranscript && voiceOverlay.classList.contains('hidden') === false) {
      voiceStatus.textContent = "Stopped. Try clicking mic and speaking again.";
    }
  };
  
  voiceConfirmBtn.addEventListener('click', () => {
    if (targetMode === "global" && parsedTask) {
      if (Array.isArray(parsedTask)) {
        parsedTask.forEach(task => addTaskDirectly(task));
        showToast(`Scheduled ${parsedTask.length} voice tasks successfully!`);
      } else {
        addTaskDirectly(parsedTask);
        showToast("Voice task scheduled successfully!");
      }
    } else if (targetMode === "braindump" && finalTranscript) {
      appendBrainDump(finalTranscript);
      showToast("Added to Brain Dump!");
    }
    voiceOverlay.classList.add('hidden');
  });
}

function showToast(msg) {
  const toast = document.getElementById('notif-toast');
  document.getElementById('notif-msg').textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
