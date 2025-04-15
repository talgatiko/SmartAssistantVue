import { FileSystemAPI } from './fileSystemAPI.js';
// import * as UI from './ui.js'; // Будем постепенно заменять вызовы UI
import * as Chat from './chat.js';
import { Utils } from './utils.js';

// --- Получаем функции Vue из глобального объекта ---
const { createApp, ref, reactive, computed, onMounted } = Vue;

// --- Создаем Vue приложение ---
const app = createApp({
    setup() {
        // --- Реактивное состояние приложения ---
        const currentDirectory = ref('/');
        const selectedFilePath = ref(null);
        const isEditorDirty = ref(false);
        const lastLoadedAgentConfig = ref(null); // Store the last successfully loaded agent config
        const files = ref([]); // Для списка файлов
        const chatHistory = ref([]); // Для истории чата
        const editorContent = ref(''); // Для содержимого редактора
        const fileStatus = ref(''); // Статус файла
        const notifications = ref([]); // Уведомления
        const isLoading = ref(false); // Индикатор загрузки
        const loadingMessage = ref(''); // Сообщение при загрузке

        // --- Функция для отображения уведомлений ---
        const showNotification = (message, type = 'info', duration = 3000) => {
            const id = Date.now() + Math.random(); // Уникальный ID для уведомления
            const notification = { id, message, type };
            notifications.value.push(notification);

            if (duration > 0) {
                setTimeout(() => {
                    const index = notifications.value.findIndex(n => n.id === id);
                    if (index !== -1) {
                        notifications.value.splice(index, 1);
                    }
                }, duration);
            }
        };

        // --- DOM Element References (пока оставим, но будем убирать) ---
        // const getElement = (id) => document.getElementById(id); // Vue работает с ref'ами или прямым доступом к DOM если очень нужно
        // const fileContentEditor = getElement('file-content-editor');
        // const saveButton = getElement('btn-save-file');
        // const deleteButton = getElement('btn-delete-file');
        // const rootButton = getElement('btn-root');
        // const createFileButton = getElement('btn-create-file');
        // const sendMessageButton = getElement('btn-send-message');

        // --- Методы (перенос логики из старых handle* функций) ---

        // Placeholder для рендеринга списка файлов
        const renderFileList = async (directory) => {
            console.log(`Vue: Rendering file list for ${directory}`);
            isLoading.value = true;
            loadingMessage.value = `Загрузка ${directory}...`;
            currentDirectory.value = directory;
            selectedFilePath.value = null; // Сбрасываем выбор при смене папки
            editorContent.value = ''; // Очищаем редактор
            chatHistory.value = []; // Очищаем историю чата при смене папки
            // lastLoadedAgentConfig.value = null; // Не сбрасываем конфиг агента при смене папки

            try {
                const items = await FileSystemAPI.listFiles(directory);
                files.value = items; // Обновляем реактивный список файлов
                // TODO: Implement directory expansion logic if needed within the component template
            } catch (error) {
                console.error(`Vue: Error loading file list for ${directory}:`, error);
                showNotification(`Ошибка загрузки списка файлов ${directory}: ${error.message}`, 'error');
                files.value = []; // Clear files on error
            } finally {
                isLoading.value = false;
                loadingMessage.value = '';
            }
        };

        // Placeholder для загрузки файла
        const loadFile = async (filePath) => {
            console.log(`Vue: Loading file ${filePath}`);
            if (isEditorDirty.value && !confirm("Есть несохраненные изменения. Продолжить без сохранения?")) {
                return;
            }
            isEditorDirty.value = false;
            selectedFilePath.value = filePath;
            isLoading.value = true; // Можно использовать для индикации загрузки файла
            fileStatus.value = 'Загрузка...';
            editorContent.value = '';
            chatHistory.value = []; // Очищаем историю чата перед загрузкой файла

            try {
                const fileData = await FileSystemAPI.getFile(filePath);
                if (fileData) {
                    editorContent.value = fileData.content;
                    fileStatus.value = `Загружено: ${Utils.formatTimestamp(fileData.timestamp)}`;
                    selectedFilePath.value = fileData.filePath; // Убедимся, что путь корректный

                    // Логика определения типа файла
                    const directory = Utils.getDirectory(filePath);
                    const fileName = Utils.getFileName(filePath);

                    // Загрузка конфигурации агента
                    if (directory === '/agents/' && fileName.endsWith('.json')) {
                        try {
                            const config = JSON.parse(fileData.content);
                            if (!config || typeof config !== 'object' || !config.configurations?.model) {
                                 throw new Error("Неверная структура конфигурации агента или отсутствует модель.");
                            }
                            // Chat.setActiveAgentConfig(config); // Пока не адаптируем Chat.js
                            lastLoadedAgentConfig.value = config; // Сохраняем валидный конфиг
                            showNotification(`Конфигурация агента ${config.name || fileName} загружена.`, 'success', 2000);
                        } catch (e) {
                            console.error("Vue: Error parsing or validating agent config:", e);
                            showNotification(`Ошибка в конфигурации агента ${fileName}: ${e.message}`, 'error');
                            // Chat.setActiveAgentConfig(null); // Пока не адаптируем Chat.js
                            // Не обновляем lastLoadedAgentConfig.value при ошибке
                        }
                    }
                    // Не сбрасываем lastLoadedAgentConfig при загрузке других файлов,
                    // чтобы он оставался активным для чата

                    // Загрузка истории чата
                    if (directory === '/chats/' && fileName.endsWith('.json')) {
                        try {
                            const chatData = JSON.parse(fileData.content);
                            // Простая проверка, что есть массив messages
                            if (chatData && Array.isArray(chatData.messages)) {
                                chatHistory.value = chatData.messages;
                                // Прокрутка чата вниз (потребуется доступ к DOM элементу или ref)
                                // TODO: Implement chat scroll after render
                            } else {
                                throw new Error("Неверный формат файла чата.");
                            }
                        } catch (e) {
                             console.error("Vue: Error parsing chat file:", e);
                             showNotification(`Ошибка чтения файла чата ${fileName}: ${e.message}`, 'error');
                             chatHistory.value = []; // Очищаем при ошибке
                        }
                    }
                    // Если загружен не чат-файл, chatHistory уже очищен в начале функции

                } else {
                    showNotification(`Файл ${filePath} не найден`, 'error');
                    selectedFilePath.value = null;
                }
            } catch (error) {
                console.error(`Vue: Error loading file ${filePath}:`, error);
                showNotification(`Ошибка загрузки файла ${filePath}: ${error.message}`, 'error');
                selectedFilePath.value = null;
            } finally {
                 isLoading.value = false;
            }
        };

        // Placeholder для сохранения файла
        const saveFile = async () => {
            if (!selectedFilePath.value) {
                 showNotification('Файл не выбран для сохранения.', 'warning');
                 return;
            }
             if (!isEditorDirty.value) {
                 showNotification('Нет несохраненных изменений.', 'info', 1500);
                 return;
             }
            console.log(`Vue: Saving file ${selectedFilePath.value}`);
            fileStatus.value = 'Сохранение...';
            // TODO: Disable buttons via reactive state binding

            try {
                const content = editorContent.value; // Получаем из реактивной переменной
                const savedFileData = await FileSystemAPI.saveFile(selectedFilePath.value, content);

                showNotification(`Файл ${Utils.getFileName(savedFileData.filePath)} сохранен.`, 'success');
                fileStatus.value = `Сохранено: ${Utils.formatTimestamp(savedFileData.timestamp)}`;
                isEditorDirty.value = false;

                // TODO: Перенести пост-сохранение логику (обновление конфига агента, скачивание JS, перезагрузка чата)
                 // Пример:
                 const directory = Utils.getDirectory(savedFileData.filePath);
                 if (directory === '/js/' && savedFileData.name.endsWith('.js')) {
                     // Логика скачивания файла
                     try {
                         const blob = new Blob([content], { type: 'text/javascript' });
                         const url = URL.createObjectURL(blob);
                         const a = document.createElement('a');
                         a.href = url;
                         a.download = savedFileData.name;
                         document.body.appendChild(a);
                         a.click();
                         document.body.removeChild(a);
                         URL.revokeObjectURL(url);
                         showNotification(`Файл ${savedFileData.name} подготовлен к скачиванию. Сохраните его поверх оригинального файла в папке 'js/' и перезагрузите приложение (F5).`, 'info', 8000);
                     } catch (downloadError) {
                         console.error("Vue: Error triggering download:", downloadError);
                         showNotification(`Ошибка при попытке скачивания файла ${savedFileData.name}. Изменения сохранены только в виртуальной системе.`, 'error');
                         showNotification('Изменения кода сохранены (в вирт. системе). Перезагрузите приложение (F5) для применения.', 'warning', 5000);
                     }
                 }


            } catch (error) {
                console.error(`Vue: Error saving file ${selectedFilePath.value}:`, error);
                showNotification(`Ошибка сохранения файла: ${error.message}`, 'error');
                fileStatus.value = 'Ошибка сохранения';
            } finally {
                // TODO: Update button states (будет управляться через :disabled в шаблоне)
            }
        };

        // Удаление файла
        const deleteFile = async () => {
            if (!selectedFilePath.value) {
                showNotification('Файл не выбран для удаления.', 'warning');
                return;
            }

            const filePathToDelete = selectedFilePath.value; // Сохраняем путь перед сбросом
            const fileName = Utils.getFileName(filePathToDelete);
            const backupMessage = Utils.getDirectory(filePathToDelete) === '/backup/'
                ? 'Резервная копия НЕ будет создана для файла из /backup/.'
                : 'Будет создана резервная копия (если возможно).';

            if (!confirm(`Вы уверены, что хотите удалить "${fileName}"?\n${backupMessage}`)) {
                return;
            }

            console.log(`Vue: Deleting file ${filePathToDelete}`);
            isLoading.value = true; // Показываем индикатор во время удаления
            loadingMessage.value = `Удаление ${fileName}...`;
            const dirToRefresh = currentDirectory.value; // Запоминаем текущую директорию

            try {
                await FileSystemAPI.deleteFile(filePathToDelete);
                showNotification(`Файл "${fileName}" удален.`, 'success');
                selectedFilePath.value = null; // Сбрасываем выбор
                editorContent.value = '';
                chatHistory.value = [];
                fileStatus.value = '';
                isEditorDirty.value = false;
                await renderFileList(dirToRefresh); // Обновляем список файлов в текущей директории
            } catch (error) {
                console.error(`Vue: Error deleting file ${filePathToDelete}:`, error);
                showNotification(`Ошибка удаления файла: ${error.message}`, 'error');
            } finally {
                 isLoading.value = false;
                 loadingMessage.value = '';
            }
        };

        // Создание файла
        const createFile = async () => {
             if (currentDirectory.value === '/backup/') {
                 showNotification('Нельзя создавать файлы в папке /backup/', 'error');
                 return;
             }
             const fileName = prompt(`Введите имя нового файла в ${currentDirectory.value}\n(например: my_notes.txt, config.json, new_chat.json):`);
             if (!fileName || !fileName.trim()) {
                 return; // Пользователь отменил или ввел пустое имя
             }

             // Добавляем слеш, если его нет и директория не корневая
             let dirPrefix = currentDirectory.value;
             if (dirPrefix !== '/' && !dirPrefix.endsWith('/')) {
                 dirPrefix += '/';
             }
             const newFilePath = dirPrefix + fileName.trim();

             isLoading.value = true;
             loadingMessage.value = `Создание ${fileName}...`;

             try {
                 // Проверяем существование файла перед созданием
                 const existing = await FileSystemAPI.getFile(newFilePath);
                 if (existing) {
                     showNotification(`Файл ${fileName} уже существует в этой папке.`, 'error');
                     isLoading.value = false;
                     loadingMessage.value = '';
                     return;
                 }

                 // Определяем начальное содержимое
                 let initialContent = '';
                 if (fileName.endsWith('.json')) {
                     initialContent = '{}';
                     if (currentDirectory.value === '/chats/') {
                         initialContent = JSON.stringify({ id: Utils.generateId(), messages: [] }, null, 2);
                     } else if (currentDirectory.value === '/agents/') {
                         initialContent = JSON.stringify({ id: Utils.generateId(), name: "New Agent", configurations: { model: "anthropic/claude-3-haiku" } }, null, 2);
                     } else if (currentDirectory.value === '/secrets/') {
                          initialContent = JSON.stringify({ id: Utils.generateId(), service: "New Service", data: {} }, null, 2);
                     }
                 } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                     initialContent = `Новый файл: ${fileName}\n`;
                 }

                 console.log(`Vue: Creating file ${newFilePath}`);
                 await FileSystemAPI.saveFile(newFilePath, initialContent);
                 showNotification(`Файл ${fileName} создан.`, 'success');

                 await renderFileList(currentDirectory.value); // Обновить список
                 await loadFile(newFilePath); // Загрузить новый файл

             } catch (error) {
                 // Обработка ошибки, если getFile вернул ошибку, отличную от "не найдено"
                 if (error.code !== 'ENOENT') {
                     console.error(`Vue: Error checking/creating file ${newFilePath}:`, error);
                     showNotification(`Ошибка создания файла: ${error.message}`, 'error');
                 } else {
                     // Если ошибка была "не найдено", значит можно создавать (этот блок не должен выполниться из-за проверки выше, но для полноты)
                     console.error(`Vue: Error creating file ${newFilePath} after check:`, error);
                     showNotification(`Ошибка создания файла: ${error.message}`, 'error');
                 }
             } finally {
                  isLoading.value = false;
                  loadingMessage.value = '';
             }
        };

        // Отправка сообщения
        const sendMessage = async () => {
            const messageText = editorContent.value.trim(); // Используем содержимое редактора
             if (!messageText) {
                 showNotification('Введите сообщение для отправки.', 'warning', 1500);
                 return;
             }
             let currentChatPath = selectedFilePath.value;
             let isChatFileSelected = currentChatPath && Utils.getDirectory(currentChatPath) === '/chats/' && currentChatPath.endsWith('.json');
             let currentAgentConfig = lastLoadedAgentConfig.value; // Используем последний загруженный конфиг

             isLoading.value = true; // Показываем индикатор во время отправки
             loadingMessage.value = 'Отправка сообщения...';

             try {
                 // Авто-создание чата
                 if (!isChatFileSelected) {
                     console.log("Vue: No chat file selected. Creating new one...");
                     showNotification('Создание нового файла чата...', 'info');
                     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                     const newChatFileName = `chat_${timestamp}.json`;
                     const newChatFilePath = `/chats/${newChatFileName}`;
                     const initialChatContent = JSON.stringify({ id: Utils.generateId(), messages: [] }, null, 2);

                     try { await FileSystemAPI.createDirectory('/chats/'); } catch (dirError) { /* ignore if exists */ }

                     const savedChatData = await FileSystemAPI.saveFile(newChatFilePath, initialChatContent);
                     showNotification(`Новый чат ${newChatFileName} создан.`, 'success', 2000);

                     // Обновляем список файлов, если находимся в / или /chats/
                     if (currentDirectory.value === '/' || currentDirectory.value === '/chats/') {
                          await renderFileList(currentDirectory.value);
                     }
                     // Загружаем новый чат (обновит selectedFilePath и chatHistory)
                     await loadFile(newChatFilePath);
                     // Убедимся, что путь обновился в состоянии перед использованием
                     currentChatPath = selectedFilePath.value;
                     isChatFileSelected = true;
                 }

                 // Получение API ключа
                 let apiKey = null;
                 const secretsPath = '/secrets/api_keys.json';
                 try {
                     const secretsFile = await FileSystemAPI.getFile(secretsPath);
                     if (secretsFile) {
                         const secretsData = JSON.parse(secretsFile.content);
                         apiKey = secretsData?.vsegpt || null;
                     }
                 } catch (error) {
                     // Игнорируем ошибку, если файл не найден (ENOENT)
                     if (error.code !== 'ENOENT') {
                         console.warn(`Vue: Error reading secrets file:`, error);
                         showNotification('Ошибка чтения файла секретов.', 'warning');
                     }
                 }

                 // Запрос ключа, если он не найден
                 if (!apiKey) {
                     apiKey = prompt("API ключ для VseGPT не найден. Пожалуйста, введите ваш ключ:");
                     if (apiKey) {
                         try {
                             let secretsData = { vsegpt: apiKey };
                             try {
                                 // Попытка прочитать существующий файл, чтобы не перезаписать другие ключи
                                 const existingSecretsFile = await FileSystemAPI.getFile(secretsPath);
                                 if (existingSecretsFile) {
                                     const existingData = JSON.parse(existingSecretsFile.content);
                                     secretsData = { ...existingData, vsegpt: apiKey };
                                 }
                             } catch (readError) {
                                 if (readError.code !== 'ENOENT') throw readError; // Перебрасываем, если не "не найдено"
                             }
                             await FileSystemAPI.saveFile(secretsPath, JSON.stringify(secretsData, null, 2));
                             showNotification('API ключ VseGPT сохранен в /secrets/api_keys.json', 'success');
                         } catch (saveError) {
                             console.error("Vue: Error saving API key:", saveError);
                             showNotification('Не удалось сохранить API ключ.', 'error');
                             apiKey = null; // Сбрасываем, если не удалось сохранить
                         }
                     } else {
                         showNotification('Отправка отменена. API ключ не предоставлен.', 'error');
                         isLoading.value = false;
                         loadingMessage.value = '';
                         return; // Прерываем отправку
                     }
                 }


                 // Проверка конфига агента
                 if (!currentAgentConfig) {
                     showNotification("Пожалуйста, загрузите конфигурацию агента (например, /agents/example-agent.json).", 'error');
                     isLoading.value = false; // Снимаем индикатор
                     loadingMessage.value = '';
                     return;
                 }

                 // Отправка сообщения
                 if (isChatFileSelected && currentChatPath) { // Добавлена проверка currentChatPath
                     // Добавляем сообщение пользователя в историю немедленно для UI
                     const userMessage = { sender: 'user', text: messageText, timestamp: Date.now() };
                     chatHistory.value.push(userMessage);
                     // TODO: Прокрутка чата вниз

                     const messageToSend = editorContent.value.trim(); // Сохраняем текст перед очисткой
                     editorContent.value = ''; // Очищаем редактор
                     isEditorDirty.value = false; // Сбрасываем флаг изменений
                     fileStatus.value = 'Отправка...';

                     // Вызов Chat.sendMessage (требует адаптации Chat.js)
                     try {
                         // !!! ВАЖНО: Chat.sendMessage должен быть адаптирован !!!
                         // 1. Принимать chatHistory.value как параметр или получать его из состояния.
                         // 2. Возвращать ответ агента (или ошибку).
                         // 3. Не мутировать chatHistory.value напрямую.
                         console.log(`Vue: Calling Chat.sendMessage with path: ${currentChatPath}, key: ${apiKey ? '***' : null}, config: ${currentAgentConfig.name}`);

                         // --- Имитация вызова и ответа ---
                         await new Promise(resolve => setTimeout(resolve, 1500)); // Имитация задержки сети
                         // Предположим, Chat.sendMessage вернул объект ответа
                         const agentResponse = { sender: 'agent', text: `Это имитация ответа на "${messageToSend}"`, timestamp: Date.now() };
                         chatHistory.value.push(agentResponse);
                         // TODO: Прокрутка чата вниз

                         // Сохранение обновленного чата
                         try {
                             const updatedChatData = JSON.stringify({ id: Utils.generateId(), messages: chatHistory.value }, null, 2);
                             await FileSystemAPI.saveFile(currentChatPath, updatedChatData);
                             fileStatus.value = 'Сообщение обработано и сохранено';
                             showNotification('Сообщение отправлено и чат сохранен (имитация)', 'success', 1500);
                         } catch (saveChatError) {
                              console.error("Vue: Error saving updated chat:", saveChatError);
                              showNotification('Сообщение отправлено, но не удалось сохранить чат.', 'warning');
                              fileStatus.value = 'Ошибка сохранения чата';
                         }
                         // --- Конец имитации ---

                     } catch (sendError) {
                          console.error("Vue: Error calling Chat.sendMessage:", sendError);
                          showNotification(`Ошибка отправки: ${sendError.message}`, 'error');
                          fileStatus.value = 'Ошибка отправки';
                          // Удаляем сообщение пользователя из истории при ошибке отправки
                          const userMessageIndex = chatHistory.value.findIndex(m => m.timestamp === userMessage.timestamp && m.text === userMessage.text);
                          if (userMessageIndex > -1) {
                              chatHistory.value.splice(userMessageIndex, 1);
                          }
                     }
                 } else {
                      // Эта ветка не должна выполниться из-за логики автосоздания, но на всякий случай
                      showNotification('Не удалось определить файл чата для отправки.', 'error');
                 }

             } catch (error) {
                 // Обработка ошибок, возникших до вызова Chat.sendMessage (например, при создании чата, чтении секрета)
                 console.error("Vue: Error during send message setup:", error);
                 showNotification(`Ошибка подготовки к отправке: ${error.message}`, 'error');
             } finally {
                 // Один блок finally для снятия индикатора загрузки
                 isLoading.value = false; // Снимаем индикатор
                 loadingMessage.value = '';
                 // Состояние кнопок управляется :disabled в шаблоне
             }
        };

        // Обработчик ввода в редакторе
        const handleEditorInput = (event) => {
            // Обновляем реактивную переменную содержимого редактора
            // Проверяем, что event.target существует перед доступом к value
            if (event && event.target) {
                editorContent.value = event.target.value;
            } else {
                 // Если event или event.target не определены, возможно, стоит просто вернуть или залогировать
                 console.warn("handleEditorInput вызван без корректного event объекта");
                 return;
            }


            const hasContent = editorContent.value.trim().length > 0;
            const isFileSelected = !!selectedFilePath.value;
            const isChatFile = isFileSelected && Utils.getDirectory(selectedFilePath.value) === '/chats/';

            if (isFileSelected && !isChatFile) {
                isEditorDirty.value = true; // Помечаем как измененный для сохранения
                fileStatus.value = 'Несохраненные изменения';
            } else if (isChatFile) {
                isEditorDirty.value = false; // Для чата не нужно сохранять через кнопку Save
                fileStatus.value = '';
            }
            // TODO: Update button states based on reactive flags
        };


        // --- Логика инициализации при монтировании компонента ---
        onMounted(async () => {
            console.log('Vue App Mounted: Initializing...');
            isLoading.value = true;
            loadingMessage.value = 'Инициализация базы данных...';
            // UI.clearEditor(); // Заменено на editorContent.value = ''

            try {
                await FileSystemAPI.openDB(); // Ensure DB is open and ready
                showNotification('База данных готова.', 'success', 1500);
                console.log('DB Ready.');

                // Load core JS files into virtual filesystem
                console.log('Vue: Loading core JS files into virtual filesystem...');
                loadingMessage.value = 'Загрузка JS файлов...';
                const jsFilesToLoad = [
                    'chat.js', 'dbManager.js', 'fileSystemAPI.js',
                    'main.js', 'ui.js', 'utils.js'
                ];
                const virtualJsDir = '/js/';
                try {
                    await FileSystemAPI.createDirectory(virtualJsDir);
                } catch (dirError) {
                    if (!dirError.message || !dirError.message.includes('already exists')) {
                        console.warn(`Vue: Could not ensure virtual directory ${virtualJsDir}:`, dirError);
                    }
                }
                let allJsLoaded = true;
                for (const fileName of jsFilesToLoad) {
                    const actualFilePath = `js/${fileName}`;
                    const virtualFilePath = `${virtualJsDir}${fileName}`;
                    try {
                        const response = await fetch(actualFilePath);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const content = await response.text();
                        await FileSystemAPI.saveFile(virtualFilePath, content);
                    } catch (error) {
                        allJsLoaded = false;
                        console.error(`Vue: Failed to load ${fileName} into virtual FS:`, error);
                        showNotification(`Ошибка загрузки ${fileName} в вирт. ФС: ${error.message}`, 'error');
                    }
                }
                 if (allJsLoaded) {
                    console.log('Vue: Finished loading core JS files.');
                    showNotification('JS файлы загружены в виртуальную систему.', 'info', 2000);
                 } else {
                     console.warn('Vue: Some core JS files failed to load.');
                     showNotification('Некоторые JS файлы не удалось загрузить в виртуальную систему.', 'warning');
                 }
                // End loading core JS files

                // setupEventListeners(); // Заменено на обработчики Vue (@click и т.д. в шаблоне)
                await renderFileList('/'); // Load root directory

            } catch (error) {
                console.error("Vue: Critical initialization error:", error);
                showNotification(`Критическая ошибка инициализации: ${error.message}. Приложение может работать некорректно.`, 'error', 0); // 0 = не закрывать автоматически
                isLoading.value = false; // Убрать индикатор загрузки
                // TODO: Отобразить ошибку в UI (например, в file-list) - можно добавить элемент в шаблон
                files.value = [{ type: 'error', name: `Критическая ошибка: ${error.message}`, path: '' }];
            } finally {
                 isLoading.value = false; // Убедиться, что индикатор убран
                 loadingMessage.value = '';
            }
            console.log('Vue App Initialization complete.');
        });

        // --- Возвращаем состояние и методы для использования в шаблоне ---
        return {
            currentDirectory,
            selectedFilePath,
            isEditorDirty,
            lastLoadedAgentConfig,
            files,
            chatHistory,
            editorContent,
            fileStatus,
            notifications, // Добавлено для использования в шаблоне
            isLoading,
            loadingMessage,
            // Методы
            showNotification, // Добавлено для возможного использования в дочерних компонентах (если будут)
            renderFileList,
            loadFile,
            saveFile,
            deleteFile,
            createFile,
            sendMessage,
            handleEditorInput,
            // Утилиты, если нужны в шаблоне
            Utils
        };
    }
});

// --- Монтируем приложение ---
app.mount('#app');

console.log('Vue app instance created and mounting requested.');


// --- Старый код (комментируем или удаляем) ---

// let state = { ... }; // Заменено на реактивное состояние Vue

// const getElement = (id) => document.getElementById(id); // Заменено на работу с шаблоном Vue

// async function handleRenderFileList(directory) { ... } // Логика перенесена в setup -> renderFileList
// async function handleDirectoryExpand(dirPath, subListElement, level) { ... } // Будет реализовано в компоненте файлового менеджера
// async function handleLoadFile(filePath) { ... } // Логика перенесена в setup -> loadFile
// async function handleSaveFile() { ... } // Логика перенесена в setup -> saveFile
// async function handleDeleteFile() { ... } // Логика перенесена в setup -> deleteFile
// async function handleCreateFile() { ... } // Логика перенесена в setup -> createFile
// async function handleSendMessage() { ... } // Логика перенесена в setup -> sendMessage
// function handleEditorInput() { ... } // Логика перенесена в setup -> handleEditorInput

// function setupEventListeners() { ... } // Заменено на директивы Vue в шаблоне (@click, @input)

// async function initialize() { ... } // Логика перенесена в onMounted

// document.addEventListener('DOMContentLoaded', initialize); // Заменено на app.mount('#app')
