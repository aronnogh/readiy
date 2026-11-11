const buttons = {
  selection: document.getElementById("open-selection"),
  page: document.getElementById("open-page")
};
const status = document.getElementById("status");

for (const [mode, button] of Object.entries(buttons)) {
  button.addEventListener("click", () => run(mode));
}

async function run(mode) {
  setBusy(true);
  showStatus("", false);

  try {
    const response = await chrome.runtime.sendMessage({ type: "read-mode:" + mode });
    if (response && response.ok) {
      if (response.direct) showStatus("Opened in a new tab.", false);
      // The new tab takes focus; the popup closes on its own.
      return;
    }
    showStatus((response && response.message) || "Something went wrong. Try again.", true);
  } catch {
    showStatus("Could not reach this page. Try reloading the tab.", true);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  for (const button of Object.values(buttons)) button.disabled = busy;
}

function showStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("is-visible", Boolean(message));
  status.classList.toggle("is-error", Boolean(isError));
}
