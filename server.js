#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cluster from 'cluster';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AdvancedServer {
    constructor() {
        this.isPrimary = cluster.isPrimary;
        this.cpuCount = os.cpus().length;
        this.performanceMonitor = new PerformanceMonitor();
    }

    async initialize() {
        if (this.isPrimary) {
            await this.startPrimaryProcess();
        } else {
            await this.startWorkerProcess();
        }
    }

    async startPrimaryProcess() {
        console.log('🚀 Starting ndiidepzX-Ai Advanced Server...');
        console.log(`📊 CPU Cores: ${this.cpuCount}`);
        console.log(`🛡️  Security Level: MAXIMUM`);
        console.log(`🧠 AI Engine: SUPER CANGGIH`);

        // Initialize core systems
        await this.initializeCoreSystems();
        
        // Fork workers
        this.forkWorkers();
        
        // Start monitoring
        this.startMonitoring();
    }

    async initializeCoreSystems() {
        // Load environment first
        await import('./src/config/environment.js');
        
        // Initialize security systems
        const { SecurityCore } = await import('./src/core/security-core.js');
        this.securityCore = new SecurityCore();
        await this.securityCore.initialize();
        
        // Initialize event bus
        const { EventBus } = await import('./src/core/event-bus.js');
        this.eventBus = new EventBus();
        
        // Initialize metrics
        const { MetricsCollector } = await import('./src/core/metrics.js');
        this.metrics = new MetricsCollector();
    }

    forkWorkers() {
        console.log(`👥 Forking ${this.cpuCount} workers...`);
        
        for (let i = 0; i < this.cpuCount; i++) {
            const worker = cluster.fork({
                WORKER_ID: i + 1,
                NODE_OPTIONS: '--max-old-space-size=4096'
            });

            worker.on('message', (message) => {
                this.handleWorkerMessage(worker, message);
            });
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`🔄 Worker ${worker.process.pid} died. Restarting...`);
            cluster.fork();
        });
    }

    async startWorkerProcess() {
        try {
            const { createServer } = await import('./src/core/application.js');
            const server = await createServer();
            
            const PORT = process.env.PORT || 3000;
            server.listen(PORT, () => {
                console.log(`🎯 Worker ${process.env.WORKER_ID} listening on port ${PORT}`);
                console.log(`📊 PID: ${process.pid}`);
            });

            // Graceful shutdown
            this.setupGracefulShutdown(server);
        } catch (error) {
            console.error('❌ Worker startup failed:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown(server) {
        const shutdown = async (signal) => {
            console.log(`\n🔄 ${signal} received, starting graceful shutdown...`);
            
            // Stop accepting new connections
            server.close(() => {
                console.log('✅ HTTP server closed');
            });

            // Close database connections
            // Close Redis connections
            // Close other resources
            
            setTimeout(() => {
                console.log('👋 Graceful shutdown complete');
                process.exit(0);
            }, 5000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    handleWorkerMessage(worker, message) {
        switch (message.type) {
            case 'METRICS_UPDATE':
                this.metrics.updateWorkerMetrics(worker.id, message.data);
                break;
            case 'SECURITY_ALERT':
                this.securityCore.handleSecurityAlert(message.data);
                break;
            case 'PERFORMANCE_DATA':
                this.performanceMonitor.record(message.data);
                break;
        }
    }

    startMonitoring() {
        setInterval(() => {
            const metrics = this.metrics.getSummary();
            this.performanceMonitor.report(metrics);
        }, 30000);
    }
}

// Performance monitoring class
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.startTime = Date.now();
    }

    record(data) {
        const timestamp = Date.now();
        this.metrics.set(timestamp, {
            ...data,
            timestamp
        });

        // Keep only last hour of data
        const oneHourAgo = timestamp - (60 * 60 * 1000);
        for (let [key, value] of this.metrics) {
            if (value.timestamp < oneHourAgo) {
                this.metrics.delete(key);
            }
        }
    }

    report(metrics) {
        const uptime = Date.now() - this.startTime;
        const memoryUsage = process.memoryUsage();
        
        console.log('\n📊 PERFORMANCE REPORT');
        console.log(`⏰ Uptime: ${this.formatUptime(uptime)}`);
        console.log(`💾 Memory: ${this.formatBytes(memoryUsage.heapUsed)} / ${this.formatBytes(memoryUsage.heapTotal)}`);
        console.log(`👥 Active Workers: ${Object.keys(cluster.workers || {}).length}`);
        console.log(`📈 Requests/Min: ${metrics.requestsPerMinute || 0}`);
        console.log(`🛡️  Security Events: ${metrics.securityEvents || 0}`);
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Start the server
const server = new AdvancedServer();
server.initialize().catch(console.error);
