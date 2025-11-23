import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import './otp-verification.css';

export const OTPVerification = ({ sessionId, userId, channels, onVerified, onCancel }) => {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [activeChannel, setActiveChannel] = useState(channels[0]);
    const [countdown, setCountdown] = useState(600); // 10 minutes
    const [isResending, setIsResending] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState('pending');
    
    const inputRefs = useRef([]);
    const { verifyOTP, resendOTP } = useAuth();
    const { lastMessage } = useWebSocket('/auth');

    useEffect(() => {
        // Start countdown
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Handle WebSocket messages for OTP auto-fill
        if (lastMessage && lastMessage.type === 'OTP_AUTO_FILL') {
            const receivedOTP = lastMessage.otp;
            if (receivedOTP.length === 6) {
                const otpArray = receivedOTP.split('');
                setOtp(otpArray);
                handleVerify(otpArray.join(''));
            }
        }
    }, [lastMessage]);

    const handleOtpChange = (value, index) => {
        if (!/^\d?$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all digits are filled
        if (newOtp.every(digit => digit !== '') && index === 5) {
            handleVerify(newOtp.join(''));
        }
    };

    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async (otpCode = otp.join('')) => {
        if (otpCode.length !== 6) return;

        setVerificationStatus('verifying');
        
        try {
            const result = await verifyOTP(sessionId, otpCode, activeChannel);
            
            if (result.success) {
                setVerificationStatus('success');
                setTimeout(() => onVerified(result), 1000);
            } else {
                setVerificationStatus('error');
                // Clear OTP on error
                setOtp(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } catch (error) {
            setVerificationStatus('error');
            console.error('OTP verification failed:', error);
        }
    };

    const handleResendOTP = async () => {
        setIsResending(true);
        try {
            await resendOTP(sessionId, activeChannel);
            setCountdown(600); // Reset to 10 minutes
            setOtp(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } catch (error) {
            console.error('Failed to resend OTP:', error);
        } finally {
            setIsResending(false);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="otp-verification futuristic-card">
            <div className="verification-header">
                <div className="security-badge">
                    <i className="fas fa-shield-check"></i>
                    <span>Secure Verification</span>
                </div>
                <h2>Two-Factor Authentication</h2>
                <p>Enter the verification code sent to your {activeChannel}</p>
            </div>

            <div className="channel-selector">
                {channels.map(channel => (
                    <button
                        key={channel}
                        className={`channel-btn ${activeChannel === channel ? 'active' : ''}`}
                        onClick={() => setActiveChannel(channel)}
                    >
                        <i className={`fas fa-${channel === 'email' ? 'envelope' : 'comment'}`}></i>
                        {channel === 'email' ? 'Email' : 'WhatsApp'}
                    </button>
                ))}
            </div>

            <div className="otp-input-container">
                <div className="otp-inputs">
                    {otp.map((digit, index) => (
                        <input
                            key={index}
                            ref={el => inputRefs.current[index] = el}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength="1"
                            value={digit}
                            onChange={(e) => handleOtpChange(e.target.value, index)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className={`otp-digit ${verificationStatus === 'error' ? 'error' : ''}`}
                            disabled={verificationStatus === 'verifying'}
                        />
                    ))}
                </div>
                
                {verificationStatus === 'error' && (
                    <div className="error-message">
                        <i className="fas fa-exclamation-triangle"></i>
                        Invalid verification code. Please try again.
                    </div>
                )}
            </div>

            <div className="verification-footer">
                <div className="countdown">
                    <i className="fas fa-clock"></i>
                    Code expires in: <span className="time">{formatTime(countdown)}</span>
                </div>

                <button
                    className="resend-btn"
                    onClick={handleResendOTP}
                    disabled={countdown > 0 || isResending || verificationStatus === 'verifying'}
                >
                    {isResending ? (
                        <>
                            <i className="fas fa-spinner fa-spin"></i>
                            Sending...
                        </>
                    ) : (
                        <>
                            <i className="fas fa-redo"></i>
                            Resend Code
                        </>
                    )}
                </button>
            </div>

            {verificationStatus === 'verifying' && (
                <div className="verification-overlay">
                    <div className="spinner"></div>
                    <p>Verifying code...</p>
                </div>
            )}

            {verificationStatus === 'success' && (
                <div className="success-animation">
                    <i className="fas fa-check-circle"></i>
                    <p>Verification Successful!</p>
                </div>
            )}
        </div>
    );
};
