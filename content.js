// Initialize overlay when the content script loads
let overlay = null;
let isOverlayVisible = false;

// Create the overlay element
function createOverlay() {
  // Only create if it doesn't exist yet
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "language-learning-overlay";
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-header">
        <h3>Language Learning Assistant</h3>
        <button id="close-overlay">×</button>
      </div>
      <div class="overlay-body">
        <div id="loading-indicator" style="display: none;">
          <div class="spinner"></div>
          <p>Analyzing text...</p>
        </div>
        <div id="error-message" style="display: none;"></div>
        <div id="results-container" style="display: none;">
          <div class="original-text">
            <h4>Original Text</h4>
            <p id="original-text-content"></p>
          </div>
          <div class="analysis">
            <h4>Analysis</h4>
            <div id="analysis-content"></div>
          </div>
          <div class="actions">
            <button id="add-to-anki">Add to Anki</button>
            <button id="copy-analysis">Copy</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add event listeners
  overlay
    .querySelector("#close-overlay")
    .addEventListener("click", hideOverlay);
  overlay.querySelector("#add-to-anki").addEventListener("click", addToAnki);
  overlay
    .querySelector("#copy-analysis")
    .addEventListener("click", copyAnalysis);

  // Append to document
  document.body.appendChild(overlay);

  // Close overlay when clicking outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      hideOverlay();
    }
  });

  return overlay;
}

// Show the overlay
function showOverlay() {
  if (!overlay) {
    createOverlay();
  }
  overlay.style.display = "flex";
  isOverlayVisible = true;
}

// Hide the overlay
function hideOverlay() {
  if (overlay) {
    overlay.style.display = "none";
    isOverlayVisible = false;
  }
}

// Show loading indicator
function showLoading() {
  showOverlay();
  document.getElementById("loading-indicator").style.display = "flex";
  document.getElementById("error-message").style.display = "none";
  document.getElementById("results-container").style.display = "none";
}

// Show error message
function showError(message) {
  showOverlay();
  document.getElementById("loading-indicator").style.display = "none";
  document.getElementById("error-message").style.display = "block";
  document.getElementById("error-message").textContent = message;
  document.getElementById("results-container").style.display = "none";
}

// Display analysis results
function displayResults(text, analysis) {
  showOverlay();
  document.getElementById("loading-indicator").style.display = "none";
  document.getElementById("error-message").style.display = "none";
  document.getElementById("results-container").style.display = "block";

  document.getElementById("original-text-content").textContent = text;

  // Parse markdown in analysis
  const analysisContent = document.getElementById("analysis-content");
  analysisContent.innerHTML = markdownToHtml(analysis);

  // Store current text and analysis for Anki and copying
  overlay.dataset.currentText = text;
  overlay.dataset.currentAnalysis = analysis;
}

// Convert simple markdown to HTML
function markdownToHtml(markdown) {
  // Convert headers
  let html = markdown
    .replace(/^### (.*$)/gm, "<h5>$1</h5>")
    .replace(/^## (.*$)/gm, "<h4>$1</h4>")
    .replace(/^# (.*$)/gm, "<h3>$1</h3>");

  // Convert bold and italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Convert lists
  html = html
    .replace(/^\s*\n\*/gm, "<ul>\n*")
    .replace(/^(\*.+)\s*\n([^\*])/gm, "$1\n</ul>\n\n$2")
    .replace(/^\*(.+)/gm, "<li>$1</li>");

  // Convert line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

// Add to Anki functionality
async function addToAnki() {
  const text = overlay.dataset.currentText;
  const analysis = overlay.dataset.currentAnalysis;

  if (!text || !analysis) return;

  try {
    // Get the current entry id
    const entryId = overlay.dataset.entryId;

    // Check if Anki Connect is available
    const anki = await checkAnkiConnect();

    if (anki) {
      // Create note using Anki Connect
      await sendToAnkiConnect(text, analysis);
      showTemporaryMessage("Added to Anki successfully!");
    } else {
      // Store for later export
      await markForAnkiExport(text, analysis, entryId);
      showTemporaryMessage(
        "Saved for Anki export. Go to extension popup to export.",
      );
    }
  } catch (error) {
    console.error("Error adding to Anki:", error);
    showTemporaryMessage(
      "Failed to add to Anki. Check extension popup for options.",
      "error",
    );
  }
}

// Check if Anki Connect is available
async function checkAnkiConnect() {
  try {
    const response = await fetch("http://localhost:8765", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "version",
        version: 6,
      }),
    });

    const result = await response.json();
    return !!result.result;
  } catch (error) {
    return false;
  }
}

// Send to Anki using Anki-Connect
async function sendToAnkiConnect(text, analysis) {
  // Get deck name from storage
  const data = await chrome.storage.sync.get("ankiDeck");
  const deckName = data.ankiDeck || "Default";

  // Create note
  const response = await fetch("http://localhost:8765", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "addNote",
      version: 6,
      params: {
        note: {
          deckName: deckName,
          modelName: "Basic",
          fields: {
            Front: text,
            Back: analysis,
          },
          options: {
            allowDuplicate: false,
          },
          tags: ["language-learning-assistant"],
        },
      },
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  // If we have an entry ID, mark it as added to Anki in history
  if (overlay.dataset.entryId) {
    const data = await chrome.storage.local.get("history");
    const history = data.history || [];

    const updatedHistory = history.map((entry) => {
      if (entry.id === overlay.dataset.entryId) {
        return { ...entry, addedToAnki: true };
      }
      return entry;
    });

    await chrome.storage.local.set({ history: updatedHistory });
  }

  return result;
}

// Mark entry for later Anki export
async function markForAnkiExport(text, analysis, entryId) {
  // If we don't have an entry ID (e.g., direct analysis not from history)
  // We need to handle this separately
  if (!entryId) {
    // This was a new analysis, so it should already be in history
    // Just find it and mark for export
    const data = await chrome.storage.local.get("history");
    const history = data.history || [];

    if (history.length > 0) {
      // Assume the first entry is the one we just added
      const updatedHistory = [
        { ...history[0], markedForAnkiExport: true },
        ...history.slice(1),
      ];

      await chrome.storage.local.set({ history: updatedHistory });
    }
  } else {
    // We have an entry ID, so update that specific entry
    const data = await chrome.storage.local.get("history");
    const history = data.history || [];

    const updatedHistory = history.map((entry) => {
      if (entry.id === entryId) {
        return { ...entry, markedForAnkiExport: true };
      }
      return entry;
    });

    await chrome.storage.local.set({ history: updatedHistory });
  }
}

// Copy analysis to clipboard
function copyAnalysis() {
  const text = overlay.dataset.currentText;
  const analysis = overlay.dataset.currentAnalysis;

  if (!text || !analysis) return;

  // Format for clipboard
  const clipboardText = `Original Text:
${text}

Analysis:
${analysis}`;

  navigator.clipboard
    .writeText(clipboardText)
    .then(() => {
      showTemporaryMessage("Copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy text: ", err);
      showTemporaryMessage("Failed to copy to clipboard", "error");
    });
}

// Show temporary message in the overlay
function showTemporaryMessage(message, type = "success") {
  const messageDiv = document.createElement("div");
  messageDiv.className = `temp-message ${type}`;
  messageDiv.textContent = message;

  // Add to overlay
  overlay.querySelector(".overlay-content").appendChild(messageDiv);

  // Remove after 3 seconds
  setTimeout(() => {
    messageDiv.remove();
  }, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Create overlay if it doesn't exist yet
  if (!overlay) {
    createOverlay();
  }

  switch (request.action) {
    case "showLoading":
      showLoading();
      break;
    case "showError":
      showError(request.error);
      break;
    case "displayResults":
      displayResults(request.text, request.analysis);
      // Store entry ID if provided
      if (request.entryId) {
        overlay.dataset.entryId = request.entryId;
      } else {
        delete overlay.dataset.entryId;
      }
      break;
    case "hideOverlay":
      hideOverlay();
      break;
  }

  return true;
});

// Listen for keyboard shortcut Esc to close overlay
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isOverlayVisible) {
    hideOverlay();
  }
});
