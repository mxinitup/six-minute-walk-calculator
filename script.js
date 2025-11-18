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

// Shared error and results elements. Some of these existed in Original_index.html already.
const lapErrorDiv = document.getElementById("lapError");
const minuteErrorDiv = document.getElementById("minuteError");
const resultsBox = document.getElementById("resultsBox");

// Constant from the original calculator
const LAP_LENGTH_M = 50.0; // 25 m out + 25 m back

/**
 * Format a time in seconds as "mm:ss.s".
 * The original code handled text parsing only. Here we provide the inverse.
 */
function formatTimeSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1); // one decimal place
  return `${String(m).padStart(2, "0")}:${s.toString().padStart(4, "0")}`;
}

/**
 * Update the visible timer display based on elapsedMs.
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
  elapsedMs = timestamp - stopwatchStartTime;
  updateTimerDisplay();

  // Schedule the next frame while running
  animationFrameId = window.requestAnimationFrame(tick);
}

/**
 * Start the stopwatch.
 * This function is written so that start-stop-start will resume from the previous elapsed time.
 */
function startTimer() {
  // The minus elapsedMs part allows resume instead of always starting from zero
  stopwatchStartTime = window.performance.now() - elapsedMs;
  stopwatchRunning = true;

  // Kick off the animation loop
  animationFrameId = window.requestAnimationFrame(tick);

  // Update button states
  toggleButton.textContent = "Stop";
  lapButton.disabled = false;
  resetButton.disabled = false;
}

/**
 * Stop the stopwatch and keep the elapsed time.
 */
function stopTimer() {
  stopwatchRunning = false;

  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Display the final time at the moment of stopping
  updateTimerDisplay();

  toggleButton.textContent = "Start";
  lapButton.disabled = true;
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
 * Fully reset the stopwatch and lap data.
 * This also clears errors and resets the results text.
 * In Original_index.html Clear All did most of this for the text based inputs.
 */
function resetTimer() {
  stopTimer();
  elapsedMs = 0;
  lapTimes = [];

  updateTimerDisplay();
  renderLapTable();

  lapErrorDiv.textContent = "";
  minuteErrorDiv.textContent = "";
  resultsBox.textContent = "Per-minute results will appear here.";

  resetButton.disabled = true;
}

/**
 * Record a lap at the current stopwatch time.
 * This replaces the user's manual typing of lap times into a textarea.
 */
function recordLap() {
  if (!stopwatchRunning) {
    return;
  }

  const currentSec = elapsedMs / 1000;

  // The original calculator sorted lap times to handle out of order text.
  // Here we enforce a simple rule: a new lap must be later than the previous one.
  // If not, we ignore it and show a short message.
  if (lapTimes.length > 0) {
    const lastLap = lapTimes[lapTimes.length - 1];

    if (currentSec <= lastLap) {
      lapErrorDiv.textContent =
        "Ignored lap because its time is not later than the previous lap.";
      return;
    }
  }

  lapErrorDiv.textContent = "";
  lapTimes.push(currentSec);

  renderLapTable();
}

/**
 * Render the lap table from the lapTimes array.
 * The original page never had this table. It only had the user typed textarea.
 */
function renderLapTable() {
  lapTableBody.innerHTML = "";

  lapTimes.forEach((t, index) => {
    const row = document.createElement("tr");
    const lapNumberCell = document.createElement("td");
    const lapTimeCell = document.createElement("td");

    lapNumberCell.textContent = index + 1;
    lapTimeCell.textContent = formatTimeSeconds(t);

    row.appendChild(lapNumberCell);
    row.appendChild(lapTimeCell);

    lapTableBody.appendChild(row);
  });
}

/* =========================
   Calculator helpers
   - Based closely on Original_index.html with minimal changes.
   ========================= */

/**
 * Count how many laps were completed at or before a given time.
 * This is the same concept as getLapsCompletedByTime in the original script.
 */
function getLapsCompletedByTime(sortedLapTimes, tSeconds) {
  let count = 0;
  for (let i = 0; i < sortedLapTimes.length; i++) {
    if (sortedLapTimes[i] <= tSeconds) {
      count++;
    }
  }
  return count;
}

/**
 * Convert a position within the current lap to an offset along the 50 m circuit.
 * If direction is "out", we are heading from 0 to 25.
 * If direction is "back", we are heading from 25 to 0 and we count from the far end.
 */
function positionToOffsetWithinLap(posM, direction) {
  const dir = direction.toLowerCase();
  if (dir === "out") {
    return posM; // 0..25
  } else if (dir === "back") {
    return LAP_LENGTH_M - posM; // 25..50
  } else {
    throw new Error("direction must be 'out' or 'back'");
  }
}

/**
 * Pad plain text on the right, used to keep the text output aligned.
 * Same as the helper in Original_index.html.
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

  // Results are always written here
  const lines = [];

  // Sort a copy of lapTimes so even if something unusual happens,
  // the per minute logic behaves like the original text based version.
  const sortedLapTimes = [...lapTimes].sort((a, b) => a - b);

  // 1) Parse minute positions with validation as in Original_index.html
  const minuteInfo = [];

  for (let m = 1; m <= 6; m++) {
    const posInput = document.getElementById(`pos_${m}`);
    const dirSelect = document.getElementById(`dir_${m}`);

    const rawPos = posInput.value.trim();
    const rawDir = dirSelect.value.trim().toLowerCase();

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

  // 2) Compute per minute distances using the same approach as Original_index.html
  const results = [];
  let prevTotalDistance = 0.0;

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

    results.push({
      minute,
      timeS: tSec,
      distanceThisMinuteM: distanceThisMinute,
      lapsThisMinute
    });

    prevTotalDistance = totalDistance;
  }

  // 3) Totals for the full 6 minutes
  let totalDistanceAll = 0.0;
  for (let i = 0; i < results.length; i++) {
    totalDistanceAll += results[i].distanceThisMinuteM;
  }
  const totalLapsAll = totalDistanceAll / LAP_LENGTH_M;

  // 4) Format the output text block in a similar layout to Original_index.html
  lines.push("Per-Minute Distances");
  lines.push("1 lap = 50 m (25 m out + 25 m back)");
  lines.push("");
  lines.push(
    padRight("Min", 4) +
      padRight("Time(s)", 9) +
      padRight("m this min", 13) +
      padRight("laps this min", 15)
  );
  lines.push("---------------------------------------------");

  results.forEach((row) => {
    lines.push(
      padRight(row.minute, 4) +
        padRight(row.timeS.toFixed(1), 9) +
        padRight(row.distanceThisMinuteM.toFixed(2), 13) +
        padRight(row.lapsThisMinute.toFixed(3), 15)
    );
  });

  lines.push("");
  lines.push("Totals (0 to 6 minutes):");
  lines.push("  Total distance: " + totalDistanceAll.toFixed(2) + " m");
  lines.push("  Total laps:     " + totalLapsAll.toFixed(3) + " laps");

  resultsBox.textContent = lines.join("\n");
}

/* =========================
   Clear helpers
   ========================= */

/**
 * Clear only the results and errors, keep data.
 * Same idea as clearResults in the original file.
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
    const dirSelect = document.getElementById(`dir_${m}`);

    if (posInput) {
      posInput.value = "";
    }
    if (dirSelect) {
      dirSelect.value = "out";
    }
  }

  // Errors and results are already reset by resetTimer
}

/* =========================
   Event bindings
   ========================= */

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
  const dirSelect = document.getElementById(`dir_${m}`);

  if (posInput) {
    posInput.addEventListener("input", () => {
      minuteErrorDiv.textContent = "";
    });
  }

  if (dirSelect) {
    dirSelect.addEventListener("change", () => {
      minuteErrorDiv.textContent = "";
    });
  }
}

// Initial UI state
updateTimerDisplay();
resetButton.disabled = true;
lapButton.disabled = true;
resultsBox.textContent = "Per-minute results will appear here.";
