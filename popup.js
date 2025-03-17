document.addEventListener("DOMContentLoaded", function () {
  // Tab switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;

      // Update active tab button
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Show target tab pane
      tabPanes.forEach((pane) => {
        pane.classList.remove("active");
        if (pane.id === targetTab) {
          pane.classList.add("active");

          // Load specific tab content if needed
          if (targetTab === "history") {
            loadHistoryItems();
          } else if (targetTab === "anki") {
            checkAnkiConnectStatus();
            updateMarkedCount();
          }
        }
      });
    });
  });

  // Settings form
  const settingsForm = document.getElementById("settings-form");
  const apiKeyInput = document.getElementById("api-key");
  const ankiDeckInput = document.getElementById("anki-deck");

  // Load saved settings
  chrome.storage.sync.get(["apiKey", "ankiDeck"], function (data) {
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }

    if (data.ankiDeck) {
      ankiDeckInput.value = data.ankiDeck;
    } else {
      ankiDeckInput.value = "Default";
    }
  });

  // Save settings
  settingsForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const ankiDeck = ankiDeckInput.value.trim() || "Default";

    chrome.storage.sync.set(
      {
        apiKey: apiKey,
        ankiDeck: ankiDeck,
      },
      function () {
        showNotification("Settings saved successfully!");
      },
    );
  });

  // History search
  const historySearch = document.getElementById("history-search");
  historySearch.addEventListener("input", function () {
    loadHistoryItems(historySearch.value.trim().toLowerCase());
  });

  // Clear history
  const clearHistoryBtn = document.getElementById("clear-history");
  clearHistoryBtn.addEventListener("click", function () {
    if (
      confirm(
        "Are you sure you want to clear all history? This cannot be undone.",
      )
    ) {
      chrome.storage.local.set({ history: [] }, function () {
        loadHistoryItems();
        showNotification("History cleared");
      });
    }
  });

  // Export to Anki (CSV)
  const exportAnkiBtn = document.getElementById("export-anki");
  exportAnkiBtn.addEventListener("click", function () {
    exportToCSV();
  });

  // Initialize tabs
  loadHistoryItems();
  checkAnkiConnectStatus();
  updateMarkedCount();
});

// Load history items
function loadHistoryItems(searchQuery = "") {
  const historyList = document.getElementById("history-list");
  const template = document.getElementById("history-item-template");
  const emptyState = document.querySelector(".empty-state");

  chrome.storage.local.get("history", function (data) {
    const history = data.history || [];

    // Clear the list
    historyList.innerHTML = "";

    if (history.length === 0) {
      historyList.appendChild(emptyState.cloneNode(true));
      return;
    }

    // Filter by search query if provided
    const filteredHistory = searchQuery
      ? history.filter(
          (item) =>
            item.text.toLowerCase().includes(searchQuery) ||
            item.analysis.toLowerCase().includes(searchQuery),
        )
      : history;

    if (filteredHistory.length === 0) {
      const noResults = document.createElement("div");
      noResults.className = "empty-state";
      noResults.innerHTML = "<p>No results found for your search.</p>";
      historyList.appendChild(noResults);
      return;
    }

    // Add history items
    filteredHistory.forEach((item) => {
      const clone = document.importNode(template.content, true);

      // Truncate text if too long
      const truncatedText =
        item.text.length > 30 ? item.text.substring(0, 30) + "..." : item.text;

      clone.querySelector(".history-text").textContent = truncatedText;

      // Format date
      const date = new Date(item.timestamp);
      const formattedDate =
        date.toLocaleDateString() + " " + date.toLocaleTimeString();
      clone.querySelector(".history-date").textContent = formattedDate;

      // Update mark for Anki button
      const markForAnkiBtn = clone.querySelector(".mark-for-anki");
      if (item.addedToAnki || item.markedForAnkiExport) {
        markForAnkiBtn.textContent = "Added to Anki";
        markForAnkiBtn.disabled = true;
      }

      // Set up event listeners
      clone.querySelector(".view-analysis").addEventListener("click", () => {
        viewAnalysis(item);
      });

      markForAnkiBtn.addEventListener("click", () => {
        markForAnkiExport(item.id);
      });

      clone.querySelector(".delete-entry").addEventListener("click", () => {
        deleteHistoryEntry(item.id);
      });

      historyList.appendChild(clone);
    });
  });
}

// View analysis in the content script overlay
function viewAnalysis(item) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "displayResults",
      text: item.text,
      analysis: item.analysis,
      entryId: item.id,
    });

    // Close the popup
    window.close();
  });
}

// Mark an entry for Anki export
function markForAnkiExport(entryId) {
  chrome.storage.local.get("history", function (data) {
    const history = data.history || [];

    const updatedHistory = history.map((entry) => {
      if (entry.id === entryId) {
        return { ...entry, markedForAnkiExport: true };
      }
      return entry;
    });

    chrome.storage.local.set({ history: updatedHistory }, function () {
      updateMarkedCount();
      loadHistoryItems();
      showNotification("Marked for Anki export");
    });
  });
}

// Delete history entry
function deleteHistoryEntry(entryId) {
  chrome.storage.local.get("history", function (data) {
    const history = data.history || [];

    const updatedHistory = history.filter((entry) => entry.id !== entryId);

    chrome.storage.local.set({ history: updatedHistory }, function () {
      loadHistoryItems();
      updateMarkedCount();
      showNotification("Entry deleted");
    });
  });
}

// Check AnkiConnect status
function checkAnkiConnectStatus() {
  const statusElement = document.getElementById("anki-connect-status");

  fetch("http://localhost:8765", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "version",
      version: 6,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.result) {
        statusElement.textContent = "Connected";
        statusElement.className = "connected";
      } else {
        throw new Error("AnkiConnect returned an error");
      }
    })
    .catch((error) => {
      statusElement.textContent = "Not connected";
      statusElement.className = "disconnected";
    });
}

// Update marked for export count
function updateMarkedCount() {
  const markedCountElement = document.getElementById("marked-count");
  const exportButton = document.getElementById("export-anki");

  chrome.storage.local.get("history", function (data) {
    const history = data.history || [];

    const markedCount = history.filter(
      (item) => item.markedForAnkiExport && !item.addedToAnki,
    ).length;

    markedCountElement.textContent = markedCount;

    if (markedCount > 0) {
      exportButton.disabled = false;
    } else {
      exportButton.disabled = true;
    }
  });
}

// Export to CSV
function exportToCSV() {
  chrome.storage.local.get("history", function (data) {
    const history = data.history || [];

    const markedEntries = history.filter(
      (item) => item.markedForAnkiExport && !item.addedToAnki,
    );

    if (markedEntries.length === 0) {
      showNotification("No entries to export");
      return;
    }

    // Create CSV content
    let csvContent = "front,back\n";

    markedEntries.forEach((item) => {
      // Escape and sanitize the content
      const front = `"${item.text.replace(/"/g, '""')}"`;
      const back = `"${item.analysis.replace(/"/g, '""')}"`;

      csvContent += `${front},${back}\n`;
    });

    // Create a download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.setAttribute("href", url);
    link.setAttribute("download", "anki_language_learning_export.csv");
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Mark as exported
    const updatedHistory = history.map((item) => {
      if (item.markedForAnkiExport && !item.addedToAnki) {
        return { ...item, addedToAnki: true };
      }
      return item;
    });

    chrome.storage.local.set({ history: updatedHistory }, function () {
      updateMarkedCount();
      showNotification("Exported successfully");
    });
  });
}

// Show notification
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;

  document.body.appendChild(notification);

  // Fade in
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// Add notification styles
const style = document.createElement("style");
style.textContent = `
  .notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #4a67e8;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s;
  }
  
  .notification.show {
    opacity: 1;
  }
`;
document.head.appendChild(style);
