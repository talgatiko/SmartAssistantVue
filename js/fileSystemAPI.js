import { DBManager } from './dbManager.js';
import { Utils } from './utils.js';

// ----------------------------------------------------------------------
// --- FileSystem API (Interaction with DB) ---
// ----------------------------------------------------------------------
export const FileSystemAPI = (() => {

    // Helper to ensure DB is open, reducing boilerplate in each function
    async function getOpenDB() {
        try {
            const db = await DBManager.openDB();
            if (!db) throw new Error("Database connection not available.");
            return db;
        } catch (error) {
            console.error("API: Error accessing DB:", error);
            throw error; // Re-throw to be handled by the caller
        }
    }

    /** Lists files and directories within a given directory */
    async function listFiles(directory) {
        if (!directory.endsWith('/')) directory += '/';
        if (directory === '//') directory = '/'; // Normalize root path
        console.log(`API: listFiles for ${directory}`);
        const db = await getOpenDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DBManager.STORE_NAME, 'readonly');
            const store = transaction.objectStore(DBManager.STORE_NAME);
            const getAllRequest = store.getAll(); // More efficient than iterating with a cursor for this case
            const items = new Map(); // Use Map to easily handle unique directories

            getAllRequest.onsuccess = (event) => {
                const allFiles = event.target.result;
                allFiles.forEach(file => {
                    const fileDir = file.directory; // e.g., /chats/
                    const filePath = file.filePath; // e.g., /chats/mychat.json

                    // 1. Files directly in the requested directory
                    if (fileDir === directory) {
                        items.set(filePath, { name: file.name, type: 'file', path: filePath });
                    }
                    // 2. Subdirectories within the requested directory
                    else if (fileDir.startsWith(directory) && fileDir !== directory) {
                        // Extract the first-level subdirectory name
                        const relativePath = fileDir.substring(directory.length); // e.g., subdir1/subdir2/
                        const dirName = relativePath.split('/')[0]; // e.g., subdir1
                        if (dirName) {
                            const dirPath = `${directory}${dirName}/`;
                            if (!items.has(dirPath)) { // Add only once
                                items.set(dirPath, { name: dirName, type: 'directory', path: dirPath });
                            }
                        }
                    }
                });

                // Convert Map values to array and sort (directories first, then alphabetically)
                const sortedItems = Array.from(items.values()).sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; // Directories first
                    return a.name.localeCompare(b.name); // Then sort by name
                });
                resolve(sortedItems);
            };

            getAllRequest.onerror = (event) => {
                console.error(`API: Error listFiles ${directory}:`, event.target.error);
                reject(`Error reading file list: ${event.target.error}`);
            };
        });
    }

    /** Retrieves a single file's data */
    async function getFile(filePath) {
        console.log(`API: getFile ${filePath}`);
        const db = await getOpenDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DBManager.STORE_NAME, 'readonly');
            const store = transaction.objectStore(DBManager.STORE_NAME);
            const request = store.get(filePath);

            request.onsuccess = (event) => {
                const fileData = event.target.result;
                // Note: Decryption logic would go here if implemented
                resolve(fileData || null); // Return null if not found
            };

            request.onerror = (event) => {
                console.error(`API: Error getFile ${filePath}:`, event.target.error);
                reject(`Error getting file: ${event.target.error}`);
            };
        });
    }

    /** Saves a file (creates or updates), including backup logic */
    async function saveFile(filePath, content) {
        console.log(`API: saveFile ${filePath}`);
        const db = await getOpenDB();
        const directory = Utils.getDirectory(filePath);
        const name = Utils.getFileName(filePath);
        const timestamp = Date.now();

        // Ensure content is a string before saving
        const processedContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        const fileData = { filePath, directory, name, content: processedContent, timestamp };

        return new Promise(async (resolve, reject) => {
            let existingFile = null;
            try {
                existingFile = await getFile(filePath); // Check if file exists and get its current content
            } catch (e) {
                // Ignore error if file simply doesn't exist yet
                console.warn(`API: Could not fetch existing file ${filePath} before save (may be new):`, e);
            }

            const performSaveTransaction = () => {
                return new Promise((res, rej) => {
                    const transaction = db.transaction(DBManager.STORE_NAME, 'readwrite');
                    const store = transaction.objectStore(DBManager.STORE_NAME);
                    const saveRequest = store.put(fileData); // put handles both create and update

                    transaction.oncomplete = () => {
                        console.log(`API: File ${filePath} saved successfully.`);
                        resolve(fileData); // Resolve the outer promise with the saved data
                    };
                    transaction.onerror = (event) => {
                        console.error(`API: Error in save transaction for ${filePath}:`, event.target.error);
                        reject(`Save transaction error: ${event.target.error}`); // Reject the outer promise
                    };
                });
            };

            // Backup logic: only if file exists, content changed, and not in /backup/
            if (existingFile && existingFile.content !== fileData.content && directory !== '/backup/') {
                console.log(`API: Content changed for ${filePath}, creating backup...`);
                const backupPath = Utils.createBackupPath(existingFile);
                // Copy existing data for backup, ensuring content is string
                const backupData = {
                    ...existingFile,
                    filePath: backupPath,
                    directory: '/backup/',
                    name: Utils.getFileName(backupPath),
                    timestamp: Date.now(), // Backup timestamp
                    content: typeof existingFile.content === 'string' ? existingFile.content : JSON.stringify(existingFile.content, null, 2)
                 };

                const backupTransaction = db.transaction(DBManager.STORE_NAME, 'readwrite');
                backupTransaction.objectStore(DBManager.STORE_NAME).put(backupData);

                backupTransaction.oncomplete = () => {
                    console.log(`API: Backup created: ${backupPath}`);
                    performSaveTransaction().catch(reject); // Proceed to save original, handle potential save error
                };
                backupTransaction.onerror = (event) => {
                    console.error(`API: Error creating backup for ${filePath}:`, event.target.error);
                    // Still attempt to save the original file even if backup fails
                    showNotification(`Warning: Failed to create backup for ${filePath}. Proceeding with save.`, 'warning', 5000); // Assuming showNotification is globally available or passed in
                    performSaveTransaction().catch(reject);
                };
            } else {
                // No backup needed (new file, no changes, or already in /backup/)
                performSaveTransaction().catch(reject);
            }
        });
    }

    /** Deletes a file, including backup logic */
    async function deleteFile(filePath) {
        console.log(`API: deleteFile ${filePath}`);
        const db = await getOpenDB();

        return new Promise(async (resolve, reject) => {
            let fileToBackup = null;
            try {
                fileToBackup = await getFile(filePath);
            } catch (e) {
                console.warn(`API: Could not fetch file ${filePath} before delete (may not exist):`, e);
            }

            const performDeleteTransaction = () => {
                return new Promise((res, rej) => {
                    const transaction = db.transaction(DBManager.STORE_NAME, 'readwrite');
                    transaction.objectStore(DBManager.STORE_NAME).delete(filePath);
                    transaction.oncomplete = () => { console.log(`API: File ${filePath} deleted.`); resolve(); }; // Resolve outer promise
                    transaction.onerror = (event) => { console.error(`API: Error deleting ${filePath}:`, event.target.error); reject(`Delete error: ${event.target.error}`); }; // Reject outer promise
                });
            };

            // Backup logic: only if file exists and not in /backup/
            if (fileToBackup && Utils.getDirectory(filePath) !== '/backup/') {
                console.log(`API: Creating backup before deleting ${filePath}...`);
                const backupPath = Utils.createBackupPath(fileToBackup);
                 const backupData = {
                    ...fileToBackup,
                    filePath: backupPath,
                    directory: '/backup/',
                    name: Utils.getFileName(backupPath),
                    timestamp: Date.now(),
                    content: typeof fileToBackup.content === 'string' ? fileToBackup.content : JSON.stringify(fileToBackup.content, null, 2)
                 };

                const backupTransaction = db.transaction(DBManager.STORE_NAME, 'readwrite');
                backupTransaction.objectStore(DBManager.STORE_NAME).put(backupData);

                backupTransaction.oncomplete = () => {
                    console.log(`API: Backup before delete created: ${backupPath}`);
                    performDeleteTransaction().catch(reject); // Proceed to delete original
                };
                backupTransaction.onerror = (event) => {
                    console.error(`API: Error creating backup before delete for ${filePath}:`, event.target.error);
                    showNotification(`Warning: Failed to create backup for ${filePath}. Proceeding with delete.`, 'warning', 5000);
                    performDeleteTransaction().catch(reject); // Still attempt delete
                };
            } else {
                 if(Utils.getDirectory(filePath) ==='/backup/'){
                       console.log(`API: Deleting file from backup ${filePath} (no backup of backup).`);
                  } else {
                       console.log(`API: File ${filePath} not found or in /backup/, no backup created before delete.`);
                  }
                performDeleteTransaction().catch(reject); // No backup needed or possible
            }
        });
    }

    // Expose public methods
    return { openDB: getOpenDB, listFiles, getFile, saveFile, deleteFile };
})();

// Temporary placeholder for showNotification until UI module is created
// In a real scenario, this dependency should be handled properly (e.g., event bus, dependency injection)
function showNotification(message, type, duration) {
    console.log(`[Notification (${type})] ${message}`);
    // In the final structure, this function will be imported from ui.js or similar
    const notificationsElement = document.getElementById('notifications');
     if (notificationsElement) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationsElement.innerHTML = ''; // Clear previous
        notificationsElement.appendChild(notification);
        if (duration > 0) setTimeout(() => notification.remove(), duration);
    }
}
