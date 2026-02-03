/* 
  script.js

  This file replaces the inline <script> block from Original_index.html.

  Main differences from the original:
  - Stopwatch and lap recording are now handled in JavaScript instead of a textarea.
  - Lap times are stored as numbers in an array (lapTimes) instead of raw text.
  - The calculator uses lapTimes directly, but the math is the same.
  - Input validation for positions and directions is preserved from the original.
*/

/* =========================
   Stopwatch state and helpers
   ========================= */

// Stopwatch related state
let elapsedMs = 0;              // total elapsed time in milliseconds
let stopwatchRunning = false;   // simple boolean, replaces checking timerInterval
let stopwatchStartTime = null;  // performance.now() at last start
let animationFrameId = null;    // id from requestAnimationFrame

// Lap data is now stored as numbers in seconds.
// In Original_index.html the user typed lap times into a textarea and they were parsed from text.
let lapTimes = [];

// DOM elements for the stopwatch and lap table
const toggleButton = document.getElementById("toggleButton");
const lapButton = document.getElementById("lapButton");
const resetButton = document.getElementById("resetButton");
const timerDisplayEl = document.getElementById("timerDisplay");
const lapTableBody = document.getElementById("lapTableBody");

// Manual mode (switch-style toggle)
const manualModeToggle = document.getElementById("manualModeToggle");
const stopwatchControlsEl = document.getElementById("stopwatchControls");
const manualHintEl = document.getElementById("manualHint");
const lapTimeHeaderEl = document.getElementById("lapTimeHeader");
const stopwatchTitleEl = document.getElementById("stopwatchTitle");

let isManualMode = false;

// Shared error and results elements. Some of these existed in Original_index.html already.
const lapErrorDiv = document.getElementById("lapError");
const minuteErrorDiv = document.getElementById("minuteError");
const resultsBox = document.getElementById("resultsBox");

/**
 * Format a number of seconds as mm:ss.s
 * This is the same display style used in your earlier stopwatch mockup.
 */
function formatTimeSeconds(seconds) {
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);

  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `${mm}:${ss}.${tenths}`;
}


/**
 * Format seconds as mm:ss (no tenths). Used for Manual mode table inputs.
 */
function formatTimeMMSS(seconds) {
  const whole = Math.max(0, Math.round(seconds)); // nearest second
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Parse mm:ss into total seconds (integer). Returns null on invalid input.
 */
function parseTimeMMSS(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d+):([0-5]\d)$/);
  if (!m) return null;
  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  return minutes * 60 + seconds;
}

/**
 * Parse flexible time input for manual mode.
 * Accepts:
 *   ":37"  -> 0:37
 *   "37"   -> 0:37
 *   "1:4"  -> 1:04
 *   "1:40" -> 1:40
 *   "2:75" -> 3:15 (auto-carry)
 * Returns integer seconds or null if unparseable.
 */
function parseFlexibleTimeToSeconds(str) {
  const raw = String(str || "").trim();
  if (!raw) return null;

  // :ss
  let m = raw.match(/^:(\d{1,3})$/);
  if (m) {
    const s = parseInt(m[1], 10);
    if (Number.isNaN(s) || s < 0) return null;
    return s;
  }

  // mm:ss (allow 1+ digits for mm, allow 1+ digits for ss and carry)
  m = raw.match(/^(\d+):(\d+)$/);
  if (m) {
    const minutes = parseInt(m[1], 10);
    const seconds = parseInt(m[2], 10);
    if (Number.isNaN(minutes) || Number.isNaN(seconds) || minutes < 0 || seconds < 0) return null;
    return minutes * 60 + seconds;
  }

  // ss only
  m = raw.match(/^(\d{1,6})$/);
  if (m) {
    const s = parseInt(m[1], 10);
    if (Number.isNaN(s) || s < 0) return null;
    return s;
  }

  return null;
}

/** Normalize flexible input into mm:ss for display. Returns "" if invalid/blank. */
function normalizeManualTimeInputToMMSS(str) {
  const raw = String(str || "").trim();
  if (!raw) return "";
  const totalSeconds = parseFlexibleTimeToSeconds(raw);
  if (totalSeconds === null) return "";
  return formatTimeMMSS(totalSeconds);
}

function setLapHeaderForMode() {
  if (!lapTimeHeaderEl) return;
  lapTimeHeaderEl.textContent = isManualMode ? "Time (mm:ss)" : "Time (mm:ss.s)";
}

function setStopwatchTitleForMode() {
  if (!stopwatchTitleEl) return;
  stopwatchTitleEl.textContent = isManualMode ? "Lap recorder" : "Stopwatch and lap recorder";
}

/**
 * Update the on-screen timer display from the current elapsedMs value.
 */
function updateTimerDisplay() {
  const sec = elapsedMs / 1000;
  timerDisplayEl.textContent = formatTimeSeconds(sec);
}

/**
 * Internal animation loop for the stopwatch.
 * In your first refactor this used setInterval with 100 ms.
 * requestAnimationFrame gives smoother and more accurate updates.
 */
function tick(timestamp) {
  if (!stopwatchRunning) {
    return;
  }

  // elapsedMs is measured relative to the point in time when the stopwatch was last started
  const now = performance.now();
  const diff = now - stopwatchStartTime;
  const newElapsed = elapsedMs + diff;

  // Clamp at 6 minutes (360000 ms) so that rounding errors do not push you over.
  const maxMs = 6 * 60 * 1000;
  if (newElapsed >= maxMs) {
    elapsedMs = maxMs;
    stopwatchRunning = false;
    updateTimerDisplay();

    // Make sure we cancel the animation frame and update the UI to a finished state.
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    toggleButton.textContent = "Finished";
    toggleButton.disabled = true;
    lapButton.disabled = true;
    return;
  }

  elapsedMs = newElapsed;
  stopwatchStartTime = now;
  updateTimerDisplay();

  animationFrameId = requestAnimationFrame(tick);
}

/**
 * Start the stopwatch.
 * This is called when the toggleButton goes from "Start" to "Stop".
 */
function startTimer() {
  if (stopwatchRunning) {
    return;
  }

  stopwatchRunning = true;
  stopwatchStartTime = performance.now();
  toggleButton.textContent = "Stop";
  lapButton.disabled = false;
  resetButton.disabled = false;

  // Kick off the animation loop
  animationFrameId = requestAnimationFrame(tick);
}

/**
 * Stop the stopwatch without resetting the elapsed time.
 * This is called when the toggleButton goes from "Stop" to "Start".
 */
function stopTimer() {
  if (!stopwatchRunning) {
    return;
  }

  stopwatchRunning = false;

  // Cancel any scheduled animation frame
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Update elapsedMs one last time using the current time
  const now = performance.now();
  elapsedMs += now - stopwatchStartTime;
  stopwatchStartTime = now;

  // Clamp at 6 minutes again in case we hit stop very close to 6 minutes
  const maxMs = 6 * 60 * 1000;
  if (elapsedMs > maxMs) {
    elapsedMs = maxMs;
  }

  updateTimerDisplay();

  toggleButton.textContent = "Start";
  lapButton.disabled = true;
}

/**
 * Reset the stopwatch and lap data to the initial state.
 * This does not clear the sticky-note positions or the final results.
 */
function resetTimer() {
  // Stop if running
  if (stopwatchRunning) {
    stopwatchRunning = false;
  }
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  elapsedMs = 0;
  stopwatchStartTime = null;
  updateTimerDisplay();

  // Reset UI state for buttons
  toggleButton.textContent = "Start";
  toggleButton.disabled = false;
  lapButton.disabled = true;
  resetButton.disabled = true;

  // Clear lap data and table
  lapTimes = [];
  renderLapTable();
  // Clear manual mode state/inputs
  if (manualModeToggle) {
    manualModeToggle.checked = false;
  }
  isManualMode = false;
  // Sync the UI back to stopwatch mode
  setManualMode(false);
  // Clear stopwatch-related errors and keep the minute error/result untouched
  if (showErrors) { lapErrorDiv.textContent = ""; }
}

/**
 * Toggle between running and stopped states.
 * This replaces separate Start and Stop handlers.
 */
function toggleTimer() {
  // Clear any existing lap error on state change just to keep things clean
  if (showErrors) { lapErrorDiv.textContent = ""; }

  if (!stopwatchRunning) {
    startTimer();
  } else {
    stopTimer();
  }
}

/**
 * Record a new lap time.
 * Lap times are stored as cumulative seconds, so they match how the original calculator
 * used cumulative lap times typed into the textarea.
 */
function recordLap() {
  if (isManualMode) {
    return;
  }
  if (!stopwatchRunning) {
    return;
  }

  const now = performance.now();
  const diff = now - stopwatchStartTime;
  const currentMs = elapsedMs + diff;
  const currentSec = currentMs / 1000;

  // Enforce strictly increasing lap times.
  // If the user accidentally taps Lap twice quickly at almost the same time,
  // we do not want to record a duplicate or smaller lap time.
  if (lapTimes.length > 0 && currentSec <= lapTimes[lapTimes.length - 1]) {
    lapErrorDiv.textContent =
      "Lap ignored: lap time must be greater than previous lap time.";
    return;
  }

  lapTimes.push(currentSec);
  if (showErrors) { lapErrorDiv.textContent = ""; }

  renderLapTable();
}

/**
 * Render the lap times into the lap table on the left.
 */
function renderLapTable() {
  lapTableBody.innerHTML = "";

  setLapHeaderForMode();

  if (!isManualMode) {
    // Stopwatch display mode: render as plain text rows
    lapTimes.forEach((t, index) => {
      const tr = document.createElement("tr");
      const tdLap = document.createElement("td");
      const tdTime = document.createElement("td");

      tdLap.textContent = index + 1;
      tdTime.textContent = formatTimeSeconds(t);

      tr.appendChild(tdLap);
      tr.appendChild(tdTime);
      lapTableBody.appendChild(tr);
    });
    return;
  }

  // Manual mode: render input rows (one extra blank row at the end).
  // IMPORTANT UX: we do NOT auto-add rows while the user is actively typing,
  // because re-rendering/focusing can steal the cursor and makes phone entry painful.
  const values = lapTimes.map((t) => formatTimeMMSS(t));
  const rowCount = Math.max(1, values.length + 1);

  for (let i = 0; i < rowCount; i++) {
    appendManualRow(i, values[i] || "");
  }
}

/** Create/append a single manual row (0-based index) with consistent listeners. */
function appendManualRow(index, value) {
  const tr = document.createElement("tr");
  const tdLap = document.createElement("td");
  const tdTime = document.createElement("td");

  tdLap.textContent = index + 1;

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.placeholder = "mm:ss";
  input.className = "manual-time-input";
  input.value = value;
  input.dataset.index = String(index);

  // While typing: keep silent, and NEVER add rows.
  input.addEventListener("input", () => {
    lapErrorDiv.textContent = "";
    syncLapTimesFromManualTable(false);
  });

  // On blur: normalize and (if needed) add exactly one new blank row.
  input.addEventListener("blur", () => {
    const normalized = normalizeManualTimeInputToMMSS(input.value);
    if (normalized) input.value = normalized;

    const ok = syncLapTimesFromManualTable(false);
    if (!ok) return;

    // If the user just filled the last row, append a new blank row.
    // Do NOT change focus (prevents the "jump to next row" problem).
    const inputs = Array.from(lapTableBody.querySelectorAll("input.manual-time-input"));
    const isLast = inputs.length > 0 && inputs[inputs.length - 1] === input;
    if (isLast && input.value.trim()) {
      appendManualRow(inputs.length, "");
    }
  });

  tdTime.appendChild(input);
  tr.appendChild(tdLap);
  tr.appendChild(tdTime);
  lapTableBody.appendChild(tr);
}

/* =========================
   Manual mode helpers (table-based cumulative lap times)
   ========================= */

function syncLapTimesFromManualTable(showErrors = false) {
  if (!isManualMode) return true;

  const inputs = Array.from(lapTableBody.querySelectorAll("input.manual-time-input"));
  const secs = [];
  let seenBlank = false;

  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i].value.trim();

    if (!v) {
      // once blank, everything after should be blank (keeps a clean "add new row" UX)
      seenBlank = true;
      continue;
    }

    if (seenBlank) {
      if (showErrors) {
        lapErrorDiv.textContent = "Manual entry error: please fill laps in order without skipping rows.";
      }
      return false;
    }

    const t = parseFlexibleTimeToSeconds(v);
    if (t === null) {
      if (showErrors) { lapErrorDiv.textContent = `Manual entry error on lap ${i + 1}: "${v}". Examples: :37, 1:40, 2:15.`; }
      return false;
    }

    if (secs.length > 0 && t <= secs[secs.length - 1]) {
      if (showErrors) { lapErrorDiv.textContent = `Manual entry error on lap ${i + 1}: times must be strictly increasing.`; }
      return false;
    }

    secs.push(t);
  }

  if (showErrors) { lapErrorDiv.textContent = ""; }
  lapTimes = secs;

  return true;
}

function setManualMode(on) {
  isManualMode = !!on;

  // If switching on, stop the stopwatch so we don't mix modes
  if (isManualMode && stopwatchRunning) {
    stopTimer();
  }

  if (stopwatchControlsEl) {
    stopwatchControlsEl.classList.toggle("hidden", isManualMode);
  }
  if (manualHintEl) {
    manualHintEl.classList.toggle("hidden", !isManualMode);
  }

  // Keep safety: disable lap recording when manual mode is enabled
  lapButton.disabled = isManualMode || !stopwatchRunning;
  if (isManualMode) {
    toggleButton.disabled = true;
  } else {
    // Don\'t override a Finished state
    if (toggleButton.textContent !== "Finished") {
      toggleButton.disabled = false;
    }
  }

  setLapHeaderForMode();
  setStopwatchTitleForMode();
  renderLapTable();
}

/* =========================
   Per-minute distance calculation helpers
   ========================= */

// The track is 25 m out, 25 m back => one complete lap is 50 m.
const LAP_LENGTH_M = 50.0;

/**
 * Given a sorted array of lap times (in seconds) and a query time tSeconds,
 * return how many laps have been completed at or before that time.
 * This matches the behavior of the original text-based implementation.
 */
function getLapsCompletedByTime(sortedLapTimes, tSeconds) {
  let count = 0;
  for (let i = 0; i < sortedLapTimes.length; i++) {
    if (sortedLapTimes[i] <= tSeconds) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Convert the sticky-note position (0 to 25 m) and direction ("out" or "back")
 * into an offset along the current lap, measured from the starting line.
 *
 * - "out":  position is 0..25, so the offset is just posM
 * - "back": position is 0..25, but the lap distance is 25..50, so we transform
 *           it as (50 - posM) to get a 25..50 offset.
 */
function positionToOffsetWithinLap(posM, direction) {
  const dir = direction.toLowerCase();
  if (dir === "out") {
    return posM;
  } else if (dir === "back") {
    return LAP_LENGTH_M - posM;
  }
  throw new Error('direction must be "out" or "back"');
}

/**
 * padRight is used to build a monospaced text table in the results box.
 * This is essentially the same as in Original_index.html.
 */
function padRight(text, width) {
  let s = String(text);
  while (s.length < width) {
    s += " ";
  }
  return s;
}

/* =========================
   Calculator main function
   ========================= */

function calculate() {
  // Clear previous errors
  if (showErrors) { lapErrorDiv.textContent = ""; }
  minuteErrorDiv.textContent = "";

  if (isManualMode) {
    const ok = syncLapTimesFromManualTable(true);
    if (!ok) {
      resultsBox.textContent = "Error: fix manual lap times before calculating.";
      return;
    }
  }

  // Results are always written here
  const lines = [];

  // Sort a copy of lapTimes so even if something unusual happens,
  // the per minute logic behaves like the original text based version.
  const sortedLapTimes = [...lapTimes].sort((a, b) => a - b);

  // 1) Parse minute positions with validation as in Original_index.html
  const minuteInfo = [];

  for (let m = 1; m <= 6; m++) {
    const posInput = document.getElementById(`pos_${m}`);
    const dirButton = document.getElementById(`dir_${m}`);

    const rawPos = posInput.value.trim();
    const rawDir = ((dirButton && (dirButton.dataset.dir || dirButton.textContent)) || "").trim().toLowerCase();

    if (!rawPos) {
      const msg = `Please enter a position (0 to 25 m) for minute ${m}.`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: missing position for minute ${m}.`;
      return;
    }

    const pos = parseFloat(rawPos);
    if (Number.isNaN(pos) || pos < 0 || pos > 25) {
      const msg = `Position for minute ${m} must be a number between 0 and 25.`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: invalid position for minute ${m}.`;
      return;
    }

    if (rawDir !== "out" && rawDir !== "back") {
      const msg = `Direction for minute ${m} must be "out" or "back".`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: invalid direction for minute ${m}.`;
      return;
    }

    minuteInfo.push({
      minute: m,
      posM: pos,
      dir: rawDir
    });
  }

  // 2) Compute distance at each minute, enforcing non-decreasing total distance
  let prevTotalDistance = 0;
  const rows = [];

  for (let i = 0; i < minuteInfo.length; i++) {
    const info = minuteInfo[i];
    const minute = info.minute;
    const tSec = minute * 60; // time in seconds for this minute mark

    const lapsCompleted = getLapsCompletedByTime(sortedLapTimes, tSec);
    const distFullLaps = lapsCompleted * LAP_LENGTH_M;

    const offset = positionToOffsetWithinLap(info.posM, info.dir);
    let totalDistance = distFullLaps + offset;

    // Enforce non decreasing total distance - same idea as original.
    if (totalDistance < prevTotalDistance) {
      totalDistance = prevTotalDistance;
    }

    const distanceThisMinute = totalDistance - prevTotalDistance;
    const lapsThisMinute = distanceThisMinute / LAP_LENGTH_M;

    rows.push({
      minute,
      timeS: tSec,
      distanceThisMinuteM: distanceThisMinute,
      lapsThisMinute,
      totalDistanceM: totalDistance
    });

    prevTotalDistance = totalDistance;
  }

  // 3) Summaries
  const totalDistanceAll = rows.length
    ? rows[rows.length - 1].totalDistanceM
    : 0;
  const totalLapsAll = totalDistanceAll / LAP_LENGTH_M;

  // 4) Build formatted output similar to Original_index.html
  lines.push("Per-minute distances");
  lines.push("1 lap = 50 m (25 m out + 25 m back)");
  lines.push("");
  lines.push(
    padRight("Min", 4) +
      padRight("Time(s)", 9) +
      padRight("m this min", 13) +
      padRight("laps this min", 15) +
      padRight("total m", 10)
  );
  lines.push("----------------------------------------------");

  rows.forEach((row) => {
    lines.push(
      padRight(row.minute, 4) +
        padRight(row.timeS.toFixed(1), 9) +
        padRight(row.distanceThisMinuteM.toFixed(2), 13) +
        padRight(row.lapsThisMinute.toFixed(3), 15) +
        padRight(row.totalDistanceM.toFixed(2), 10)
    );
  });

  lines.push("");
  lines.push("Totals (0–6 minutes):");
  lines.push(`  Total distance: ${totalDistanceAll.toFixed(2)} m`);
  lines.push(`  Total laps:     ${totalLapsAll.toFixed(3)} laps`);

  resultsBox.textContent = lines.join("\n");
}

/**
 * Clear only the results and errors, not the stopwatch or sticky-note inputs.
 */
function clearResults() {
  resultsBox.textContent = "Per-minute results will appear here.";
  if (showErrors) { lapErrorDiv.textContent = ""; }
  minuteErrorDiv.textContent = "";
}

/**
 * Clear everything - stopwatch, laps, minute inputs, results.
 * This is the closest match to Clear All in Original_index.html,
 * but it now also resets the stopwatch and lap table.
 */
function clearAll() {
  // Reset stopwatch and lap data
  resetTimer();

  // Clear minute inputs and reset directions to "out"
  for (let m = 1; m <= 6; m++) {
    const posInput = document.getElementById(`pos_${m}`);
    const dirButton = document.getElementById(`dir_${m}`);

    if (posInput) {
      posInput.value = "";
    }
    if (dirButton) {
      dirButton.dataset.dir = "out";
      dirButton.textContent = "out";
      dirButton.classList.remove("back");
    }
  }

  // Errors and results are already reset by resetTimer
}

/* =========================
   Event bindings
   ========================= */

// Manual mode toggle (optional)
if (manualModeToggle) {
  manualModeToggle.addEventListener("change", () => {
    setManualMode(manualModeToggle.checked);
  });
}


// These are click events only, so the passive option is not critical, but it does not hurt here.
toggleButton.addEventListener("click", toggleTimer, { passive: true });
lapButton.addEventListener("click", recordLap, { passive: true });
resetButton.addEventListener("click", resetTimer, { passive: true });

document
  .getElementById("calcButton")
  .addEventListener("click", calculate, { passive: true });

document
  .getElementById("clearResultsButton")
  .addEventListener("click", clearResults, { passive: true });

document
  .getElementById("clearAllButton")
  .addEventListener("click", clearAll, { passive: true });

/**
 * Small helper so that when someone starts typing positions, we clear old errors.
 * This makes the form feel less sticky when fixing a mistake.
 */
for (let m = 1; m <= 6; m++) {
  const posInput = document.getElementById(`pos_${m}`);
  const dirButton = document.getElementById(`dir_${m}`);

  if (posInput) {
    posInput.addEventListener("input", () => {
      minuteErrorDiv.textContent = "";
    });
  }

  if (dirButton) {
    // Initialize default state on load
    dirButton.dataset.dir = dirButton.dataset.dir || "out";
    if (!dirButton.textContent.trim()) {
      dirButton.textContent = dirButton.dataset.dir;
    }
    if (dirButton.dataset.dir === "back") {
      dirButton.classList.add("back");
    } else {
      dirButton.classList.remove("back");
    }

    dirButton.addEventListener("click", () => {
      // Toggle direction and clear any minute error
      const current = dirButton.dataset.dir === "back" ? "back" : "out";
      const next = current === "out" ? "back" : "out";
      dirButton.dataset.dir = next;
      dirButton.textContent = next;
      if (next === "back") {
        dirButton.classList.add("back");
      } else {
        dirButton.classList.remove("back");
      }
      minuteErrorDiv.textContent = "";
    });
  }
}

// Initial UI state
updateTimerDisplay();
resetButton.disabled = true;
lapButton.disabled = true;
resultsBox.textContent = "Per-minute results will appear here.";

// Ensure mode UI is consistent on load
if (manualModeToggle && manualModeToggle.checked) {
  setManualMode(true);
} else {
  setManualMode(false);
}
