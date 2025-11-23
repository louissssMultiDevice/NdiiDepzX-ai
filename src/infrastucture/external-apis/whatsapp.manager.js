import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { EventBus } from '../../core/event-bus.js';

export class WhatsAppManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.eventBus = EventBus.getInstance();
        this.messageQueue = [];
        this.adminNumbers = [
            '6285800650661' // ndiidepzX number
        ];
        this.botNumber = '6287717274346'; // Bot number
        
        this.initializeClient();
    }

    initializeClient() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('qr', (qr) => {
            console.log('📱 WhatsApp QR Code received:');
            qrcode.generate(qr, { small: true });
            
            // Send QR code to admin via other means if needed
            this.eventBus.emit('WHATSAPP_QR_GENERATED', { qr });
        });

        this.client.on('ready', () => {
            console.log('✅ WhatsApp Client is ready!');
            this.isConnected = true;
            this.processMessageQueue();
            
            this.eventBus.emit('WHATSAPP_READY');
        });

        this.client.on('authenticated', () => {
            console.log('🔐 WhatsApp Client authenticated!');
            this.eventBus.emit('WHATSAPP_AUTHENTICATED');
        });

        this.client.on('auth_failure', (error) => {
            console.error('❌ WhatsApp authentication failed:', error);
            this.isConnected = false;
            this.eventBus.emit('WHATSAPP_AUTH_FAILED', { error });
        });

        this.client.on('disconnected', (reason) => {
            console.log('🔌 WhatsApp client disconnected:', reason);
            this.isConnected = false;
            this.eventBus.emit('WHATSAPP_DISCONNECTED', { reason });
        });

        this.client.on('message', async (message) => {
            await this.handleIncomingMessage(message);
        });
    }

    async start() {
        try {
            console.log('🚀 Starting WhatsApp client...');
            await this.client.initialize();
        } catch (error) {
            console.error('❌ Failed to start WhatsApp client:', error);
            throw error;
        }
    }

    async sendMessage(to, content, options = {}) {
        const messageData = {
            to: this.formatNumber(to),
            content,
            timestamp: new Date(),
            options
        };

        if (!this.isConnected) {
            console.log('⏳ WhatsApp not connected, queuing message...');
            this.messageQueue.push(messageData);
            return { queued: true, timestamp: messageData.timestamp };
        }

        try {
            const result = await this.client.sendMessage(messageData.to, messageData.content, messageData.options);
            
            await this.logMessage('OUTGOING', messageData, result);
            
            return {
                success: true,
                messageId: result.id._serialized,
                timestamp: result.timestamp
            };
        } catch (error) {
            console.error('❌ Failed to send WhatsApp message:', error);
            
            // Queue for retry
            this.messageQueue.push(messageData);
            
            await this.logMessage('FAILED', messageData, null, error);
            
            throw error;
        }
    }

    async sendOTP(to, otpCode) {
        const message = `🔐 *ndiidepzX-Ai Verification*\n\n` +
                      `Your verification code is: *${otpCode}*\n\n` +
                      `This code will expire in 10 minutes.\n\n` +
                      `_If you didn't request this, please ignore this message._`;

        return await this.sendMessage(to, message);
    }

    async sendAdminNotification(message, priority = 'normal') {
        const adminMessage = `🚨 *ndiidepzX-Ai Admin Alert* 🚨\n\n${message}\n\n` +
                           `_Timestamp: ${new Date().toLocaleString()}_`;

        const promises = this.adminNumbers.map(adminNumber => 
            this.sendMessage(adminNumber, adminMessage, { priority })
        );

        return await Promise.allSettled(promises);
    }

    async sendSystemAlert(alertData) {
        const alertMessage = this.formatSystemAlert(alertData);
        return await this.sendAdminNotification(alertMessage, 'high');
    }

    async handleIncomingMessage(message) {
        try {
            // Log all incoming messages
            await this.logMessage('INCOMING', {
                from: message.from,
                content: message.body,
                timestamp: message.timestamp
            });

            // Check if message is from admin
            if (this.isAdminMessage(message.from)) {
                await this.handleAdminCommand(message);
                return;
            }

            // Handle OTP responses
            if (await this.isOTPResponse(message)) {
                await this.handleOTPResponse(message);
                return;
            }

            // Forward important messages to admin
            if (await this.isImportantMessage(message)) {
                await this.forwardToAdmin(message);
            }

        } catch (error) {
            console.error('❌ Error handling incoming message:', error);
            await this.logMessage('ERROR', null, null, error);
        }
    }

    async handleAdminCommand(message) {
        const command = message.body.toLowerCase().trim();
        
        switch (command) {
            case '/status':
                await this.sendStatusUpdate(message.from);
                break;
            case '/stats':
                await this.sendSystemStats(message.from);
                break;
            case '/restart':
                await this.sendMessage(message.from, '🔄 Restarting system...');
                // Implement restart logic
                break;
            default:
                await this.sendMessage(message.from, '❌ Unknown command. Available: /status, /stats, /restart');
        }
    }

    async sendStatusUpdate(to) {
        const statusMessage = `📊 *System Status*\n\n` +
                            `✅ WhatsApp: ${this.isConnected ? 'Connected' : 'Disconnected'}\n` +
                            `📨 Queued Messages: ${this.messageQueue.length}\n` +
                            `🕒 Uptime: ${process.uptime().toFixed(0)}s\n` +
                            `💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`;

        await this.sendMessage(to, statusMessage);
    }

    async processMessageQueue() {
        if (this.messageQueue.length === 0 || !this.isConnected) return;

        console.log(`🔄 Processing ${this.messageQueue.length} queued messages...`);

        const successfulMessages = [];
        const failedMessages = [];

        for (const messageData of this.messageQueue) {
            try {
                await this.sendMessage(messageData.to, messageData.content, messageData.options);
                successfulMessages.push(messageData);
            } catch (error) {
                failedMessages.push(messageData);
            }
        }

        // Update queue
        this.messageQueue = failedMessages;

        if (successfulMessages.length > 0) {
            console.log(`✅ Successfully sent ${successfulMessages.length} queued messages`);
        }
        if (failedMessages.length > 0) {
            console.log(`❌ ${failedMessages.length} messages failed to send`);
        }
    }

    formatSystemAlert(alertData) {
        return `🚨 *${alertData.type.toUpperCase()}* 🚨\n\n` +
               `*Description:* ${alertData.description}\n` +
               `*Severity:* ${alertData.severity}\n` +
               `*Timestamp:* ${new Date(alertData.timestamp).toLocaleString()}\n` +
               `*Details:* ${alertData.details || 'No additional details'}`;
    }

    formatNumber(number) {
        // Ensure number is in international format
        let formatted = number.replace(/\D/g, '');
        if (!formatted.startsWith('62') && formatted.startsWith('0')) {
            formatted = '62' + formatted.substring(1);
        }
        return formatted + '@c.us';
    }

    isAdminNumber(number) {
        const cleanNumber = this.formatNumber(number);
        return this.adminNumbers.some(admin => this.formatNumber(admin) === cleanNumber);
    }

    isAdminMessage(from) {
        return this.isAdminNumber(from);
    }

    async logMessage(direction, messageData, result = null, error = null) {
        const logEntry = {
            direction,
            timestamp: new Date(),
            messageData,
            result,
            error: error ? error.message : null
        };

        await this.eventBus.emit('WHATSAPP_MESSAGE_LOG', logEntry);
    }

    // Utility methods for message analysis
    async isOTPResponse(message) {
        // Implement OTP response detection logic
        return /^\d{6}$/.test(message.body.trim());
    }

    async isImportantMessage(message) {
        // Implement logic to detect important messages
        const importantKeywords = ['error', 'urgent', 'help', 'critical', 'security'];
        return importantKeywords.some(keyword => 
            message.body.toLowerCase().includes(keyword)
        );
    }

    async handleOTPResponse(message) {
        // Implement OTP response handling
        const otpCode = message.body.trim();
        await this.eventBus.emit('WHATSAPP_OTP_RECEIVED', {
            from: message.from,
            otpCode,
            timestamp: new Date()
        });
    }

    async forwardToAdmin(message) {
        const forwardMessage = `📩 *Forwarded Message*\n\n` +
                             `*From:* ${message.from}\n` +
                             `*Content:* ${message.body}\n` +
                             `*Time:* ${new Date(message.timestamp * 1000).toLocaleString()}`;

        await this.sendAdminNotification(forwardMessage);
    }
}

// Singleton instance
export const whatsappManager = new WhatsAppManager();
