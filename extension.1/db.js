// Database initialization and operations
// The 'export' keyword makes this class available for importing in other files
// 'default' means this is the main thing being exported from this file
// So other files can import it using: import TimeTrackerDB from './db.js'
export default class TimeTrackerDB {
    constructor() {
        this.dbName = "TimeTrackerDB";
        this.dbVersion = 1;
    }
// AI was used in helping to code this section

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create the timeRecords store
                const timeStore = db.createObjectStore("timeRecords", { 
                    keyPath: "id", 
                    autoIncrement: true 
                });

                // Create indexes for efficient querying
                timeStore.createIndex("url", "url", { unique: false });
                timeStore.createIndex("date", "date", { unique: false });
                timeStore.createIndex("duration", "duration", { unique: false });
            };
        });
    }

    // Add a new time record
    async addTimeRecord(url, duration) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["timeRecords"], "readwrite");
            const store = transaction.objectStore("timeRecords");

            const record = {
                url: url,
                duration: duration,
                date: new Date().toISOString(),
            };

            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get all records for a specific URL
    async getRecordsByUrl(url) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["timeRecords"], "readonly");
            const store = transaction.objectStore("timeRecords");
            const index = store.index("url");

            const request = index.getAll(url);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get total time spent on a URL today
    async getTodayTimeForUrl(url) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["timeRecords"], "readonly");
            const store = transaction.objectStore("timeRecords");
            const index = store.index("url");

            const today = new Date().toISOString().split('T')[0];
            const request = index.getAll(url);

            request.onsuccess = () => {
                const records = request.result.filter(record => 
                    record.date.startsWith(today)
                );
                const totalTime = records.reduce((sum, record) => 
                    sum + record.duration, 0
                );
                resolve(totalTime);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get all records between two dates
    async getRecordsByDateRange(startDate, endDate) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["timeRecords"], "readonly");
            const store = transaction.objectStore("timeRecords");
            const index = store.index("date");

            const request = index.getAll(IDBKeyRange.bound(
                startDate.toISOString(), 
                endDate.toISOString()
            ));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get today's time for a URL
    async getTodayTimeForUrlNew(url) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["timeRecords"], "readonly");
            const store = transaction.objectStore("timeRecords");
            const index = store.index("url");

            const request = index.getAll(url);

            request.onsuccess = () => {
                const today = new Date().toISOString().split('T')[0];
                const totalTime = request.result
                    .filter(record => record.date.startsWith(today))
                    .reduce((total, record) => total + record.duration, 0);
                resolve(totalTime);
            };
            request.onerror = () => reject(request.error);
        });
    }
}