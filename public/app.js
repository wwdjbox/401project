const API_BASE = "";

const state = {
  summary: null,
  settings: {
    contributionType: "percent",
    contributionValue: 0,
  },
  savedSettings: {
    contributionType: "percent",
    contributionValue: 0,
  },
};

const elements = {
  toggles: document.querySelectorAll(".toggle"),
  input: document.getElementById("contribution-input"),
  slider: document.getElementById("contribution-slider"),
  prefix: document.getElementById("input-prefix"),
  label: document.getElementById("amount-label"),
  helper: document.getElementById("impact-copy"),
  saveButton: document.getElementById("save-button"),
  status: document.getElementById("status-text"),
  impactAge: document.getElementById("impact-age"),
  impactRetireAge: document.getElementById("impact-retire-age"),
  impactExtra: document.getElementById("impact-extra"),
  summaryName: document.getElementById("summary-name"),
  summaryPlan: document.getElementById("summary-plan"),
  summarySalary: document.getElementById("summary-salary"),
  summaryMatch: document.getElementById("summary-match"),
  summaryYtd: document.getElementById("summary-ytd"),
  summaryBalance: document.getElementById("summary-balance"),
};

async function fetchJSON(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
}

async function loadSummary() {
  const summary = await fetchJSON("/api/summary");
  state.summary = summary;
  state.settings.contributionType = summary.contributionType;
  state.settings.contributionValue = summary.contributionValue;
  // Store saved settings for comparison
  state.savedSettings.contributionType = summary.contributionType;
  state.savedSettings.contributionValue = summary.contributionValue;
  updateSummary(summary);
  syncControls();
  checkForUnsavedChanges();
}

function updateSummary(summary) {
  elements.summaryName.textContent = summary.employeeName;
  elements.summaryPlan.textContent = summary.planType;
  elements.summarySalary.textContent = formatCurrency(summary.annualSalary);
  elements.summaryMatch.textContent = `${summary.companyMatchPercent}%`;
  // Enhanced YTD display with context and breakdown
  const ytdFormatted = formatCurrency(summary.ytdContribution);
  const currentYear = new Date().getFullYear();
  let ytdHtml = `${ytdFormatted}<br><small style="opacity: 0.7; font-size: 0.75rem;">Year-to-Date ${currentYear}</small>`;
  if (summary.ytdEmployerMatch !== undefined) {
    const totalYtd = summary.ytdContribution + summary.ytdEmployerMatch;
    ytdHtml += `<br><small style="opacity: 0.6; font-size: 0.7rem;">+ ${formatCurrency(summary.ytdEmployerMatch)} employer match = ${formatCurrency(totalYtd)} total</small>`;
  }
  elements.summaryYtd.innerHTML = ytdHtml;
  elements.summaryBalance.textContent = formatCurrency(summary.estimatedBalanceAtRetirement);
  elements.impactAge.textContent = summary.age;
  elements.impactRetireAge.textContent = summary.retirementAge;
  updateImpact();
}

function syncControls() {
  const { contributionType, contributionValue } = state.settings;
  elements.input.value = contributionValue;
  elements.slider.value = contributionValue;
  updateInputDecorations(contributionType);
  updateToggle(contributionType);
  updateImpact();
}

function updateInputDecorations(type) {
  if (type === "percent") {
    elements.prefix.textContent = "%";
    elements.label.textContent = "Percent contribution";
    elements.input.min = 0;
    elements.input.max = 75;
    elements.slider.min = 0;
    elements.slider.max = 75;
    elements.input.step = 0.5;
    elements.slider.step = 0.5;
  } else {
    elements.prefix.textContent = "$";
    elements.label.textContent = "Dollar contribution";
    elements.input.min = 0;
    elements.input.max = 10000;
    elements.slider.min = 0;
    elements.slider.max = 1000;
    elements.input.step = 10;
    elements.slider.step = 10;
  }
}

function updateToggle(activeType) {
  elements.toggles.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === activeType);
  });
}

function updateImpact() {
  const { summary, settings, savedSettings } = state;
  if (!summary) return;
  
  // Calculate contribution per paycheck for current setting
  const contributionPerPaycheck =
    settings.contributionType === "percent"
      ? (summary.annualSalary / summary.payFrequency) * (settings.contributionValue / 100)
      : settings.contributionValue;
  
  // Calculate contribution per paycheck for saved setting (baseline)
  const savedContributionPerPaycheck =
    savedSettings.contributionType === "percent"
      ? (summary.annualSalary / summary.payFrequency) * (savedSettings.contributionValue / 100)
      : savedSettings.contributionValue;
  
  // Calculate annual contributions
  const annualContribution = contributionPerPaycheck * summary.payFrequency;
  const savedAnnualContribution = savedContributionPerPaycheck * summary.payFrequency;
  
  // Calculate future values
  const yearsUntilRetirement = summary.retirementAge - summary.age;
  const annualGrowth = 0.06;
  const futureValue =
    annualContribution * (((1 + annualGrowth) ** yearsUntilRetirement - 1) / annualGrowth);
  const savedFutureValue =
    savedAnnualContribution * (((1 + annualGrowth) ** yearsUntilRetirement - 1) / annualGrowth);
  
  // Calculate INCREMENTAL impact (difference from saved setting)
  const incrementalImpact = futureValue - savedFutureValue;
  
  // Update helper text
  elements.helper.textContent =
    settings.contributionType === "percent"
      ? `Saving ${settings.contributionValue}% of each paycheck (~${formatCurrency(
          contributionPerPaycheck
        )} per pay).`
      : `Saving ${formatCurrency(settings.contributionValue)} each paycheck.`;
  
  // Show incremental impact (how much MORE they'd save vs current saved setting)
  if (Math.abs(incrementalImpact) < 1) {
    elements.impactExtra.textContent = formatCurrency(0, 0);
    elements.impactExtra.style.color = "#64748b";
  } else if (incrementalImpact > 0) {
    elements.impactExtra.textContent = `+${formatCurrency(incrementalImpact, 0)}`;
    elements.impactExtra.style.color = "#059669";
  } else {
    elements.impactExtra.textContent = formatCurrency(incrementalImpact, 0);
    elements.impactExtra.style.color = "#dc2626";
  }
  
  checkForUnsavedChanges();
}

function formatCurrency(value, fractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function handleTypeChange(type) {
  state.settings.contributionType = type;
  if (type === "percent" && state.settings.contributionValue > 75) {
    state.settings.contributionValue = 75;
  }
  syncControls();
  checkForUnsavedChanges();
}

function handleValueInput(newValue) {
  const value = Number(newValue);
  if (Number.isNaN(value)) return;
  state.settings.contributionValue = value;
  elements.slider.value = value;
  elements.input.value = value;
  updateImpact();
  checkForUnsavedChanges();
}

async function saveSettings() {
  elements.saveButton.disabled = true;
  elements.status.textContent = "Saving…";
  elements.status.style.color = "#2563eb";
  try {
    const payload = {
      contributionType: state.settings.contributionType,
      contributionValue: Number(state.settings.contributionValue),
    };
    const saved = await fetchJSON("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // Update saved settings to match what was just saved
    state.savedSettings.contributionType = saved.contributionType;
    state.savedSettings.contributionValue = saved.contributionValue;
    state.settings.contributionType = saved.contributionType;
    state.settings.contributionValue = saved.contributionValue;
    elements.status.textContent = "✓ Contribution saved successfully.";
    elements.status.style.color = "#059669";
    updateImpact(); // Recalculate to show 0 incremental (no difference from saved)
    checkForUnsavedChanges();
  } catch (error) {
    elements.status.textContent = "✗ Unable to save changes. Please try again.";
    elements.status.style.color = "#dc2626";
    console.error(error);
  } finally {
    elements.saveButton.disabled = false;
  }
}

function checkForUnsavedChanges() {
  const hasChanges =
    state.settings.contributionType !== state.savedSettings.contributionType ||
    Math.abs(state.settings.contributionValue - state.savedSettings.contributionValue) > 0.01;
  
  if (hasChanges) {
    elements.saveButton.style.opacity = "1";
    elements.saveButton.style.cursor = "pointer";
    if (!elements.saveButton.textContent.includes("(unsaved changes)")) {
      elements.saveButton.textContent = "Save contribution (unsaved changes)";
    }
  } else {
    elements.saveButton.style.opacity = "0.7";
    elements.saveButton.textContent = "Save contribution";
  }
}

function registerEvents() {
  elements.toggles.forEach((btn) => {
    btn.addEventListener("click", () => handleTypeChange(btn.dataset.type));
  });
  elements.input.addEventListener("input", (event) => handleValueInput(event.target.value));
  elements.slider.addEventListener("input", (event) => handleValueInput(event.target.value));
  elements.saveButton.addEventListener("click", saveSettings);
}

async function init() {
  registerEvents();
  try {
    await loadSummary();
    elements.status.textContent = "✓ Latest contribution settings loaded.";
    elements.status.style.color = "#059669";
  } catch (error) {
    elements.status.textContent = "✗ Unable to load data. Using default values.";
    elements.status.style.color = "#dc2626";
    console.error(error);
  }
}

init();
