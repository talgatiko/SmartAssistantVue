import { Utils } from './utils.js';

// ----------------------------------------------------------------------
// --- DB Manager (IndexedDB) ---
// ----------------------------------------------------------------------
export const DBManager = (() => {
    const DB_NAME = 'smartAssistantDB_Modular'; // New name for modular version
    const DB_VERSION = 1; // Can be incremented if structure changes
    const STORE_NAME = 'files';
    let db = null;

    /** Adds initial files if they don't exist */
    function addInitialData(store) {
        console.log("[DB Init] Checking and adding initial data...");
        const now = Date.now();
        const initialFiles = [
            {
                filePath: '/chats/welcome.json', directory: '/chats/', name: 'welcome.json', timestamp: now,
                content: JSON.stringify({
                    id: Utils.generateId(),
                    messages: [{ sender: 'agent', text: 'Добро пожаловать! Это пример чата.', timestamp: now }]
                }, null, 2)
            },
            {
                filePath: '/agents/example-agent.json', directory: '/agents/', name: 'example-agent.json', timestamp: now,
                content: JSON.stringify({
                    id: 'agent_example_1', name: 'Example Agent',
                    configurations: { model: 'anthropic/claude-3-haiku', temperature: 0.7, greeting: 'Hello!' }
                }, null, 2)
            },
            {
                filePath: '/agents/openai-gpt4o.json', directory: '/agents/', name: 'openai-gpt4o.json', timestamp: now,
                content: JSON.stringify({
                    id: 'agent_openai_01', name: 'OpenAI GPT-4o',
                    configurations: { model: 'openai/gpt-4o', temperature: 0.8 }
                }, null, 2)
            },
            {
                filePath: '/secrets/sample-credentials.json', directory: '/secrets/', name: 'sample-credentials.json', timestamp: now,
                content: JSON.stringify({
                    id: 'secret_1', service: 'MyService', username: 'user', notes: 'API keys etc.'
                }, null, 2)
            }
        ];

        initialFiles.forEach(fileData => {
            // In onupgradeneeded, use add to cause an error if the key exists
            // Wrap in try/catch for ConstraintError if file already exists (e.g., during version upgrade without structure change)
            try {
                store.add(fileData);
                console.log(`[DB Init] Scheduled addition: ${fileData.filePath}`);
            } catch (e) {
                if (e.name === 'ConstraintError') {
                    console.warn(`[DB Init] File ${fileData.filePath} already exists, skipping.`);
                } else {
                    console.error(`[DB Init] Error adding ${fileData.filePath}:`, e);
                    // Re-throw or handle error appropriately if needed
                    throw e; // Propagate error to abort transaction if critical
                }
            }
        });
        console.log("[DB Init] Initial data addition scheduled.");
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            console.log(`[DB] Opening ${DB_NAME} v${DB_VERSION}...`);
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error(`[DB] Open error:`, event.target.error);
                reject(`Failed to open database: ${event.target.error}`);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log(`[DB] Database ${DB_NAME} v${DB_VERSION} opened successfully.`);
                db.onerror = (e) => console.error(`[DB] Global error:`, e.target.error); // Generic error handler for the connection
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                console.log(`[DB] Upgrading to v${DB_VERSION}...`);
                const tempDb = event.target.result;
                const transaction = event.target.transaction; // Use the upgrade transaction

                if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                    console.log(`[DB] Creating object store: ${STORE_NAME}`);
                    const store = tempDb.createObjectStore(STORE_NAME, { keyPath: 'filePath' });
                    store.createIndex('directoryIndex', 'directory', { unique: false });
                    console.log(`[DB] Object store and index created.`);

                    // Add initial data only when the store is first created
                    try {
                        addInitialData(store); // Pass the store reference
                    } catch (error) {
                        console.error("[DB] Error during initial data population:", error);
                        transaction.abort(); // Abort the upgrade transaction on error
                        reject(error);
                        return;
                    }
                } else {
                    console.log(`[DB] Object store ${STORE_NAME} already exists.`);
                    // Handle potential schema migrations for existing stores here if DB_VERSION increases
                    // Example: if (event.oldVersion < 2) { /* migrate schema */ }
                }
                // The transaction completes automatically, no need for explicit commit
                console.log(`[DB] Upgrade to v${DB_VERSION} complete.`);
            };
        });
    }

    function getDB() {
        if (!db) {
            console.error("[DB] Database not initialized. Call openDB first.");
            // Consider throwing an error or attempting to open it again
            // For simplicity, returning null, but callers should handle this.
            return null;
        }
        return db;
    }

    return { openDB, getDB, STORE_NAME };
})();
