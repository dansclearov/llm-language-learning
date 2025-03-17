// Set up context menu item for right-click functionality
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyzeText",
    title: "Analyze for Language Learning",
    contexts: ["selection"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeText" && info.selectionText) {
    analyzeText(info.selectionText, tab.id);
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "analyze-text") {
    // Get selected text from the active tab
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        function: getSelectedText,
      },
      (results) => {
        if (results && results[0] && results[0].result) {
          analyzeText(results[0].result, tab.id);
        }
      },
    );
  }
});

// Function to get selected text
function getSelectedText() {
  return window.getSelection().toString().trim();
}

// Function to analyze text using LLM API
async function analyzeText(text, tabId) {
  if (!text || text.length === 0) {
    return;
  }

  try {
    // Show loading indicator
    chrome.tabs.sendMessage(tabId, {
      action: "showLoading",
    });

    // Call the LLM API for analysis
    const analysis = await callLLMApi(text);

    // Save to history
    saveToHistory(text, analysis);

    // Send results to content script to display
    chrome.tabs.sendMessage(tabId, {
      action: "displayResults",
      text: text,
      analysis: analysis,
    });
  } catch (error) {
    console.error("Error analyzing text:", error);
    chrome.tabs.sendMessage(tabId, {
      action: "showError",
      error: "Failed to analyze text. Please try again.",
    });
  }
}

// Function to call the LLM API
async function callLLMApi(text) {
  // Get API key from storage
  const data = await chrome.storage.sync.get("apiKey");
  const apiKey = data.apiKey;

  if (!apiKey) {
    throw new Error(
      "API key not set. Please set your API key in the extension settings.",
    );
  }

  // Example using OpenAI API - replace with your preferred LLM API
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a language learning assistant. Provide a concise analysis of the text focusing on: grammar points, cultural context if relevant. Format the response with clear sections.",
        },
        {
          role: "user",
          content: `Analyze the following text for language learning: "${text}"`,
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

// Function to save to history
async function saveToHistory(text, analysis) {
  const timestamp = new Date().toISOString();
  const newEntry = {
    id: Date.now().toString(),
    text: text,
    analysis: analysis,
    timestamp: timestamp,
    addedToAnki: false,
  };

  // Get existing history
  const data = await chrome.storage.local.get("history");
  const history = data.history || [];

  // Add new entry at the beginning
  history.unshift(newEntry);

  // Limit history to 100 entries
  if (history.length > 100) {
    history.pop();
  }

  // Save updated history
  await chrome.storage.local.set({ history: history });
}
