import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { EventBus } from '../../core/event-bus.js';

export class GmailManager {
    constructor() {
        this.oAuth2Client = null;
        this.transporter = null;
        this.eventBus = EventBus.getInstance();
        this.initializeOAuth();
    }

    initializeOAuth() {
        this.oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        // Set credentials if available
        if (process.env.GOOGLE_ACCESS_TOKEN) {
            this.oAuth2Client.setCredentials({
                access_token: process.env.GOOGLE_ACCESS_TOKEN,
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN
            });
        }
    }

    async initializeTransporter() {
        if (this.transporter) return;

        const accessToken = await this.oAuth2Client.getAccessToken();

        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
                accessToken: accessToken.token
            }
        });

        // Verify connection
        await this.transporter.verify();
        console.log('✅ Gmail transporter ready');
    }

    async sendEmail(emailData) {
        try {
            await this.initializeTransporter();

            const mailOptions = {
                from: {
                    name: 'ndiidepzX-Ai Security System',
                    address: process.env.EMAIL_USER
                },
                to: emailData.to,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text,
                attachments: emailData.attachments,
                headers: {
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'high'
                }
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            await this.logEmail('SENT', emailData, result);
            
            return {
                success: true,
                messageId: result.messageId,
                response: result.response
            };

        } catch (error) {
            await this.logEmail('FAILED', emailData, null, error);
            throw error;
        }
    }

    async sendOTPEmail(to, otpCode, sessionId) {
        const emailTemplate = this.generateOTPEmailTemplate(otpCode, sessionId);
        
        return await this.sendEmail({
            to,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text
        });
    }

    async sendSecurityAlert(alertData) {
        const alertTemplate = this.generateSecurityAlertTemplate(alertData);
        
        // Send to admin
        await this.sendEmail({
            to: process.env.ADMIN_EMAIL,
            subject: alertTemplate.subject,
            html: alertTemplate.html,
            text: alertTemplate.text
        });

        // Send to secondary admin if exists
        if (process.env.SECONDARY_ADMIN_EMAIL) {
            await this.sendEmail({
                to: process.env.SECONDARY_ADMIN_EMAIL,
                subject: alertTemplate.subject,
                html: alertTemplate.html,
                text: alertTemplate.text
            });
        }
    }

    generateOTPEmailTemplate(otpCode, sessionId) {
        const expirationTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        return {
            subject: '🔐 ndiidepzX-Ai Verification Code',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 10px;
        }
        .header { 
            text-align: center; 
            color: white; 
            padding: 20px; 
        }
        .content { 
            background: white; 
            padding: 30px; 
            border-radius: 10px; 
            margin: 20px 0; 
        }
        .otp-code { 
            font-size: 48px; 
            font-weight: bold; 
            text-align: center; 
            color: #667eea; 
            margin: 20px 0; 
        }
        .security-note { 
            background: #fff3cd; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0; 
        }
        .footer { 
            text-align: center; 
            color: white; 
            font-size: 12px; 
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 ndiidepzX-Ai</h1>
            <p>Super Advanced AI Security System</p>
        </div>
        <div class="content">
            <h2>Verification Code Required</h2>
            <p>Please use the following code to complete your authentication:</p>
            
            <div class="otp-code">${otpCode}</div>
            
            <div class="security-note">
                <strong>Security Notice:</strong>
                <ul>
                    <li>This code will expire at ${expirationTime.toLocaleString()}</li>
                    <li>Session ID: ${sessionId}</li>
                    <li>If you didn't request this, please ignore this email</li>
                </ul>
            </div>
            
            <p>For security reasons, do not share this code with anyone.</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 ndiidepzX-Ai Security System. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
            `,
            text: `
ndiidepzX-Ai Verification Code

Your verification code is: ${otpCode}

This code will expire at: ${expirationTime.toLocaleString()}

Session ID: ${sessionId}

For security reasons, do not share this code with anyone.

If you didn't request this verification, please ignore this email.
            `
        };
    }

    generateSecurityAlertTemplate(alertData) {
        return {
            subject: `🚨 SECURITY ALERT: ${alertData.type}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .alert-container { 
            max-width: 600px; 
            margin: 0 auto; 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            padding: 20px;
            border-radius: 10px;
        }
        .alert-header { 
            text-align: center; 
            color: white; 
            padding: 20px; 
        }
        .alert-content { 
            background: white; 
            padding: 30px; 
            border-radius: 10px; 
            margin: 20px 0; 
        }
        .alert-critical { 
            background: #ffcccc; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 15px 0; 
        }
    </style>
</head>
<body>
    <div class="alert-container">
        <div class="alert-header">
            <h1>🚨 SECURITY ALERT</h1>
            <p>ndiidepzX-Ai Security System</p>
        </div>
        <div class="alert-content">
            <h2>${alertData.type}</h2>
            
            <div class="alert-critical">
                <strong>CRITICAL:</strong> Immediate attention required
            </div>
            
            <table>
                <tr><td><strong>Description:</strong></td><td>${alertData.description}</td></tr>
                <tr><td><strong>Severity:</strong></td><td>${alertData.severity}</td></tr>
                <tr><td><strong>Timestamp:</strong></td><td>${new Date(alertData.timestamp).toLocaleString()}</td></tr>
                <tr><td><strong>IP Address:</strong></td><td>${alertData.ip || 'N/A'}</td></tr>
                <tr><td><strong>User Agent:</strong></td><td>${alertData.userAgent || 'N/A'}</td></tr>
            </table>
            
            <h3>Recommended Actions:</h3>
            <ul>
                <li>Review system logs immediately</li>
                <li>Check user activity</li>
                <li>Verify system integrity</li>
                <li>Update security protocols if necessary</li>
            </ul>
        </div>
    </div>
</body>
</html>
            `,
            text: `
SECURITY ALERT: ${alertData.type}

Description: ${alertData.description}
Severity: ${alertData.severity}
Timestamp: ${new Date(alertData.timestamp).toLocaleString()}
IP Address: ${alertData.ip || 'N/A'}
User Agent: ${alertData.userAgent || 'N/A'}

CRITICAL: Immediate attention required

Recommended Actions:
- Review system logs immediately
- Check user activity
- Verify system integrity
- Update security protocols if necessary
            `
        };
    }

    async logEmail(status, emailData, result = null, error = null) {
        const logEntry = {
            status,
            timestamp: new Date(),
            to: emailData.to,
            subject: emailData.subject,
            result,
            error: error ? error.message : null
        };

        await this.eventBus.emit('EMAIL_LOG', logEntry);
    }

    async getAuthUrl() {
        return this.oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.readonly'
            ]
        });
    }

    async setCredentials(code) {
        const { tokens } = await this.oAuth2Client.getToken(code);
        this.oAuth2Client.setCredentials(tokens);
        return tokens;
    }
}

// Singleton instance
export const gmailManager = new GmailManager();
