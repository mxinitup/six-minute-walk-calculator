/* 
  script.js — Robust stopwatch + manual lap recorder + 6MWT calculator

  Goals:
  - Stopwatch mode: Start/Stop/Lap/Reset work reliably on desktop + mobile.
  - Manual mode: Editable cumulative lap-time table (mm:ss), expandable with Add Row.
    * Accepts shorthand like :37, 37, 1:4, 1:40, 2:15
    * Normalizes to mm:ss on blur (does NOT nag while typing)
    * Does not wipe typed values when adding rows
  - Calculation uses lap times (stopwatch or manual) + minute position/direction sticky notes.
  - Math fix: position=0 is always treated as the start line (offset 0) for BOTH directions.
*/

(() => {
  "use strict";

  // ---------- DOM ----------
  const el = {
    toggleButton: document.getElementById("toggleButton"),
    title: document.getElementById("stopwatchTitle"),
    manualToggle: document.getElementById("manualModeToggle"),
    stopwatchControls: document.getElementById("stopwatchControls"),
    timerDisplay: document.getElementById("timerDisplay"),
    lapButton: document.getElementById("lapButton"),
    resetButton: document.getElementById("resetButton"),
    lapTableBody: document.getElementById("lapTableBody"),
    lapTimeHeader: document.getElementById("lapTimeHeader"),
    lapError: document.getElementById("lapError"),
    minuteError: document.getElementById("minuteError"),
    resultsBox: document.getElementById("resultsBox"),
    calcButton: document.getElementById("calcButton"),
    clearAllButton: document.getElementById("clearAllButton"),
    clearResultsButton: document.getElementById("clearResultsButton"),
    manualRowControls: document.getElementById("manualRowControls"),
    addRowButton: document.getElementById("addRowButton"),
    manualHint: document.getElementById("manualHint"),
  };

  // Position + direction inputs
  const posInputs = Array.from({ length: 6 }, (_, i) => document.getElementById(`pos_${i + 1}`));
  const dirInputs = Array.from({ length: 6 }, (_, i) => document.getElementById(`dir_${i + 1}`));

  // ---------- State ----------
  let isManualMode = false;

  // Stopwatch laps (ms)
  let lapTimes = [];        // cumulative lap-crossing times in ms
  let running = false;
  let elapsedMs = 0;
  let lastFrameTs = 0;
  let rafId = null;

  // Manual entries (strings) — cumulative lap times
  let manualEntries = [];   // index 0 = lap 1 time, etc.

  // ---------- Helpers ----------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatStopwatch(ms) {
    // mm:ss.t (tenths)
    ms = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${pad2(minutes)}:${pad2(seconds)}.${tenths}`;
  }

  function formatMmSs(ms) {
    ms = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${pad2(minutes)}:${pad2(seconds)}`;
  }

  function clearErrors() {
    el.lapError.textContent = "";
    el.minuteError.textContent = "";
    el.lapError.classList.add("hidden");
    el.minuteError.classList.add("hidden");
  }

  function showError(target, msg) {
    target.textContent = msg;
    target.classList.remove("hidden");
  }

  function clearResults() {
    el.resultsBox.textContent = "";
  }

  function getCurrentElapsedMs() {
    return elapsedMs;
  }

  // Flexible manual time parsing:
  // Accept:
  //  - ":37" => 00:37
  //  - "37"  => 00:37
  //  - "1:4" => 01:04
  //  - "1:40"=> 01:40
  //  - "2:75"=> 03:15 (carry seconds)
  function parseFlexibleTimeToMs(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;

    // allow leading ":" like ":37"
    if (s.startsWith(":")) s = "0" + s;

    // Only allow digits + optional colon
    // Remove spaces
    s = s.replace(/\s+/g, "");

    if (!/^\d+(:\d*)?$/.test(s)) return null;

    if (s.includes(":")) {
      const [mStr, secStrRaw] = s.split(":");
      const m = parseInt(mStr || "0", 10);
      const secStr = secStrRaw ?? "";
      // If user typed "1:" treat as 1:00 (parseable)
      const sec = secStr === "" ? 0 : parseInt(secStr, 10);
      if (!Number.isFinite(m) || !Number.isFinite(sec) || m < 0 || sec < 0) return null;
      const totalSec = m * 60 + sec;
      return totalSec * 1000;
    } else {
      // Just seconds
      const sec = parseInt(s, 10);
      if (!Number.isFinite(sec) || sec < 0) return null;
      return sec * 1000;
    }
  }

  function normalizeManualInputValue(raw) {
    const ms = parseFlexibleTimeToMs(raw);
    if (ms == null) return "";
    return formatMmSs(ms);
  }

  // ---------- Stopwatch ----------
  function updateTimerDisplay() {
    el.timerDisplay.textContent = formatStopwatch(getCurrentElapsedMs());
  }

  function tick(ts) {
    if (running) {
      if (!lastFrameTs) lastFrameTs = ts;
      const delta = ts - lastFrameTs;
      lastFrameTs = ts;
      // Guard against huge jumps (tab switching)
      if (delta > 0 && delta < 5000) {
        elapsedMs += delta;
      }
      updateTimerDisplay();
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function ensureRafRunning() {
    if (rafId == null) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  function startStopwatch() {
    clearErrors();
    running = true;
    lastFrameTs = 0;
    el.toggleButton.textContent = "Stop";
    ensureRafRunning();
  }

  function stopStopwatch() {
    running = false;
    lastFrameTs = 0;
    el.toggleButton.textContent = "Start";
  }

  function resetStopwatch() {
    stopStopwatch();
    elapsedMs = 0;
    lapTimes = [];
    updateTimerDisplay();
    renderLapTable();
    clearErrors();
  }

  function recordLap() {
    clearErrors();
    if (!running) return;

    const t = Math.round(getCurrentElapsedMs());
    const last = lapTimes.length ? lapTimes[lapTimes.length - 1] : -1;

    if (t <= last) {
      showError(el.lapError, "Lap ignored: lap times must be strictly increasing.");
      return;
    }

    lapTimes.push(t);
    renderLapTable();
  }

  // ---------- Lap Table Rendering ----------
  function clearLapTableBody() {
    while (el.lapTableBody.firstChild) el.lapTableBody.removeChild(el.lapTableBody.firstChild);
  }

  function createCell(tagName, text) {
    const td = document.createElement(tagName);
    td.textContent = text;
    return td;
  }

  function renderStopwatchLapTable() {
    clearLapTableBody();

    if (lapTimes.length === 0) {
      // keep at least one empty row? We'll show none.
      return;
    }

    lapTimes.forEach((ms, idx) => {
      const tr = document.createElement("tr");
      tr.appendChild(createCell("td", String(idx + 1)));

      const td = document.createElement("td");
      td.textContent = formatMmSs(ms);
      tr.appendChild(td);

      el.lapTableBody.appendChild(tr);
    });
  }

  function renderManualLapTable() {
    // rebuild table for manual mode only (safe: values live in manualEntries)
    clearLapTableBody();

    const rowCount = Math.max(8, manualEntries.length + 1);

    for (let i = 0; i < rowCount; i++) {
      const tr = document.createElement("tr");
      tr.appendChild(createCell("td", String(i + 1)));

      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "text"; // ensure keyboard includes ':'
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.className = "manual-time-input";
      input.placeholder = "mm:ss";
      input.value = manualEntries[i] ?? "";

      input.addEventListener("input", () => {
        manualEntries[i] = input.value; // store raw as typed
        // no validation, no rerender
      });

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          manualEntries[i] = input.value;
          // Add a row if we're on the last row and there's something parseable
          if (i === getLastRowIndex() && parseFlexibleTimeToMs(input.value) != null) {
            appendManualRow(); // does NOT wipe
          } else {
            // move to next row if it exists
            const next = getManualInputAtIndex(i + 1);
            if (next) next.focus();
          }
        }
      });

      input.addEventListener("blur", () => {
        // normalize value on blur (no error messages)
        const normalized = normalizeManualInputValue(input.value);
        input.value = normalized;
        manualEntries[i] = normalized;

        // Add row if blurred last row and parseable
        if (i === getLastRowIndex() && parseFlexibleTimeToMs(normalized) != null) {
          appendManualRow(); // keep focus as-is; user can scroll/tap
        }
      });

      td.appendChild(input);
      tr.appendChild(td);
      el.lapTableBody.appendChild(tr);
    }
  }

  function getManualInputs() {
    return Array.from(el.lapTableBody.querySelectorAll("input.manual-time-input"));
  }

  function getManualInputAtIndex(i) {
    const inputs = getManualInputs();
    return inputs[i] || null;
  }

  function getLastRowIndex() {
    // current rendered last row index
    return Math.max(0, el.lapTableBody.querySelectorAll("tr").length - 1);
  }

  function appendManualRow() {
    // Preserve: DO NOT rerender. Append one row at end.
    const nextIndex = el.lapTableBody.querySelectorAll("tr").length;
    manualEntries[nextIndex] = manualEntries[nextIndex] ?? "";

    const tr = document.createElement("tr");
    tr.appendChild(createCell("td", String(nextIndex + 1)));

    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.className = "manual-time-input";
    input.placeholder = "mm:ss";
    input.value = manualEntries[nextIndex] ?? "";

    input.addEventListener("input", () => {
      manualEntries[nextIndex] = input.value;
    });

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        manualEntries[nextIndex] = input.value;
        if (nextIndex === getLastRowIndex() && parseFlexibleTimeToMs(input.value) != null) {
          appendManualRow();
        }
      }
    });

    input.addEventListener("blur", () => {
      const normalized = normalizeManualInputValue(input.value);
      input.value = normalized;
      manualEntries[nextIndex] = normalized;
      if (nextIndex === getLastRowIndex() && parseFlexibleTimeToMs(normalized) != null) {
        appendManualRow();
      }
    });

    td.appendChild(input);
    tr.appendChild(td);
    el.lapTableBody.appendChild(tr);
  }

  function renderLapTable() {
    if (isManualMode) {
      renderManualLapTable();
    } else {
      renderStopwatchLapTable();
    }
  }

  // ---------- Mode switching ----------
  function setManualMode(on) {
    isManualMode = !!on;
    clearErrors();

    if (isManualMode) {
      // Title
      el.title.textContent = "Lap recorder";

      // Hide stopwatch controls
      el.stopwatchControls.classList.add("hidden");

      // Show manual row controls and hint
      el.manualRowControls.classList.remove("hidden");
      el.manualHint.classList.remove("hidden");

      // Render manual table
      renderLapTable();
    } else {
      // Title
      el.title.textContent = "Stopwatch and lap recorder";

      // Show stopwatch controls
      el.stopwatchControls.classList.remove("hidden");

      // Hide manual controls and hint
      el.manualRowControls.classList.add("hidden");
      el.manualHint.classList.add("hidden");

      // Render stopwatch laps
      renderLapTable();
    }
  }

  // ---------- Calculation ----------
  function readMinuteInputs() {
    const minutes = [];
    for (let i = 0; i < 6; i++) {
      const posStr = (posInputs[i].value ?? "").trim();
      const dir = (dirInputs[i].value ?? "").trim().toLowerCase();

      if (posStr === "" || dir === "") {
        return { ok: false, error: `Missing position/direction for minute ${i + 1}.` };
      }

      const pos = Number(posStr);
      if (!Number.isFinite(pos) || pos < 0 || pos > 25) {
        return { ok: false, error: `Minute ${i + 1}: position must be a number from 0 to 25.` };
      }

      if (dir !== "out" && dir !== "back") {
        return { ok: false, error: `Minute ${i + 1}: direction must be "out" or "back".` };
      }

      minutes.push({ pos, dir });
    }
    return { ok: true, minutes };
  }

  function offsetMetersFromPosDir(pos, dir) {
    // pos is 0..25, each unit is 2 meters => 0..50
    const posM = Math.round(pos * 2);

    if (posM === 0) return 0; // start line for BOTH directions

    if (dir === "out") return posM;

    // back
    return 50 - posM;
  }

  function getEffectiveLapTimesForCalculation() {
    if (!isManualMode) {
      return { ok: true, lapTimesMs: lapTimes.slice() };
    }

    // Parse manualEntries into ms times
    const msValues = [];
    let foundNonEmptyAfterBlank = false;
    let sawBlank = false;

    for (let i = 0; i < manualEntries.length; i++) {
      const raw = (manualEntries[i] ?? "").trim();
      if (!raw) {
        sawBlank = true;
        continue;
      }
      const ms = parseFlexibleTimeToMs(raw);
      if (ms == null) {
        return { ok: false, error: `Manual entry error on lap ${i + 1}: couldn't parse "${raw}".` };
      }
      if (sawBlank) {
        foundNonEmptyAfterBlank = true;
      }
      msValues.push(ms);
    }

    if (foundNonEmptyAfterBlank) {
      return { ok: false, error: "Manual entry error: don't leave blank rows in the middle (only trailing blanks are allowed)." };
    }

    // Ensure strictly increasing
    for (let i = 1; i < msValues.length; i++) {
      if (msValues[i] <= msValues[i - 1]) {
        return { ok: false, error: `Manual entry error on lap ${i + 1}: times must be strictly increasing.` };
      }
    }

    return { ok: true, lapTimesMs: msValues };
  }

  function calculate() {
    clearErrors();

    const minuteRead = readMinuteInputs();
    if (!minuteRead.ok) {
      showError(el.minuteError, minuteRead.error);
      return;
    }

    const lapRead = getEffectiveLapTimesForCalculation();
    if (!lapRead.ok) {
      showError(el.lapError, lapRead.error);
      return;
    }

    const laps = lapRead.lapTimesMs; // sorted increasing

    // Compute total meters at each minute mark
    const totals = [];
    for (let i = 0; i < 6; i++) {
      const minuteMarkMs = (i + 1) * 60 * 1000;
      let lapsCompleted = 0;
      // Count laps with time <= minute mark
      // (laps are cumulative lap-crossing times)
      for (let j = 0; j < laps.length; j++) {
        if (laps[j] <= minuteMarkMs) lapsCompleted++;
        else break;
      }

      const { pos, dir } = minuteRead.minutes[i];
      const offset = offsetMetersFromPosDir(pos, dir);
      const total = lapsCompleted * 50 + offset;
      totals.push(total);
    }

    // Validate totals are non-decreasing
    for (let i = 1; i < totals.length; i++) {
      if (totals[i] < totals[i - 1]) {
        showError(el.minuteError, `Minute ${i + 1} total (${totals[i]}) is less than minute ${i} total (${totals[i - 1]}). Check positions/directions.`);
        return;
      }
    }

    // Build per-minute meters
    const perMinute = totals.map((t, i) => (i === 0 ? t : (t - totals[i - 1])));

    // Total distance at 6 minutes
    const total6 = totals[5];

    // Render results
    const lines = [];
    lines.push("Results");
    lines.push("-------");
    for (let i = 0; i < 6; i++) {
      lines.push(`Minute ${i + 1}: total = ${totals[i]} m; this minute = ${perMinute[i]} m`);
    }
    lines.push("");
    lines.push(`Total at 6:00 = ${total6} m`);

    el.resultsBox.textContent = lines.join("\n");
  }

  // ---------- Clearing ----------
  function clearAll() {
    clearErrors();
    clearResults();

    // Clear minute inputs
    for (let i = 0; i < 6; i++) {
      posInputs[i].value = "";
      dirInputs[i].value = "";
    }

    // Clear laps
    lapTimes = [];
    manualEntries = [];

    // Reset stopwatch timer
    elapsedMs = 0;
    running = false;
    lastFrameTs = 0;
    el.toggleButton.textContent = "Start";
    updateTimerDisplay();

    // Re-render according to current mode
    renderLapTable();
  }

  // ---------- Wire up events ----------
  function bindEvents() {
    // Stopwatch start/stop
    el.toggleButton.addEventListener("click", () => {
      if (isManualMode) return; // hidden anyway, but safety
      if (running) stopStopwatch();
      else startStopwatch();
    });

    el.lapButton.addEventListener("click", () => {
      if (isManualMode) return;
      recordLap();
    });

    el.resetButton.addEventListener("click", () => {
      if (isManualMode) return;
      resetStopwatch();
    });

    // Manual mode toggle
    el.manualToggle.addEventListener("change", () => {
      setManualMode(el.manualToggle.checked);
    });

    // Add row button
    el.addRowButton.addEventListener("click", () => {
      if (!isManualMode) return;
      appendManualRow();
      // focus the new row for convenience
      const inputs = getManualInputs();
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    });

    // Calculate
    el.calcButton.addEventListener("click", calculate);

    // Clear buttons
    el.clearAllButton.addEventListener("click", clearAll);
    el.clearResultsButton.addEventListener("click", clearResults);
  }

  // ---------- Init ----------
  function init() {
    // Initial UI state
    updateTimerDisplay();
    setManualMode(el.manualToggle.checked);

    bindEvents();
    ensureRafRunning(); // keep display responsive
  }

  // Start once DOM is ready (script is loaded at end, but be safe)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
