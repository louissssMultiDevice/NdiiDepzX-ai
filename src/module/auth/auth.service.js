import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { EventBus } from '../../core/event-bus.js';
import { EncryptionService } from '../security/encryption.service.js';
import { EmailOTPService } from './email-otp.service.js';
import { WhatsAppOTPService } from './whatsapp-otp.service.js';
import { GoogleAuthService } from './google-auth.service.js';

export class AdvancedAuthService {
    constructor() {
        this.encryption = new EncryptionService();
        this.emailOTP = new EmailOTPService();
        this.whatsappOTP = new WhatsAppOTPService();
        this.googleAuth = new GoogleAuthService();
        this.eventBus = EventBus.getInstance();
        
        this.failedAttempts = new Map();
        this.lockedAccounts = new Map();
    }

    async register(userData) {
        try {
            // Step 1: Validate user data
            await this.validateRegistration(userData);
            
            // Step 2: Check for existing user
            if (await this.userExists(userData.email, userData.phone)) {
                throw new Error('User already exists');
            }

            // Step 3: Generate secure user ID
            const userId = this.generateSecureUserId();
            
            // Step 4: Encrypt sensitive data
            const encryptedUser = await this.encryptUserData(userData);
            
            // Step 5: Create verification session
            const verificationSession = await this.createVerificationSession(userId, userData);
            
            // Step 6: Send OTP via multiple channels
            await this.sendVerificationOTPs(userData, verificationSession);
            
            // Step 7: Log security event
            await this.logSecurityEvent('REGISTRATION_ATTEMPT', {
                userId,
                email: userData.email,
                phone: userData.phone,
                ip: userData.ipAddress
            });

            return {
                success: true,
                sessionId: verificationSession.sessionId,
                userId: userId,
                channels: verificationSession.channels,
                expiresAt: verificationSession.expiresAt
            };

        } catch (error) {
            await this.logSecurityEvent('REGISTRATION_FAILED', {
                email: userData.email,
                error: error.message,
                ip: userData.ipAddress
            });
            throw error;
        }
    }

    async verifyOTP(sessionId, otpCode, channel) {
        try {
            // Get verification session
            const session = await this.getVerificationSession(sessionId);
            if (!session) {
                throw new Error('Invalid session');
            }

            // Check attempts
            if (await this.isOTPBlocked(sessionId)) {
                throw new Error('Too many failed attempts');
            }

            // Verify OTP
            const isValid = await this.verifyOTPCode(session, otpCode, channel);
            
            if (isValid) {
                // Complete registration
                await this.completeRegistration(session);
                
                // Generate auth tokens
                const tokens = await this.generateAuthTokens(session.userId);
                
                await this.logSecurityEvent('REGISTRATION_COMPLETED', {
                    userId: session.userId,
                    channel: channel
                });

                return {
                    success: true,
                    tokens,
                    user: await this.getUserProfile(session.userId)
                };
            } else {
                await this.recordFailedAttempt(sessionId);
                throw new Error('Invalid OTP code');
            }

        } catch (error) {
            await this.logSecurityEvent('OTP_VERIFICATION_FAILED', {
                sessionId,
                channel,
                error: error.message
            });
            throw error;
        }
    }

    async login(credentials) {
        try {
            // Check if account is locked
            if (await this.isAccountLocked(credentials.identifier)) {
                throw new Error('Account temporarily locked');
            }

            // Validate credentials
            const user = await this.validateCredentials(credentials);
            
            // Check if 2FA is required
            if (user.twoFactorEnabled) {
                return await this.initiateTwoFactorAuth(user);
            }

            // Generate tokens
            const tokens = await this.generateAuthTokens(user.id);
            
            // Reset failed attempts
            this.resetFailedAttempts(credentials.identifier);
            
            await this.logSecurityEvent('LOGIN_SUCCESS', {
                userId: user.id,
                method: credentials.method
            });

            return {
                success: true,
                tokens,
                user: await this.getUserProfile(user.id)
            };

        } catch (error) {
            await this.recordFailedLogin(credentials.identifier);
            await this.logSecurityEvent('LOGIN_FAILED', {
                identifier: credentials.identifier,
                error: error.message,
                method: credentials.method
            });
            throw error;
        }
    }

    async initiateGoogleAuth() {
        try {
            const authUrl = await this.googleAuth.generateAuthUrl();
            
            await this.logSecurityEvent('GOOGLE_AUTH_INITIATED', {
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                authUrl,
                sessionId: this.generateSessionId()
            };
        } catch (error) {
            await this.logSecurityEvent('GOOGLE_AUTH_FAILED', {
                error: error.message
            });
            throw error;
        }
    }

    async handleGoogleCallback(code, sessionId) {
        try {
            const tokens = await this.googleAuth.exchangeCodeForTokens(code);
            const userInfo = await this.googleAuth.getUserInfo(tokens.access_token);
            
            // Find or create user
            const user = await this.findOrCreateGoogleUser(userInfo);
            
            // Send OTP for additional verification
            await this.sendAdditionalVerification(user);
            
            await this.logSecurityEvent('GOOGLE_AUTH_COMPLETED', {
                userId: user.id,
                email: userInfo.email
            });

            return {
                success: true,
                requiresAdditionalAuth: true,
                sessionId: this.generateSessionId(),
                user: {
                    id: user.id,
                    email: userInfo.email,
                    name: userInfo.name
                }
            };
        } catch (error) {
            await this.logSecurityEvent('GOOGLE_AUTH_CALLBACK_FAILED', {
                error: error.message
            });
            throw error;
        }
    }

    async sendWhatsAppOTP(phoneNumber, sessionId) {
        try {
            const otpCode = this.generateOTP();
            const message = `🔐 ndiidepzX-Ai Verification Code: ${otpCode}\n\nThis code will expire in 10 minutes.`;

            // Send to user
            await this.whatsappOTP.sendOTP(phoneNumber, otpCode);
            
            // Send notification to admin
            await this.whatsappOTP.sendAdminNotification(
                process.env.WHATSAPP_ADMIN_NUMBER,
                `📱 New OTP Request\nPhone: ${phoneNumber}\nSession: ${sessionId}`
            );

            // Store OTP securely
            await this.storeOTP(sessionId, phoneNumber, otpCode, 'whatsapp');

            await this.logSecurityEvent('WHATSAPP_OTP_SENT', {
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                sessionId
            });

            return { success: true };
        } catch (error) {
            await this.logSecurityEvent('WHATSAPP_OTP_FAILED', {
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                error: error.message
            });
            throw error;
        }
    }

    async sendEmailOTP(email, sessionId) {
        try {
            const otpCode = this.generateOTP();
            
            const emailTemplate = {
                subject: '🔐 ndiidepzX-Ai Verification Code',
                html: this.generateEmailTemplate(otpCode),
                text: `Your verification code is: ${otpCode}`
            };

            // Send to user
            await this.emailOTP.sendOTP(email, emailTemplate);
            
            // Send copy to admin email
            await this.emailOTP.sendAdminCopy(
                process.env.ADMIN_EMAIL,
                `📧 New OTP Request\nEmail: ${email}\nSession: ${sessionId}`
            );

            // Store OTP securely
            await this.storeOTP(sessionId, email, otpCode, 'email');

            await this.logSecurityEvent('EMAIL_OTP_SENT', {
                email: this.maskEmail(email),
                sessionId
            });

            return { success: true };
        } catch (error) {
            await this.logSecurityEvent('EMAIL_OTP_FAILED', {
                email: this.maskEmail(email),
                error: error.message
            });
            throw error;
        }
    }

    // Utility methods
    generateOTP() {
        return crypto.randomInt(100000, 999999).toString();
    }

    generateSecureUserId() {
        return crypto.randomBytes(16).toString('hex');
    }

    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    maskEmail(email) {
        const [local, domain] = email.split('@');
        return `${local[0]}***${local.slice(-1)}@${domain}`;
    }

    maskPhoneNumber(phone) {
        return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
    }

    async logSecurityEvent(eventType, data) {
        await this.eventBus.emit('SECURITY_EVENT', {
            type: eventType,
            timestamp: new Date().toISOString(),
            data: data
        });
    }

    // Placeholder methods for database operations
    async userExists(email, phone) {
        // Implement database check
        return false;
    }

    async storeOTP(sessionId, identifier, otpCode, channel) {
        // Implement secure OTP storage
    }

    async getVerificationSession(sessionId) {
        // Implement session retrieval
    }

    async validateCredentials(credentials) {
        // Implement credential validation
    }

    async encryptUserData(userData) {
        return await this.encryption.encrypt(JSON.stringify(userData));
    }
}
