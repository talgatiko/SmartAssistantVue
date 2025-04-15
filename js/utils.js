// ----------------------------------------------------------------------
// --- Utils ---
// ----------------------------------------------------------------------
export const Utils = {
    /** Генерирует простой уникальный ID */
    generateId: () => 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),

    /** Форматирует временную метку */
    formatTimestamp: (timestamp) => {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return ''; // Не показывать время для сообщений без метки
            return date.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) { return ''; }
    },

    /** Извлекает имя файла из полного пути */
    getFileName: (filePath) => {
        if (!filePath || typeof filePath !== 'string') return '';
        const parts = filePath.split('/');
        return parts[parts.length - 1];
    },

    /** Извлекает директорию из полного пути */
    getDirectory: (filePath) => {
        if (!filePath || typeof filePath !== 'string') return '/';
        const lastSlashIndex = filePath.lastIndexOf('/');
        // Если '/' - единственный символ или его нет, возвращаем '/'
        // Если последний символ - '/', возвращаем путь как есть (уже директория)
        // Иначе, берем подстроку до последнего '/'
        if (lastSlashIndex <= 0) return '/';
        if (lastSlashIndex === filePath.length - 1) return filePath;
        return filePath.substring(0, lastSlashIndex + 1);
    },

    /** Создает путь для резервной копии файла */
    createBackupPath: (fileData) => {
        const timestampSuffix = new Date(fileData.timestamp).toISOString().replace(/[:.]/g, '-');
        const nameParts = fileData.name.split('.');
        const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
        const baseName = nameParts.join('.');
        const backupName = `${baseName}_${timestampSuffix}${extension}`;
        // Убедимся, что папка backup существует (хотя DB должна справиться)
        return `/backup/${backupName}`;
    }
};
