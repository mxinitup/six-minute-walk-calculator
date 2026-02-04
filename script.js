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

// Optional manual mode elements (added for clean toggle-based workflow)
const manualModeToggle = document.getElementById("manualModeToggle");
const manualEntryDiv = document.getElementById("manualEntry");
const manualLapTimesEl = document.getElementById("manualLapTimes");

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
  lapTableBody.innerHTML = "";

  // Clear manual mode state/inputs
  if (manualLapTimesEl) {
    manualLapTimesEl.value = "";
  }
  if (manualModeToggle) {
    manualModeToggle.checked = false;
  }
  isManualMode = false;
  if (manualEntryDiv) {
    manualEntryDiv.classList.add("hidden");
  }

  // Clear stopwatch-related errors and keep the minute error/result untouched
  lapErrorDiv.textContent = "";
}

/**
 * Toggle between running and stopped states.
 * This replaces separate Start and Stop handlers.
 */
function toggleTimer() {
  // Clear any existing lap error on state change just to keep things clean
  lapErrorDiv.textContent = "";

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
  lapErrorDiv.textContent = "";

  renderLapTable();
}

/**
 * Render the lap times into the lap table on the left.
 */
function renderLapTable() {
  lapTableBody.innerHTML = "";

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
}

/* =========================
   Manual lap-time entry helpers (optional)
   ========================= */

/**
 * Parse a time string in mm:ss or mm:ss.s into seconds.
 * Returns null if invalid.
 */
function parseTimeStringToSeconds(s) {
  const str = String(s).trim();
  const m = str.match(/^(\d+):([0-5]?\d)(?:\.(\d))?$/);
  if (!m) return null;

  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  const tenths = m[3] ? parseInt(m[3], 10) : 0;

  return minutes * 60 + seconds + tenths / 10;
}

/**
 * Sync lapTimes from the manual textarea.
 * Uses lapErrorDiv for validation feedback.
 */
function syncLapTimesFromManualEntry() {
  if (!manualLapTimesEl) {
    return true;
  }

  const raw = manualLapTimesEl.value || "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const sec = parseTimeStringToSeconds(lines[i]);
    if (sec === null) {
      lapErrorDiv.textContent = `Manual entry error on line ${i + 1}: "${lines[i]}". Use mm:ss.s`;
      return false;
    }
    if (i > 0 && sec <= parsed[i - 1]) {
      lapErrorDiv.textContent = `Manual entry error on line ${i + 1}: times must be strictly increasing.`;
      return false;
    }
    parsed.push(sec);
  }

  lapErrorDiv.textContent = "";
  lapTimes = parsed;
  renderLapTable();
  return true;
}

function refreshStopwatchButtonState() {
  // If the timer hit 6 minutes, the UI is intentionally locked in "Finished".
  const isFinished = String(toggleButton.textContent).trim().toLowerCase() === "finished";

  if (isManualMode) {
    toggleButton.disabled = true;
    lapButton.disabled = true;
    resetButton.disabled = false;
    return;
  }

  toggleButton.disabled = isFinished ? true : false;
  lapButton.disabled = !stopwatchRunning || isFinished;
  // Reset is allowed if the user has started/recorded anything.
  resetButton.disabled = isFinished ? false : (elapsedMs <= 0 && lapTimes.length === 0);
}

function setManualMode(on) {
  isManualMode = !!on;

  // Prevent mixing manual input with live timing.
  if (isManualMode && stopwatchRunning) {
    stopTimer();
  }

  if (manualEntryDiv) {
    manualEntryDiv.classList.toggle("hidden", !isManualMode);
  }

  // Sync immediately when enabling manual mode so the lap table reflects pasted values.
  if (isManualMode) {
    syncLapTimesFromManualEntry();
  }

  refreshStopwatchButtonState();
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
  lapErrorDiv.textContent = "";
  minuteErrorDiv.textContent = "";

  // If manual mode is enabled, re-parse the textarea so lapTimes stays authoritative.
  if (isManualMode) {
    const ok = syncLapTimesFromManualEntry();
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
  lapErrorDiv.textContent = "";
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

if (manualLapTimesEl) {
  manualLapTimesEl.addEventListener("input", () => {
    if (isManualMode) {
      syncLapTimesFromManualEntry();
    }
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
