import { Utils } from './utils.js';

// --- DOM Element References ---
// It's often better to query these once in main.js and pass them around,
// but for simplicity in this refactoring step, we query them here.
const getElement = (id) => document.getElementById(id);

const fileListElement = getElement('file-list');
const fileContentEditor = getElement('file-content-editor');
const fileInfoElement = getElement('file-info');
const fileStatusElement = getElement('file-status');
const saveButton = getElement('btn-save-file');
const deleteButton = getElement('btn-delete-file');
const notificationsElement = getElement('notifications');
const currentPathElement = getElement('current-path');
const agentConfigDisplay = getElement('agent-config-display');
const agentConfigData = getElement('agent-config-data');
const chatHistoryElement = getElement('chat-history');
// const chatMessageInput = getElement('chat-message-input'); // Removed
const sendMessageButton = getElement('btn-send-message');

// --- UI Update Functions ---

/**
 * Displays a notification message at the top of the app.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'warning'} type - The type of notification.
 * @param {number} duration - How long to display the message in ms (0 for permanent).
 */
export function showNotification(message, type = 'success', duration = 3000) {
    if (!notificationsElement) return; // Guard against missing element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    // Clear previous notifications before adding a new one
    notificationsElement.innerHTML = '';
    notificationsElement.appendChild(notification);
    if (duration > 0) {
        setTimeout(() => {
            // Check if the notification still exists before removing
            if (notification.parentNode === notificationsElement) {
                notificationsElement.removeChild(notification);
            }
        }, duration);
    }
}

/**
 * Renders the list of files and directories in the sidebar.
 * @param {string} directory - The current directory path being displayed.
 * @param {Array<object>} items - Array of file/directory items from FileSystemAPI.listFiles.
 * @param {Function} onDirectoryClick - Callback function when a directory is clicked (receives path).
 * @param {Function} onFileClick - Callback function when a file is clicked (receives path).
 * @param {Function} [onDirectoryExpand] - Optional callback when a directory needs its contents loaded for expansion.
 */
export function renderFileList(directory, items, onDirectoryClick, onFileClick, onDirectoryExpand) {
    if (!fileListElement || !currentPathElement) return;

    currentPathElement.textContent = directory;
    fileListElement.innerHTML = ''; // Clear previous list

    if (items.length === 0) {
        fileListElement.innerHTML = '<li class="empty">Папка пуста</li>';
        return; // Exit early if the folder is empty
    }

    // Helper function to create and append list items recursively
    const createListItem = (item, parentElement, level = 0) => {
        const li = document.createElement('li');
        li.dataset.path = item.path;
        li.className = item.type; // 'file' or 'directory'
        li.title = item.path; // Show full path on hover
        li.style.paddingLeft = `${level * 15}px`; // Indentation for hierarchy

        const icon = document.createElement('span');
        icon.className = 'item-icon';
        // Basic icons (could be replaced with CSS background images or SVGs)
        icon.textContent = item.type === 'directory' ? '📁' : '📄';
        li.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = item.name;
        li.appendChild(text);

        if (item.type === 'directory') {
            // Add expand/collapse toggle for directories
            const toggle = document.createElement('span');
            toggle.className = 'toggle';
            toggle.textContent = '▶'; // Initially collapsed
            li.insertBefore(toggle, icon); // Place toggle before icon

            const subList = document.createElement('ul');
            subList.style.display = 'none'; // Initially hidden
            li.appendChild(subList);

            // Click on the main part of the directory item navigates into it
            li.addEventListener('click', (event) => {
                 // Prevent click on toggle from navigating
                 if (event.target !== toggle) {
                    onDirectoryClick(item.path);
                 }
            });

            // Click on the toggle expands/collapses
            toggle.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent li click handler
                const isExpanded = subList.style.display === 'block';
                if (isExpanded) {
                    subList.style.display = 'none';
                    toggle.textContent = '▶'; // Collapsed icon
                } else {
                    subList.style.display = 'block';
                    toggle.textContent = '▼'; // Expanded icon
                    // Load content if it hasn't been loaded yet and callback exists
                    if (subList.children.length === 0 && onDirectoryExpand) {
                         const loadingIndicator = document.createElement('li');
                         loadingIndicator.textContent = 'Загрузка...';
                         loadingIndicator.className = 'loading-subdir';
                         loadingIndicator.style.paddingLeft = `${(level + 1) * 15}px`;
                         subList.appendChild(loadingIndicator);
                         onDirectoryExpand(item.path, subList, level + 1); // Pass subList and next level
                    }
                }
            });

            // If the item has pre-loaded children, render them (optional)
            if (item.children && item.children.length > 0) {
                 item.children.forEach(child => createListItem(child, subList, level + 1));
                 // Optionally expand pre-loaded directories? For now, keep collapsed.
            }

        } else { // It's a file
            li.addEventListener('click', () => onFileClick(item.path));
        }

        parentElement.appendChild(li);
    };

    // Sort items: directories first, then files, alphabetically
    items.sort((a, b) => {
        if (a.type === b.type) {
            return a.name.localeCompare(b.name); // Sort alphabetically
        }
        return a.type === 'directory' ? -1 : 1; // Directories first
    });


    // Render top-level items
    items.forEach(item => createListItem(item, fileListElement, 0));
}

/**
 * Updates the file editor area with loaded content.
 * @param {object | null} fileData - The file data object from FileSystemAPI.getFile, or null if not found/cleared.
 */
export function updateEditorDisplay(fileData) {
    if (!fileContentEditor || !fileInfoElement || !saveButton || !deleteButton) return;

    if (fileData) {
        fileContentEditor.value = fileData.content; // Content is expected to be a string
        fileInfoElement.textContent = `Файл: ${fileData.name} (${Utils.formatTimestamp(fileData.timestamp)})`;
        // saveButton.disabled = true; // State managed by updateButtonStates
        // deleteButton.disabled = false; // State managed by updateButtonStates
        fileContentEditor.disabled = false;
        updateFileStatus(`Загружено: ${Utils.formatTimestamp(fileData.timestamp)}`);
    } else {
        // Clear the editor
        fileContentEditor.value = '';
        fileInfoElement.textContent = 'Выберите файл для просмотра или введите сообщение'; // Updated placeholder text
        // saveButton.disabled = true; // State managed by updateButtonStates
        // deleteButton.disabled = true; // State managed by updateButtonStates
        fileContentEditor.disabled = false; // Keep editor enabled even when no file is selected
        updateFileStatus('');
    }
    // Button states are now managed externally by main.js calling updateButtonStates
}

/**
 * Clears the editor and associated state display.
 */
export function clearEditor() {
    updateEditorDisplay(null); // Use the update function with null data
    // Also clear agent config display if it's separate logic
    if (agentConfigDisplay) agentConfigDisplay.style.display = 'none';
    // Disable chat input if editor is cleared (handled in main logic based on file type)
}

/**
 * Updates the status message below the editor.
 * @param {string} statusText - The text to display.
 */
export function updateFileStatus(statusText) {
    if (fileStatusElement) {
        fileStatusElement.textContent = statusText;
    }
}

/**
 * Marks the editor as having unsaved changes.
 */
export function markEditorDirty() {
    if (saveButton && !saveButton.disabled) { // Only mark if a file is loaded
         updateFileStatus('Несохраненные изменения');
         // The actual 'isDirty' flag should be managed in the main state
    }
}

/**
 * Displays the configuration of the currently active agent.
 * @param {object | null} agentConfig - The parsed agent configuration object, or null to hide.
 * @param {string} [errorMessage] - Optional error message if parsing failed.
 */
export function displayAgentConfig(agentConfig, errorMessage) {
    if (!agentConfigDisplay || !agentConfigData) return;

    if (agentConfig) {
        try {
            agentConfigData.textContent = JSON.stringify(agentConfig, null, 2);
            agentConfigDisplay.style.display = 'block';
            if (errorMessage) { // Show error within the block if config is present but flawed
                 agentConfigData.textContent += `\n\nОшибка: ${errorMessage}`;
            }
        } catch (e) {
             agentConfigData.textContent = `Ошибка отображения конфигурации: ${e.message}`;
             agentConfigDisplay.style.display = 'block';
        }
    } else if (errorMessage) {
        // Config is null, but there was an error loading/parsing it
        agentConfigData.textContent = `Ошибка загрузки конфигурации: ${errorMessage}`;
        agentConfigDisplay.style.display = 'block';
    }
     else {
        // Hide if config is null and no error
        agentConfigDisplay.style.display = 'none';
        agentConfigData.textContent = '';
    }
}

/**
 * Renders a single chat message in the chat history.
 * @param {object} message - The message object { sender: 'user'|'agent'|'error', text: string, timestamp?: number }.
 * @param {string} [agentName='Агент'] - The name to display for the agent.
 */
export function renderChatMessage(message, agentName = 'Агент') {
    if (!chatHistoryElement) return;

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', message.sender); // sender: 'user', 'agent', or 'error'

    const senderSpan = document.createElement('div');
    senderSpan.classList.add('sender');
    senderSpan.textContent = message.sender === 'user' ? 'Вы' : (message.sender === 'agent' ? agentName : 'Система');

    const textNode = document.createElement('div');
    // Basic sanitization: replace < and > to prevent HTML injection
    // A more robust library like DOMPurify is recommended for production
    textNode.textContent = message.text; //.replace(/</g, "<").replace(/>/g, ">");

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textNode);

    if (message.timestamp) {
        const timeSpan = document.createElement('div');
        timeSpan.classList.add('timestamp');
        timeSpan.textContent = Utils.formatTimestamp(message.timestamp);
        msgDiv.appendChild(timeSpan);
    }

    chatHistoryElement.appendChild(msgDiv);
}

/**
 * Clears the chat history display.
 */
export function clearChatHistory() {
    if (chatHistoryElement) {
        chatHistoryElement.innerHTML = '';
    }
}

/**
 * Scrolls the chat history to the bottom.
 */
export function scrollChatHistory() {
    if (chatHistoryElement) {
        chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
    }
}

/**
 */
// export function setChatInputEnabled(enabled) { // Removed - No longer needed
//     // if (chatMessageInput) chatMessageInput.disabled = !enabled; // Removed
//     if (sendMessageButton) sendMessageButton.disabled = !enabled;
// }

/**
 * Updates the enabled/disabled state of action buttons based on context.
 * Called from main.js after state changes.
 * @param {string | null} selectedFilePath - The path of the currently selected file, or null.
 * @param {boolean} isEditorDirty - Whether the editor has unsaved changes (for non-chat files).
 * @param {boolean} hasContent - Whether the editor textarea has any text content.
 */
export function updateButtonStates(selectedFilePath, isEditorDirty, hasContent) {
    const isFileSelected = !!selectedFilePath;
    const isChatFile = isFileSelected && Utils.getDirectory(selectedFilePath) === '/chats/' && selectedFilePath.endsWith('.json');
    const isBackupFile = isFileSelected && Utils.getDirectory(selectedFilePath) === '/backup/';
    const isJsFile = isFileSelected && Utils.getDirectory(selectedFilePath) === '/js/' && selectedFilePath.endsWith('.js');

    if (saveButton) {
        // Enable Save only if: a file is selected, it's NOT a chat file, NOT a backup file, and it's dirty.
        saveButton.disabled = !(isFileSelected && !isChatFile && !isBackupFile && isEditorDirty);
        // Add tooltip for JS files warning about refresh
        if (isJsFile) {
            saveButton.title = 'Сохранить (потребуется перезагрузка F5)';
        } else {
            saveButton.title = 'Сохранить изменения в файле';
        }
    }

    if (sendMessageButton) {
        // Enable Send only if there is content in the editor.
        sendMessageButton.disabled = !hasContent;
    }

    if (deleteButton) {
        // Enable Delete only if: a file is selected and it's NOT a backup file.
        deleteButton.disabled = !(isFileSelected && !isBackupFile);
    }
}


/**
 * Sets the loading state for the file list.
 * @param {boolean} isLoading - True to show loading, false to remove.
 * @param {string} [message='Загрузка...'] - Message to display while loading.
 */
export function setFileListLoading(isLoading, message = 'Загрузка...') {
     if (!fileListElement) return;
     if (isLoading) {
         fileListElement.innerHTML = `<li class="loading">${message}</li>`;
     } else {
         // If the list is currently showing only the loading message, clear it.
         // Otherwise, assume renderFileList will populate it correctly.
         const loadingLi = fileListElement.querySelector('li.loading');
         if (loadingLi && fileListElement.children.length === 1) {
             fileListElement.innerHTML = '';
         }
     }
}
