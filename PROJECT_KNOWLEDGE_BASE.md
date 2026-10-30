# Planrova — Comprehensive Project Knowledge Base & AI Agent Operational Manual

> **Document Version:** 1.0.0  
> **Target Audience:** Future AI Agents, Senior Systems Architects, Core Maintainers  
> **Status:** Verified against repository source code (Commit Head: 2026-10-30)

---

## A. Project Identity

### 1. Purpose & Vision
**Planrova** is a multi-platform, local-first academic planning, student productivity, and gamified study ecosystem. It bridges desktop web browsers and native mobile smartphones into a unified, synchronized environment designed specifically for high school and university students. The platform transforms routine study tracking, habit building, hydration logging, and student budgeting into an engaging RPG-style progression system with social accountability rooms and AI-driven document digitization.

### 2. Core Problem Statement
Modern students suffer from productivity fragmentation:
- **Disjointed Tooling:** Students juggle distinct apps for timetable management, habit tracking, Pomodoro timers, personal budgeting, and notebook scanning.
- **Fragile Cloud Dependency:** Many web planners break completely or lose input state when campus Wi-Fi drops or during underground transit commutes.
- **Lack of Motivation & Inertia:** Traditional planners are dry text spreadsheets. They lack feedback loops, gamified rewards, and social study reinforcement.
- **Alarm Ineffectiveness:** Standard smartphone alarms are silenced subconsciously in half-sleep without mental activation, leading to missed lectures.
- **Manual Input Friction:** Transferring physical lecture notes and syllabus calendars into digital trackers requires tedious manual typing.

### 3. Target Users
- University undergraduates, STEM majors, and high school students managing complex class schedules, labs, assignments, and exam calendars.
- Self-studying cohorts, competitive exam aspirants (e.g., JEE, NEET, GATE, UPSC), and study-with-me groups who benefit from synchronized live focus rooms.
- Budget-conscious students seeking simple cash-flow discipline and daily pocket-money tracking without commercial banking bloat.

### 4. Core Concepts
- **Tri-Workspace Topology:** High-fidelity Desktop Web App (`src/`), Native Mobile Companion (`mobile/`), and Zero-Dependency Cloud Proxy (`server/`).
- **Local-First Architecture:** Writes commit synchronously to local storage (`Map` in-memory + Dexie IndexedDB on Web; `AsyncStorage` + Firestore on Mobile) with background conflict-resolved cloud synchronization.
- **Focus Core & RPG Gamification:** User productivity yields Experience Points (XP) and Focus Coins. The user's virtual avatar ("Focus Core") dynamically evolves across orbital complexity stages based on daily activity, hydration levels, and focus duration.
- **Native Alarm Missions:** An Android native bridge scheduling wake-up alarms via `AlarmManager.setExactAndAllowWhileIdle` and requiring cognitive or physical challenges (Math, Shake, Typing, Walking) to dismiss.
- **Vision OCR Pipeline:** Physical document capture piped through an isolated server proxy to the Groq Llama-3.2 Vision API for instant Markdown transcription and calendar event extraction.

### 5. Current Development Status
- **Web Client:** Production-grade vanilla ES6 SPA bundled with Vite. Fully implements all core planners, local-first Dexie cache, Firebase Auth, and Firestore Study Pool.
- **Mobile Client:** Fully developed React Native application on Expo SDK 54 with custom Android native Kotlin modules for exact alarms and background services.
- **Server:** Functional zero-dependency Node.js HTTP proxy protecting Groq Vision API credentials.

---

## B. Technology Inventory

| Technology | Version / Spec | Purpose in System | Location in Codebase |
|---|---|---|---|
| **JavaScript (ES6 Modules)** | ES2022 | Core logic for the web client without framework overhead | `src/**/*.js` |
| **Vite** | `^8.0.12` | Web development server, HMR, and production bundler | `package.json`, `vite.config.js` |
| **Dexie.js** | `^4.4.2` | IndexedDB wrapper for local-first persistent web caching | `src/db/database.js`, `src/utils/storage.js` |
| **Firebase App & Auth** | `^12.13.0` | Cross-platform user authentication (Email/Password) | `src/db/firebase.js`, `mobile/src/firebase.js` |
| **Firebase Firestore** | `^12.13.0` | Cloud database for real-time document sync, presence, and chat | `src/db/syncEngine.js`, `mobile/src/hooks/useFirestoreData.js` |
| **React Native** | `0.81.5` | Cross-platform native mobile runtime | `mobile/package.json` |
| **Expo SDK** | `~54.0.35` | Mobile build harness, permissions, audio, and asset handling | `mobile/app.json`, `mobile/package.json` |
| **Kotlin / Android Native** | Android SDK 34+ | Exact alarm scheduling, foreground audio service, wake locks | `mobile/android/app/src/main/java/com/planrova/app/` |
| **React Navigation** | `^7.x` | Native Stack + Bottom Tabs with gesture pan-handling | `mobile/src/navigation/` |
| **Expo Audio & AV** | `~1.1.1` / `~16.0.8`| Ambient focus audio playback and alarms | `mobile/src/screens/FocusScreen.js`, `AlarmScreen.js` |
| **Expo Sensors** | `~15.0.8` | Accelerometer & Pedometer for alarm dismissal missions | `mobile/src/screens/AlarmRingingScreen.js` |
| **Node.js Runtime** | Node 18+ (ESM) | Vision proxy server with zero external dependencies | `server/proxy.js`, `server/package.json` |
| **Groq Vision API** | `llama-3.2-11b-vision-preview` | LLM multimodal OCR for document and timetable transcription | Called by `server/proxy.js` |
| **Service Worker (PWA)** | Cache API / Push API | Web asset caching, offline page routing, and push notifications | `public/sw.js` |
| **Web Speech API** | `SpeechRecognition` | Hands-free voice-to-text task entry with Hindi/English support | `src/modules/voice.js` |

---

## C. Complete Architecture

### 1. System Topology

```
                  +----------------------------------------------+
                  |           Planrova Cloud Services            |
                  |                                              |
                  |   +------------------+  +-----------------+  |
                  |   | Firebase Auth    |  | Cloud Firestore |  |
                  |   +------------------+  +-----------------+  |
                  +-----------^---------------------^------------+
                              |                     |
                  +-----------v---------------------v------------+
                  |         Planrova OCR Proxy Server            |
                  |         (Node.js http/https on Render)       |
                  |                     |                        |
                  |              Forward Payloads                |
                  |                     v                        |
                  |         Groq Vision API (LLaMA 3.2)          |
                  +-----------^---------------------^------------+
                              |                     |
            JSON Payloads     |                     | Base64 Image
            (OCR Requests)    |                     | (OCR Scans)
                              |                     |
     +------------------------+                     +------------------------+
     |                                                                       |
+----+--------------------------------+                 +--------------------+---------------------------+
|      Planrova Web Client            |                 |       Planrova Mobile Companion               |
|      (Vite + Vanilla ES6 SPA)       |                 |       (React Native 0.81 + Expo 54)           |
|                                     |                 |                                               |
|  - In-Memory Cache (Map)            |                 |  - React Navigation (Stack + Bottom Tabs)     |
|  - Dexie.js (IndexedDB localDB)     |                 |  - useFirestoreData Reactive Hook             |
|  - Custom SyncEngine (Push/Pull)    |                 |  - Native Kotlin Android Bridge:              |
|  - Web Audio & Ambient Audio        |                 |      * AlarmManager.setExactAndAllowWhileIdle |
|  - Web Speech API (Multilingual)    |                 |      * Foreground Service & WakeLocks         |
|  - Glassmorphic UI & Theme Engine   |                 |      * BootReceiver Auto-Rescheduling         |
|  - Service Worker (Offline PWA)     |                 |  - Hardware Sensors (Pedometer, Accelerometer)|
+-------------------------------------+                 +-----------------------------------------------+
```

### 2. Data Flow & Synchronization Topology
Planrova implements an **Offline-First, Optimistic-Update Architecture**:

1. **Write Flow (Web):**
   - User mutates data in a module (e.g., completes a task in `tasks.js`).
   - `storage.setStorageItem(key, value)` immediately updates an in-memory `_cache` (`Map`), guaranteeing $O(1)$ zero-latency UI re-rendering.
   - A sync envelope record is generated via `createSyncRecord(key, value)` with `{ id, value, updated_at: Date.now(), sync_status: 'pending', deleted: false }`.
   - The record is persisted asynchronously into IndexedDB (`PlanoryLocalDB.kv_store`) via Dexie.
   - `syncPendingChanges()` triggers in the background: queries `localDB.kv_store.where('sync_status').equals('pending')`. If the user is authenticated and `navigator.onLine` is true, payloads are upserted into Firestore at `/users/{uid}/appData/{key}` with `merge: true`.
   - Once Firestore acknowledges write completion, the local IndexedDB record's `sync_status` transitions to `'synced'`.

2. **Read & Cloud Pull Flow (Web):**
   - On application startup, `preloadCache()` loads all non-deleted records from IndexedDB into memory before modules mount.
   - `startRealtimeSync()` binds an `onSnapshot` listener to `/users/{uid}/appData`.
   - When a remote document snapshot arrives:
     - If the local record has `sync_status === 'pending'`, a concurrent edit conflict is detected. The engine executes `resolveSyncConflict(key, localRecord, cloudData)`:
       - **Arrays (`tasks`, `user_habits`, `expenses`, `notes`):** Union merge using unique keys (`id` or `date`). If either version marked `completed: true`, completion is preserved.
       - **Gamification:** Computes $\max(\text{local.level}, \text{cloud.level})$ and $\max(\text{local.xp}, \text{cloud.xp})$.
       - **Hydration:** Computes $\max(\text{local.water}, \text{cloud.water})$ and $\max(\text{local.target}, \text{cloud.target})$.
       - **Coins & Seeds:** Computes $\max(\text{coins})$ and performs Set union on unlocked seed IDs.
       - The reconciled record is stored locally and queued for cloud update.
     - If the cloud document has `updated_at > localRecord.updated_at` without a local pending conflict, the cloud version overwrites the local store and dispatches `planrova:cloud_update`.

3. **Mobile Cloud Sync:**
   - The custom hook `useFirestoreData(storageKey, defaultValue)` establishes an active `onSnapshot` subscription to the identical Firestore path `/users/{uid}/appData/{storageKey}`.
   - When modified locally on mobile, `saveData(newData)` optimistically sets React state and writes `{ id: storageKey, value: JSON.stringify(newData), updated_at: Date.now(), deleted: false }` to Firestore.

---

## D. Feature Documentation

### 1. Task Management & Weekly Timetable Grid
- **Source Files:** `src/modules/tasks.js`, `src/utils/date.js`
- **Internal Mechanisms:**
  - Standardizes the weekly timetable into asymmetric column distribution: Left Column handles Monday, Wednesday, Friday; Right Column handles Tuesday, Thursday, Saturday, Sunday.
  - Friday's container is stylistically weighted (`friday-tall`) to achieve vertical visual parity against Saturday and Sunday combined.
  - Implements native HTML5 Drag-and-Drop (`draggable="true"`, `dragstart`, `dragover`, `drop`) allowing seamless rescheduling across dates.
  - Links tasks directly to daily subject notes via `task.linkedTasks`.
  - Integrates task completion with gamification: awards $+20\text{ XP}$ per task, emits an undo toast notification (with 5-second undo timer), and automatically updates the monthly calendar.

### 2. Social Study Pool & Live Friends System
- **Source Files:** `src/modules/studypool.js`
- **Internal Mechanisms:**
  - Maintains real-time user presence in Firestore collection `/studypool_users/{uid}` with heartbeat interval (every 10s) syncing current study status, active Pomodoro timer percentage, and selected tree seed.
  - Stale user presence purge: During snapshot evaluation, any buddy record with `Date.now() - timestamp > 60000` is automatically pruned via `deleteDoc`.
  - Global vs. Private Room architecture:
    - **Global Room:** Renders all active online peers alongside ambient simulation bots (**Aarav, Riya, Kabir**) who execute randomized focus rounds, progress increments, and motivational chat messages every 15 seconds. Verified friends are prioritized at the top of the grid with glowing blue visual auras.
    - **Private Room:** Excludes all simulation bots and unverified public users. Displays strictly verified friends retrieved from `studypool_friends`.
  - Live Friend Verification: Queries the public directory collection `/users_directory` matching `where('email', '==', inputEmail)`. Successfully verified emails are persisted in local friend arrays.
  - Real-time study room chat: Subscribes to `/studypool_messages` ordered by timestamp descending (limit 50).

### 3. Advanced Pomodoro Timer & Forest Garden
- **Source Files:** `src/modules/pomodoro.js`
- **Internal Mechanisms:**
  - 25-minute focus session / 5-minute break cycle backed by interval timers.
  - Immersive Focus Mode: Expands full-screen, hiding navigation sidebars, and unveils an autosaving slide-over scratchpad (`pomo_immersive_notes`).
  - Audio Engine: Plays ambient loop audio tracks (`rain.mp3`, `lofi.mp3`, `sitar.mp3`, `tapri.mp3`) using HTML5 `<audio>` with smooth volume fading.
  - Gamified Tree Growth: Renders dynamic SVG trees transitioning across 6 growth phases based on elapsed session percentage: `Planted` ($<15\%$) $\rightarrow$ `Sprouting` ($<35\%$) $\rightarrow$ `Growing` ($<55\%$) $\rightarrow$ `Healthy` ($<75\%$) $\rightarrow$ `Maturing` ($<95\%$) $\rightarrow$ `Blossoming` ($100\%$).
  - Forfeiture Penalty: Resetting an active session before completion pushes a withered tree (`'dead'`) into the persistent `pomo_forest` array, simulating the Forest app's discipline mechanic.
  - Successful round completion yields $+25\text{ XP}$, $+10\text{ Focus Coins}$, logs daily activity, and fires desktop notifications.

### 4. Hydration Wellness Tracker
- **Source Files:** `src/modules/hydration.js`, `mobile/src/screens/HydrationScreen.js`
- **Internal Mechanisms:**
  - Tracks intake volume against customizable daily targets (default $2000\text{ ml}$).
  - SVG Circular Progress Ring calculated via standard stroke dashoffset calculations ($\text{offset} = 263.89 - (\text{pct} / 100) \times 263.89$).
  - Beverage Type Classification: Water, Chai, Coffee, Juice. Includes a "Diuretic Coffee" toggle that modifies net fluid calculation.
  - Contextual Task Hydration: Scans planner tasks for prolonged study blocks and triggers proactive hydration reminders.

### 5. Student Budget & Expense Manager
- **Source Files:** `src/modules/budget.js`, `mobile/src/screens/BudgetScreen.js`
- **Internal Mechanisms:**
  - Logs daily student expenditures against a monthly limit (default ₹10,000) and trackable savings target.
  - Automated Category Matching: Parses transaction notes against lexical patterns (e.g., "chai", "samosa", "canteen" $\rightarrow$ **Food**; "metro", "auto", "bus" $\rightarrow$ **Transport**; "xerox", "print", "book" $\rightarrow$ **Books**).
  - Dynamic End-of-Month Insights: Evaluates the dominant expense category and emits targeted campus frugality advice.
  - Visual Progress Bar with visual warning state when monthly expenditure reaches $\ge 80\%$.

### 6. Subject Notes & Multimodal OCR Digitize Pipeline
- **Source Files:** `src/modules/notes.js`, `mobile/src/screens/NotesScreen.js`, `server/proxy.js`
- **Internal Mechanisms:**
  - Web client provides a contenteditable rich text drawer with subject tags, word counts, reading time estimation, draft version history, and day pinning.
  - Mobile client features camera and image picker integration to photograph physical whiteboard notes, textbook pages, and handwritten exercises.
  - Captured images are converted to Base64 JPEG payloads and dispatched via `callOcrProxy()` to the Planrova proxy server (`/api/ocr`).
  - Server proxies request to Groq `llama-3.2-11b-vision-preview`, prompting it to extract structured Markdown study notes.
  - Resulting Markdown is injected directly into the user's active note draft and synchronized to Firestore.

### 7. Android Native Alarm Missions
- **Source Files:** `mobile/android/app/src/main/java/com/planrova/app/*`, `mobile/src/screens/AlarmScreen.js`, `AlarmRingingScreen.js`
- **Internal Mechanisms:**
  - Bypasses unreliable JavaScript background timers by delegating to Android native `AlarmManager.setExactAndAllowWhileIdle()`.
  - Handles `Intent.ACTION_BOOT_COMPLETED` via `BootReceiver.kt` to re-register all enabled alarms whenever the user reboots their phone.
  - Launches full-screen `AlarmActivity.kt` using `FLAG_SHOW_WHEN_LOCKED`, `FLAG_TURN_SCREEN_ON`, and `FLAG_KEEP_SCREEN_ON` alongside audio playback in a foreground service.
  - Dismissal requires completing non-trivial cognitive or physical missions:
    1. **Math Challenge:** Generates randomized multi-operator arithmetic problems.
    2. **Shake Challenge:** Samples `Accelerometer` data to verify physical phone shaking exceeding threshold accelerations.
    3. **Typing Challenge:** Requires exact transcription of randomized motivational phrases.
    4. **Step Counter (Walking Challenge):** Integrates `Pedometer` to require physical ambulation out of bed before silencing audio.

### 8. Voice & Natural Language Parser (NLP)
- **Source Files:** `src/utils/nlp.js`, `src/modules/voice.js`
- **Internal Mechanisms:**
  - Multilingual voice capture using browser `SpeechRecognition` supporting English and Hindi phrasing.
  - Pipeline splits compound sentences on conjunctions ("and", "then", "also", "plus").
  - Semantic command routing:
    - `"log 500ml water"` $\rightarrow$ Action: Hydration $+500\text{ ml}$.
    - `"spent 50 on chai"` $\rightarrow$ Action: Expense ₹50 under Food.
    - `"start 25 min pomodoro"` $\rightarrow$ Action: Timer launch.
    - `"kal physics assignment at 4pm high priority"` $\rightarrow$ Action: Task scheduled for tomorrow ($t+1$), category study, priority high.

---

## E. Database Knowledge

### 1. IndexedDB Schema (Dexie.js — Web Client)
- **Database Name:** `PlanoryLocalDB`
- **Version:** `1`
- **Table Name:** `kv_store`
- **Primary Key:** `id` (String key, e.g., `'tasks'`, `'gamification'`)
- **Indexes:** `sync_status`, `updated_at`
- **Record Structure:**
  ```typescript
  interface SyncRecord {
    id: string;              // Storage key identifier
    value: string;           // Serialized JSON payload
    updated_at: number;      // Epoch millisecond timestamp
    sync_status: 'pending' | 'synced'; // Local sync state
    deleted: boolean;        // Soft delete flag for replication
  }
  ```

### 2. Cloud Firestore Document Hierarchy
```
/users/{uid}
  /appData/{storageKey}
    ├── id: string (matches storageKey)
    ├── value: string (JSON serialized application state)
    ├── updated_at: number (Epoch timestamp)
    └── deleted: boolean (Soft delete marker)

/users_directory/{uid}
  ├── email: string
  ├── uid: string
  └── lastSeen: number

/studypool_users/{uid}
  ├── name: string
  ├── email: string
  ├── seed: string ('oak' | 'sakura' | 'maple' | 'pine' | 'palm')
  ├── status: string ('Studying' | 'Focusing ⏱️' | 'Taking Break')
  ├── progress: number (0 - 100)
  └── timestamp: number

/studypool_messages/{messageId}
  ├── text: string
  ├── userId: string
  ├── userName: string
  ├── userEmail: string
  └── timestamp: serverTimestamp()
```

### 3. Key Storage Identifiers (`storageKey`)
- `'tasks'`: Array of planner task objects.
- `'user_habits'`: Array of habit definitions and current streaks.
- `'habit_logs'`: Map of habit IDs to arrays of completed date strings (`YYYY-MM-DD`).
- `'expenses'`: Array of financial expense logs.
- `'budget_settings'`: Object configuring monthly limits and savings targets.
- `'hydration_logs'`: Array of drink intake entries.
- `'hydration_settings'`: Object configuring daily water goals and reminder intervals.
- `'notes'`: Array of digital subject notes with markdown content and attachments.
- `'notes_drafts'`: Historical snapshots of note revisions.
- `'gamification'`: Object storing current level, XP, and daily task counts.
- `'focus_coins'`: Numeric integer balance of earned coins.
- `'unlocked_seeds'`: Array of unlocked forest tree seed IDs.
- `'pomo_forest'`: Array of completed tree IDs or `'dead'` markers.
- `'studypool_friends'`: Array of verified friend email strings.

---

## F. API Knowledge

### 1. Planrova OCR Proxy Server
- **Protocol:** HTTP/1.1 over TLS (HTTPS in production)
- **Base URL:** Defined via `CLOUD_PROXY_URL` in `mobile/src/config/api.js` (e.g., `https://planory-ocr-proxy.onrender.com` or `http://localhost:3001` locally).
- **CORS Support:** `*` origin enabled with support for `GET, POST, OPTIONS`.

#### Endpoint 1: Health Check
- **Path:** `GET /api/health`
- **Auth:** None
- **Response Format (`application/json`):**
  ```json
  {
    "status": "ok",
    "keyLoaded": true,
    "timestamp": 1730300000000
  }
  ```

#### Endpoint 2: Multimodal OCR Proxy
- **Path:** `POST /api/ocr`
- **Headers:** `Content-Type: application/json`
- **Request Body Format:**
  ```json
  {
    "type": "whiteboard" | "calendar" | "scan",
    "payload": {
      "model": "llama-3.2-11b-vision-preview",
      "messages": [
        {
          "role": "user",
          "content": [
            { "type": "text", "text": "Extraction prompt..." },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
          ]
        }
      ],
      "max_tokens": 2048,
      "temperature": 0.1
    }
  }
  ```
- **Response Codes:**
  - `200 OK`: Upstream Groq chat completion response object returned verbatim.
  - `400 Bad Request`: Missing payload in request body.
  - `503 Service Unavailable`: Server environment lacks `GROQ_API_KEY`.
  - `502 Bad Gateway`: Upstream Groq API network failure or request timeout ($>90\text{s}$).

---

## G. Important Files and Directories

| Path | Architectural Purpose | Critical Considerations Before Editing |
|---|---|---|
| `src/main.js` | Web app bootstrap, auth flow coordinator, global UI router | Handles theme injection and loads Dexie cache before any module initializes |
| `src/db/syncEngine.js` | Bidirectional Firestore sync engine and conflict resolver | Modifying conflict logic affects concurrent multi-device state convergence |
| `src/db/database.js` | Dexie.js database definition and sync record factory | Schema version increments require explicit Dexie migration blocks |
| `src/utils/storage.js` | Synchronous in-memory caching layer over Dexie | Never bypass this module with raw `localStorage` calls; breaks local-first reactivity |
| `src/utils/nlp.js` | Natural language task parser with Hindi/English support | Regex ordering matters; test against compound inputs before altering parser steps |
| `src/modules/studypool.js` | Live study lounge, Firestore presence heartbeat, bot loop | Ensure `leaveFirebaseRoom()` is called on unmount/beforeunload to prevent ghost presences |
| `mobile/App.js` | React Native entry point, auth gate, multi-step onboarding | Large component containing core student onboarding form logic and state |
| `mobile/src/navigation/TabNavigator.js` | Bottom tabs with custom `PanResponder` horizontal swipe | Gesture recognition threshold is calibrated; test thoroughly on Android emulators |
| `mobile/src/screens/AlarmScreen.js` | Alarm dashboard, mission configuration, permission checks | Coordinates with native Kotlin modules; ensure method signatures match |
| `mobile/src/config/api.js` | Failover strategy for cloud vs local proxy URLs | Configures automatic fallback order: Cloud URL $\rightarrow$ Android Emulator loopback $\rightarrow$ Localhost |
| `mobile/android/.../AlarmScheduler.kt`| Android native exact alarm scheduling engine | Handles permission checks for `SCHEDULE_EXACT_ALARM` on Android 12+ (API 31+) |
| `server/proxy.js` | Production zero-dependency Node.js OCR proxy | Must remain zero-dependency to ensure instant deploys on minimal container runtimes |

---

## H. Core Workflows

### 1. Student Onboarding Workflow
1. User creates an account via `src/modules/auth.js` or `mobile/App.js`.
2. Auth listener verifies credential creation and writes user identity to `users_directory`.
3. Mobile app initiates a 5-step onboarding wizard:
   - Step 1: Input name, college, branch, and semester.
   - Step 2: Select core daily habits from preset icons.
   - Step 3: Define target daily study hours, hydration target, and pocket money limit.
   - Step 4: Populate weekly academic timetable (Mon–Sat class schedule).
   - Step 5: Optional timetable photo scan using Groq Vision OCR to auto-populate class timings.
4. Final onboarding data writes to Firestore, unblocking the main workspace view.

### 2. Daily Focus Session Workflow
1. User selects a task from the weekly timetable and clicks "Focus" or launches Pomodoro directly.
2. Pomodoro module sets work mode ($1500\text{ seconds}$), selects ambient audio track, and enters optional full-screen immersive mode.
3. Every 10 seconds, user presence in the Study Pool updates to `"Focusing ⏱️"` with current session completion percentage.
4. The on-screen tree SVG advances through growth phases.
5. If completed: audio chime plays, $+25\text{ XP}$ and $+10\text{ Focus Coins}$ are credited, healthy tree is planted in Forest Garden, and timer switches to 5-minute break.
6. If cancelled prematurely: timer resets and a withered dead tree is recorded in the user's permanent forest history.

### 3. Alarm Ringing & Mission Dismissal Workflow
1. Android native `AlarmScheduler` fires `AlarmReceiver` at exact scheduled epoch millisecond.
2. `AlarmReceiver` launches `AlarmService` as a foreground service with wake lock and audio playback.
3. Full-screen `AlarmActivity` launches over the Android lock screen, rendering `AlarmRingingScreen`.
4. User is presented with their chosen challenge:
   - *Math:* Solves randomized arithmetic questions.
   - *Shake:* Shakes phone repeatedly until accelerometer threshold count is fulfilled.
   - *Typing:* Types out exact motivational phrase without errors.
   - *Walking:* Steps recorded by Pedometer reach target threshold.
5. Once challenge succeeds, `AlarmService` stops playback, tears down foreground notification, awards $+50\text{ XP}$, and dismisses the activity.

---

## I. Development & Build Instructions

### Prerequisites
- **Node.js:** v18.x or v20.x
- **Package Manager:** npm (v9+)
- **Mobile Development:** Expo CLI (`npx expo`), Android Studio with Android SDK 34 for native builds.

### 1. Web Workspace Development
```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev
# Server accessible at http://localhost:5173

# Production build
npm run build
# Outputs optimized static bundle to dist/
```

### 2. OCR Proxy Server Development
```bash
# Navigate to server directory
cd server

# Create local environment file
cp .env.example .env
# Edit .env and supply your GROQ_API_KEY

# Start proxy server (zero external npm packages required)
node proxy.js
# Proxy runs on http://localhost:3001
# Test health: curl http://localhost:3001/api/health
```

### 3. Mobile Companion App Development
```bash
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Start Expo development bundler
npx expo start

# Run on connected Android device / emulator with native code
npx expo run:android
```

---

## J. Engineering Decisions & Rationale

1. **Why Raw Vanilla ES6 on Web Instead of React/Next.js?**
   - *Rationale:* Eliminates framework virtual DOM reconciliation overhead, resulting in an exceptionally lightweight bundle size, sub-second cold starts, and direct DOM control over high-frequency animations (e.g., fluid canvas hydration waves, particle confetti, and time-of-day gradient transitions).
2. **Why Dexie.js IndexedDB Over Plain LocalStorage?**
   - *Rationale:* `localStorage` is synchronous, blocking the browser main thread during large reads/writes, and is strictly capped at $5\text{MB}$. Dexie provides asynchronous, indexed, non-blocking storage capable of storing hundreds of megabytes of offline notes, draft histories, and attachments.
3. **Why Custom Node.js Proxy Over Client-Side Groq Calls?**
   - *Rationale:* Direct LLM API calls from mobile apps require bundling private API secret keys inside the client binary, exposing them to decompilation and scraping via reverse-engineering tools. The proxy guarantees the `GROQ_API_KEY` remains strictly isolated on the backend.
4. **Why Android Native Kotlin AlarmManager Over Standard Expo Notifications?**
   - *Rationale:* Standard Expo scheduled notifications are easily deferred or silenced by Android OS battery optimization (Doze Mode). A reliable student wake-up alarm requires `AlarmManager.setExactAndAllowWhileIdle`, full-screen intents over lock screens, and wake locks.

---

## K. Current Limitations & Technical Debt

1. **Simulated AI Summarization on Web:**
   - In `src/modules/notes.js`, the "AI Summarize" and "AI Flashcards" buttons currently output simulated mock data via `setTimeout` rather than piping through a live LLM endpoint.
2. **Automated Test Coverage Absence:**
   - The repository currently contains zero unit, integration, or end-to-end tests (`0` test files found). All verification is manual.
3. **Multi-Tab IndexedDB Persistence Constraint:**
   - In `src/db/firebase.js`, Firestore multi-tab persistence occasionally logs `failed-precondition` warnings if multiple browser tabs access the app concurrently.
4. **iOS Home-Screen Widget Native Compilation:**
   - `mobile/WIDGET_GUIDE.md` details the architectural blueprint for iOS WidgetKit integration, but native Swift widget code is not yet bundled in the active build target.

---

## L. Future Roadmap

### Confirmed Architectural Roadmap
- [ ] Connect the web notes editor's AI summary button to the Groq server proxy endpoint to provide live summarization.
- [ ] Implement an automated test suite using Vitest (Web unit tests) and Jest / React Native Testing Library (Mobile).
- [ ] Package iOS WidgetKit and Android AppWidgetProvider native targets into EAS Prebuild configuration.

### Recommended Architectural Improvements
- [ ] Implement end-to-end encryption (E2EE) for private student notes stored in Firestore.
- [ ] Add WebRTC peer-to-peer audio mesh to the Study Pool for optional real-time voice study rooms.
- [ ] Introduce a Dockerfile for containerized deployment of the OCR proxy server.

---

## M. AI Agent Operational Instructions

Future AI agents modifying this codebase must adhere strictly to the following 12 rules:

1. **Consult This Knowledge Base First:** Always read `PROJECT_KNOWLEDGE_BASE.md` before planning or executing modifications.
2. **Inspect Existing Files Before Modifying:** Do not guess function signatures or module exports. Read the exact implementation in `src/` or `mobile/src/`.
3. **Preserve the Local-First Storage Pattern:** Never use raw `localStorage.setItem()` directly. Always read and write through `src/utils/storage.js` so that in-memory cache, Dexie IndexedDB, and the Firebase Sync Engine remain synchronized.
4. **Do Not Modify Server Proxy Dependency Footprint:** `server/proxy.js` is deliberately engineered with zero npm dependencies using Node.js built-in `http` and `https` modules. Do not introduce heavy dependencies like `express` into `proxy.js`.
5. **Preserve Native Android Module Contracts:** When modifying `mobile/src/screens/AlarmScreen.js`, never change the bridge call shapes expected by `mobile/android/app/src/main/java/com/planrova/app/AlarmModule.kt`.
6. **Protect All Credentials:** Never hardcode API keys, Firebase service accounts, or Groq secrets in client-side code.
7. **Maintain Cross-Platform Data Structure Parity:** If an entity schema is updated (e.g., adding a field to `tasks`), ensure changes are applied identically in Web (`src/modules/tasks.js`) and Mobile (`mobile/src/screens/`).
8. **Do Not Overwrite Working Implementations:** Avoid refactoring stable, working modules into different libraries or frameworks without explicit user instruction.
9. **Respect CSS Custom Property Design Tokens:** Use existing tokens defined in `src/utils/tokens.js` and `src/style.css` (`--accent`, `--bg-app`, `--radius-lg`, etc.).
10. **Validate Network Failure Scenarios:** Always verify that newly added features degrade gracefully when `navigator.onLine` is false or when the OCR proxy server is unreachable.
11. **Update Documentation Upon Modification:** If an endpoint, storage key, or feature contract is updated, immediately update `PROJECT_KNOWLEDGE_BASE.md` and `README.md`.
12. **Evidence-Based Reporting:** Never claim a feature or fix is verified without checking code execution, building the code, or confirming syntax integrity.

