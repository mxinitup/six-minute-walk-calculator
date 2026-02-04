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
let manualRowCount = 8; // how many rows to show in manual mode


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
  // Manual mode display: keep minutes/seconds as 2 digits.
  // If the user provided tenths, keep 1 decimal place; otherwise show mm:ss.
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe);
  const frac = safe - whole;

  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  const hasTenths = frac >= 0.05; // treat ~0.1s as tenths
  if (!hasTenths) return `${mm}:${ss}`;

  const tenths = Math.floor(frac * 10 + 1e-9);
  return `${mm}:${ss}.${tenths}`;
}


function parseTimeFlexibleToSeconds(str) {
  const raw = String(str || "").trim();
  if (!raw) return null;

  // Accept formats like:
  //  37        -> 0:37
  //  37.5      -> 0:37.5
  //  1:4       -> 1:04
  //  1:15      -> 1:15
  //  1:15.3    -> 1:15.3
  //  2:75      -> 3:15 (carry seconds)
  //  2:75.6    -> 3:15.6
  const m = raw.match(/^\s*(?:(\d+)\s*:\s*)?(\d+)(?:\.(\d))?\s*$/);
  if (!m) return null;

  let minutes = m[1] ? parseInt(m[1], 10) : 0;
  let secondsInt = parseInt(m[2], 10);
  const tenths = m[3] !== undefined ? parseInt(m[3], 10) : null;

  if (Number.isNaN(minutes) || Number.isNaN(secondsInt)) return null;
  if (tenths !== null && Number.isNaN(tenths)) return null;

  // Carry seconds overflow into minutes
  minutes += Math.floor(secondsInt / 60);
  secondsInt = secondsInt % 60;

  let total = minutes * 60 + secondsInt;
  if (tenths !== null) total += tenths / 10;

  return total;
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

function setLapHeaderForMode() {
  if (!lapTimeHeaderEl) return;
  lapTimeHeaderEl.textContent = isManualMode ? "Time (mm:ss)" : "Time (mm:ss.s)";
}

/**
 * Update the on-screen timer display from the current elapsedMs value.
 */
function getCurrentElapsedMs() {
  if (!stopwatchRunning) return elapsedMs;
  if (stopwatchStartTime === null) return elapsedMs;
  return elapsedMs + (performance.now() - stopwatchStartTime);
}

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
  if (!stopwatchRunning) return;

  // timestamp comes from requestAnimationFrame and is comparable to performance.now()
  if (stopwatchStartTime === null) stopwatchStartTime = timestamp;

  const delta = timestamp - stopwatchStartTime;
  stopwatchStartTime = timestamp;

  elapsedMs += delta;

  // Clamp at 6 minutes (360000 ms) so drift can’t push over.
  const maxMs = 6 * 60 * 1000;
  if (elapsedMs >= maxMs) {
    elapsedMs = maxMs;
    stopwatchRunning = false;
    updateTimerDisplay();

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    toggleButton.textContent = "Finished";
    toggleButton.disabled = true;
    lapButton.disabled = true;
    return;
  }

  updateTimerDisplay();
  animationFrameId = requestAnimationFrame(tick);
}

/**
 * Start the stopwatch.
 * This is called when the toggleButton goes from "Start" to "Stop".
 */
function startTimer() {
  if (stopwatchRunning) return;

  // Reset the frame reference so the first tick starts cleanly
  stopwatchRunning = true;
  stopwatchStartTime = null;

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
  if (!stopwatchRunning) return;

  stopwatchRunning = false;

  // Cancel any scheduled animation frame
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // If we stop between frames, add the partial delta up to now
  if (stopwatchStartTime !== null) {
    const now = performance.now();
    elapsedMs += (now - stopwatchStartTime);
    stopwatchStartTime = now;
  }

  // Clamp at 6 minutes
  const maxMs = 6 * 60 * 1000;
  if (elapsedMs > maxMs) elapsedMs = maxMs;

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
  if (isManualMode) {
    return;
  }
  if (!stopwatchRunning) {
    return;
  }

  const currentMs = getCurrentElapsedMs();
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
  setLapHeaderForMode();

  if (!isManualMode) {
    // Stopwatch mode: render recorded laps
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

  // Manual mode: render editable rows (fixed count + trailing blanks allowed)
  const preset = lapTimes.map((t) => formatTimeMMSS(t));
  const rowCount = Math.max(manualRowCount, preset.length + 1);

  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement("tr");
    const tdLap = document.createElement("td");
    const tdTime = document.createElement("td");

    tdLap.textContent = i + 1;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";            // full keyboard (needs ':')
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "next";
    input.placeholder = "mm:ss";
    input.className = "manual-time-input";
    input.value = preset[i] || "";
    input.dataset.index = String(i);

    // Normalize on blur (don’t nag while typing)
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (!v) return;

      const sec = parseTimeFlexibleToSeconds(v);
      if (sec === null) return; // leave as-is; calculate() will catch it if needed
      input.value = formatTimeMMSS(sec);
    });

    // Enter/Done -> add a row if needed, then focus next
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      maybeAddManualRowFromIndex(i);
    });

    tdTime.appendChild(input);
    tr.appendChild(tdLap);
    tr.appendChild(tdTime);
    lapTableBody.appendChild(tr);
  }
}


/* =========================
   Manual mode helpers (table-based cumulative lap times)
   ========================= */
// (table-based cumulative lap times)
// =========================

function syncLapTimesFromManualTable() {
  // This function used to live-validate on each keystroke.
  // We keep the name so other code doesn’t break, but we validate on Calculate instead.
  return true;
}

function maybeAddManualRowFromIndex(index) {
  if (!isManualMode) return;

  const inputs = Array.from(lapTableBody.querySelectorAll("input.manual-time-input"));
  const isLast = index >= inputs.length - 1;

  // Only add a row if the current row has something parseable
  const v = (inputs[index]?.value || "").trim();
  const sec = parseTimeFlexibleToSeconds(v);
  if (sec === null) {
    // still move focus forward if possible
    if (inputs[index + 1]) inputs[index + 1].focus();
    return;
  }


  // Normalize the current cell once it looks valid
  const normalized = formatTimeMMSS(sec);
  if (inputs[index]) inputs[index].value = normalized;
  manualLapValues[index] = normalized;

  if (isLast) {
    manualRowCount += 1;
    renderLapTable();

    // focus the next row that was just added
    const newInputs = Array.from(lapTableBody.querySelectorAll("input.manual-time-input"));
    if (newInputs[index + 1]) newInputs[index + 1].focus();
  } else {
    if (inputs[index + 1]) inputs[index + 1].focus();
  }
}

/**
 * Read manual times from the table and return an array of seconds.
 * - trailing blank rows are ignored
 * - blank row in the middle is an error
 * - times must be strictly increasing
 * If showErrors is true, writes a message into lapErrorDiv.
 */
function readManualLapTimes(showErrors) {
  const inputs = Array.from(lapTableBody.querySelectorAll("input.manual-time-input"));
  const secs = [];
  let seenBlank = false;

  for (let i = 0; i < inputs.length; i++) {
    const raw = (inputs[i].value || "").trim();

    if (!raw) {
      // once blank, everything after must also be blank
      seenBlank = true;
      continue;
    }
    if (seenBlank) {
      if (showErrors) {
        lapErrorDiv.textContent = `Manual entry error: you left a blank row before lap ${i + 1}.`;
      }
      return null;
    }

    const sec = parseTimeFlexibleToSeconds(raw);
    if (sec === null) {
      if (showErrors) {
        lapErrorDiv.textContent = `Manual entry error on lap ${i + 1}: please enter a time like :37, 1:40, 02:15.`;
      }
      return null;
    }

    // Strictly increasing cumulative times
    if (secs.length > 0 && sec <= secs[secs.length - 1]) {
      if (showErrors) {
        lapErrorDiv.textContent = `Manual entry error on lap ${i + 1}: times must be strictly increasing.`;
      }
      return null;
    }

    secs.push(sec);
  }

  // ok
  if (showErrors) lapErrorDiv.textContent = "";
  return secs;
}


function setManualMode(on) {
  isManualMode = !!on;

  // Title text swap (manual ON = Lap recorder)
  if (stopwatchTitleEl) {
    stopwatchTitleEl.textContent = isManualMode ? "Lap recorder" : "Stopwatch and lap recorder";
  }

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
    // Start minimalist: 1 blank row, or carry over any existing stopwatch laps.
    if (lapTimes.length > 0) {
      manualLapValues = lapTimes.map((t) => formatTimeMMSS(t));
    } else {
      manualLapValues = [""];
    }
    manualRowCount = manualLapValues.length;
    toggleButton.disabled = true;
  } else {
    // Don’t override a Finished state
    if (toggleButton.textContent !== "Finished") {
      toggleButton.disabled = false;
    }
    lapErrorDiv.textContent = "";
  }

  setLapHeaderForMode();
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
    // Treat 0 as the start line regardless of direction.
    // Without this, (back, 0) would become 50 m and double-count a full lap.
    if (posM === 0) return 0;
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

  // If in manual mode, pull lap times from the table now.
  // (We intentionally do NOT validate on every keystroke.)
  if (isManualMode) {
    const secs = readManualLapTimes(true);
    if (!secs) {
      resultsBox.textContent = "Error: fix manual lap times before calculating.";
      return;
    }
    // Store as seconds (cumulative lap times)
    lapTimes = secs;
  }

  // Results are always written here
  const lines = [];

  // Sort a copy of lapTimes so even if something unusual happens,
  // the per minute logic behaves like the original text based version.
  const sortedLapTimes = [...lapTimes].sort((a, b) => a - b);

  // Small helper for aligned console-style output
  function padRight(v, width) {
    const s = String(v);
    return s.length >= width ? s : s + " ".repeat(width - s.length);
  }

  // 1) Parse minute positions with validation as in Original_index.html
  const minuteInfo = [];

  for (let m = 1; m <= 6; m++) {
    const posInput = document.getElementById(`pos_${m}`);
    const dirButton = document.getElementById(`dir_${m}`);

    const rawPos = posInput.value.trim();
    const rawDir = ((dirButton && (dirButton.dataset.dir || dirButton.textContent)) || "")
      .trim()
      .toLowerCase();

    if (!rawPos) {
      const msg = `Please enter a position (0 to 25 m) for minute ${m}.`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: missing position for minute ${m}.`;
      return;
    }

    const posM = parseInt(rawPos, 10);
    if (Number.isNaN(posM) || posM < 0 || posM > 25) {
      const msg = `Position must be between 0 and 25 for minute ${m}.`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: invalid position for minute ${m}.`;
      return;
    }

    if (rawDir !== "out" && rawDir !== "back") {
      const msg = `Direction must be 'out' or 'back' for minute ${m}.`;
      minuteErrorDiv.textContent = msg;
      resultsBox.textContent = `Error: invalid direction for minute ${m}.`;
      return;
    }

    minuteInfo.push({ minute: m, posM, dir: rawDir });
  }

  // 2) Compute per-minute distances
  const rows = [];
  let prevTotalDistance = 0;

  for (let i = 0; i < minuteInfo.length; i++) {
    const info = minuteInfo[i];
    const minute = info.minute;

    const tSec = minute * 60;
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
  const totalDistanceAll = rows.length ? rows[rows.length - 1].totalDistanceM : 0;
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
        padRight(row.timeS.toFixed(0), 9) +
        padRight(row.distanceThisMinuteM.toFixed(2), 13) +
        padRight(row.lapsThisMinute.toFixed(3), 15) +
        padRight(row.totalDistanceM.toFixed(2), 10)
    );
  });

  lines.push("");
  lines.push(`Total distance (m): ${totalDistanceAll.toFixed(2)}`);
  lines.push(`Total laps: ${totalLapsAll.toFixed(3)}`);

  resultsBox.textContent = lines.join("\n");
}

function clearResults() {
  minuteErrorDiv.textContent = "";
  lapErrorDiv.textContent = "";
  resultsBox.textContent = "Per-minute results will appear here.";
}

/** Clear only the results text and related errors (keeps inputs). */
function clearResults() {
  lapErrorDiv.textContent = "";
  minuteErrorDiv.textContent = "";
  resultsBox.textContent = "Per-minute results will appear here.";
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
