import { Utils } from './utils.js';
import { FileSystemAPI } from './fileSystemAPI.js';
import * as UI from './ui.js';

// --- Chat State ---
let currentChatFile = null; // { filePath: string, messages: Array<object> }
let activeAgentConfig = null; // Keep track of the agent config for API calls

// --- Chat Functions ---

/**
 * Loads chat history from a file data object.
 * @param {object} chatFileData - File data object from FileSystemAPI.
 * @returns {boolean} - True if chat loaded successfully, false otherwise.
 */
export function loadChat(chatFileData) {
    console.log("Chat: Loading chat:", chatFileData.filePath);
    UI.clearChatHistory();
    try {
        const chatData = JSON.parse(chatFileData.content);
        if (!chatData || !Array.isArray(chatData.messages)) {
            throw new Error("Invalid chat file format.");
        }
        // Store a copy of messages to avoid direct mutation issues if needed elsewhere
        currentChatFile = { filePath: chatFileData.filePath, messages: [...chatData.messages] };

        // Render existing messages
        currentChatFile.messages.forEach(msg => UI.renderChatMessage(msg, activeAgentConfig?.name));
        UI.scrollChatHistory();
        // UI.setChatInputEnabled(true); // Removed - Handled by main.js calling UI.updateButtonStates
        return true;
    } catch (error) {
        console.error("Chat: Error loading chat:", error);
        UI.showNotification(`Error loading chat: ${error.message}`, 'error');
        UI.renderChatMessage({ sender: 'error', text: `Error loading chat history ${Utils.getFileName(chatFileData.filePath)}.` });
        currentChatFile = null;
        // UI.setChatInputEnabled(false); // Removed - Handled by main.js calling UI.updateButtonStates
        return false;
    }
}

/**
 * Clears the current chat state.
 */
export function clearCurrentChat() {
    currentChatFile = null;
    // UI.clearChatHistory(); // Usually called by loadChat or clearEditor
    // UI.setChatInputEnabled(false); // Removed - UI state managed by main.js calling UI.updateButtonStates
}

/**
 * Sets the active agent configuration for use in API calls.
 * @param {object | null} config - The parsed agent configuration object.
 */
export function setActiveAgentConfig(config) {
    activeAgentConfig = config;
    console.log("Chat: Active agent config set:", activeAgentConfig);
    // Re-render existing messages if agent name changed? Optional.
    // If chat history is visible, might want to update sender names.
}

/**
 * Sends a message typed by the user and fetches the agent's response.
 * @param {string} messageText - The user's message.
 * @param {string} apiKey - The VseGPT API key.
 * @param {string} chatFilePath - The path to the chat file to update.
 */
export async function sendMessage(messageText, apiKey, chatFilePath) {
    if (!messageText) return;
    // if (!currentChatFile) { UI.showNotification("Please select a chat file.", 'error'); return; } // Path is now guaranteed by main.js
    if (!chatFilePath || !chatFilePath.startsWith('/chats/')) {
        UI.showNotification("Internal Error: Invalid chat file path provided for sending.", 'error');
        console.error("Chat: sendMessage called with invalid path:", chatFilePath);
        return;
    }
    // --- VseGPT API Key Check and Prompt ---
    if (!apiKey) {
        const enteredKey = prompt("Please enter your VseGPT API key:");
        if (enteredKey && enteredKey.trim() !== '') {
            const secretsPath = '/secrets/api_keys.json';
            try {
                let secretsData = {};
                try {
                    // Attempt to read existing secrets file
                    const existingSecretsFile = await FileSystemAPI.getFile(secretsPath);
                    secretsData = JSON.parse(existingSecretsFile.content);
                } catch (readError) {
                    // Ignore error if file doesn't exist (ENOENT), otherwise log
                    if (readError.code !== 'ENOENT') {
                        console.warn(`Chat: Error reading secrets file at ${secretsPath}, creating new one.`, readError);
                    }
                    // File doesn't exist or is invalid, start with empty object
                    secretsData = {};
                }

                // Update the key
                secretsData.vsegpt = enteredKey.trim();

                // Save back to the virtual file system
                await FileSystemAPI.saveFile(secretsPath, JSON.stringify(secretsData, null, 2));
                UI.showNotification("VseGPT API Key saved. Please try sending your message again.", 'success', 3000);

            } catch (saveError) {
                console.error(`Chat: Failed to save API key to ${secretsPath}:`, saveError);
                UI.showNotification(`Error saving API key: ${saveError.message}`, 'error');
            }
        } else {
             // User cancelled or entered empty key
             UI.showNotification("API key entry cancelled or empty.", 'warning', 2000);
        }
        // Always return after prompting, user needs to resubmit the message
        // for the newly saved key to be picked up (in main.js presumably).
        return;
    }
    // --- Agent Config Check ---
    if (!activeAgentConfig || !activeAgentConfig.configurations?.model) {
        UI.showNotification("Please load an agent configuration with a model specified (e.g., /agents/example-agent.json).", 'error');
        return;
    }

    // UI.setChatInputEnabled(false); // Removed - Handled by main.js calling UI.updateButtonStates before calling sendMessage

    // Ensure currentChatFile corresponds to the path we're working with
    // This might be redundant if main.js always calls handleLoadFile first, but safer
    if (!currentChatFile || currentChatFile.filePath !== chatFilePath) {
        console.warn(`Chat: sendMessage - currentChatFile (${currentChatFile?.filePath}) doesn't match chatFilePath (${chatFilePath}). Attempting to reload.`);
        try {
            const fileData = await FileSystemAPI.getFile(chatFilePath);
            if (!loadChat(fileData)) { // loadChat returns false on error
                throw new Error("Failed to reload chat file before sending.");
            }
        } catch (reloadError) {
            console.error("Chat: Error reloading chat file before sending:", reloadError);
            UI.showNotification(`Ошибка перезагрузки чата ${Utils.getFileName(chatFilePath)} перед отправкой.`, 'error');
            // UI.setChatInputEnabled(true); // Removed - Handled by main.js calling UI.updateButtonStates in finally block
            return; // Stop processing
        }
    }

    // 1. Display user message immediately
    const userMessage = { sender: 'user', text: messageText, timestamp: Date.now() };
    // Add to the in-memory state
    currentChatFile.messages.push(userMessage);
    // Render in UI
    UI.renderChatMessage(userMessage, activeAgentConfig?.name); // Pass agent name for consistency
    UI.scrollChatHistory();

    // 2. Prepare API request
    const apiEndpoint = "https://api.vsegpt.ru/v1/chat/completions";
    const model = activeAgentConfig.configurations.model;
    const temperature = activeAgentConfig.configurations.temperature ?? 0.7;
    const max_tokens = activeAgentConfig.configurations.max_tokens ?? 1000;

    // Prepare message history for API (user/assistant roles)
    const apiMessages = [];
    // Add system prompt if defined in config (optional)
    // if (activeAgentConfig.configurations.system_prompt) {
    //     apiMessages.push({ role: "system", content: activeAgentConfig.configurations.system_prompt });
    // }
    // Add recent messages (limit history length to avoid large requests)
    // Use the potentially updated currentChatFile.messages
    const historyToSend = currentChatFile.messages.slice(-10); // Example: last 10 messages
    historyToSend.forEach(msg => {
        if (msg.sender === 'user' || msg.sender === 'agent') { // Ignore 'error' messages
            apiMessages.push({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text });
        }
    });

    const requestBody = {
        model: model,
        messages: apiMessages,
        temperature: temperature,
        n: 1,
        max_tokens: max_tokens,
    };

    console.log("Chat: API Request Body:", JSON.stringify(requestBody, null, 2));
    UI.showNotification("Sending request to AI...", "success", 1500);

    try {
        // 3. Make API call
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'X-Title': "SmartAssistantModular" // Identify the app
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorData = null;
            try { errorData = await response.json(); } catch (e) { /* Ignore if error body is not JSON */ }
            console.error("Chat: API Error Response:", errorData);
            throw new Error(`API Error: ${response.status} ${response.statusText}. ${errorData?.error?.message || ''}`);
        }

        const responseData = await response.json();
        console.log("Chat: API Response:", responseData);

        const agentResponseText = responseData.choices?.[0]?.message?.content?.trim();

        if (!agentResponseText) {
            throw new Error("API returned an empty response.");
        }

        // 4. Display agent response
        const agentMessage = { sender: 'agent', text: agentResponseText, timestamp: Date.now() };
        // Add to in-memory state
        currentChatFile.messages.push(agentMessage);
        // Render in UI
        UI.renderChatMessage(agentMessage, activeAgentConfig?.name);

    } catch (error) {
        console.error("Chat: Error calling API:", error);
        const errorMessage = { sender: 'error', text: `Error: ${error.message}`, timestamp: Date.now() };
        // Add error to in-memory chat history for context
        if (currentChatFile) { // Ensure currentChatFile exists before pushing error
             currentChatFile.messages.push(errorMessage);
        }
        // Render error in UI
        UI.renderChatMessage(errorMessage);
        UI.showNotification(`API Error: ${error.message}`, 'error', 5000);
    } finally {
        UI.scrollChatHistory();
        // UI.setChatInputEnabled(true); // Removed - Handled by main.js calling UI.updateButtonStates after sendMessage completes

        // 5. Save updated chat history (even if there was an error)
        // Pass the specific chatFilePath to ensure the correct file is saved
        if (currentChatFile) { // Only save if chat state is valid
             await saveCurrentChat(chatFilePath);
        }
    }
}

/**
 * Saves the current chat history back to the file system.
 * @param {string} chatFilePath - The specific path of the chat file to save.
 */
async function saveCurrentChat(chatFilePath) {
    // Ensure the path provided matches the in-memory chat file path if it exists
    if (!currentChatFile || currentChatFile.filePath !== chatFilePath) {
         console.warn(`Chat: saveCurrentChat called with path ${chatFilePath} but currentChatFile is ${currentChatFile?.filePath}. Saving based on provided path.`);
         // If currentChatFile is mismatched, we might be saving stale data if the API call failed
         // before updating currentChatFile.messages. This scenario needs careful handling.
         // For now, we proceed but log a warning. A robust solution might involve
         // passing the messages to save as an argument too.
         if (!currentChatFile) {
             console.error("Chat: Cannot save chat - currentChatFile state is missing.");
             UI.showNotification("Ошибка: Не удалось сохранить чат, внутреннее состояние потеряно.", 'error');
             return;
         }
    }

    console.log(`Chat: Saving chat: ${chatFilePath}`);
    try {
        const chatDataToSave = {
            // Derive ID from the filename being saved
            id: Utils.getFileName(chatFilePath).replace('.json', '') || Utils.generateId(),
            messages: currentChatFile.messages // Save the potentially updated message history from memory
        };

        // Use FileSystemAPI to save.
        await FileSystemAPI.saveFile(chatFilePath, JSON.stringify(chatDataToSave, null, 2)); // Ensure JSON stringification
        console.log(`Chat: ${chatFilePath} saved successfully.`);
        // Optionally update editor if this chat file is currently open there
        // This requires coordination with the main module state.
    } catch (error) {
        console.error(`Chat: Error saving chat ${chatFilePath}:`, error);
        UI.showNotification(`Error saving chat: ${error.message}`, 'error');
        // Decide if the error is critical enough to stop the user
    }
}

/**
 * Checks if a chat file is currently loaded.
 * @returns {boolean}
 */
export function isChatLoaded() {
    return currentChatFile !== null;
}

/**
 * Gets the currently active agent configuration.
 * @returns {object | null} The active agent config object or null.
 */
export function getActiveAgentConfig() {
    return activeAgentConfig;
}
