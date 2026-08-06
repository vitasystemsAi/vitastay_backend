const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');

let transporter = null;

const getTransporter = () => {
  if (!transporter && config.smtp.host) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn(`Email not sent (SMTP not configured): ${subject} -> ${to}`);
    return { success: false, message: 'SMTP not configured' };
  }

  try {
    const info = await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Email send failed:', err);
    throw err;
  }
};

const sendOtpEmail = async (email, otp, type = 'password_reset') => {
  const subjects = {
    password_reset: 'Password Reset OTP - Vita Stay',
    email_verify: 'Email Verification OTP - Vita Stay',
    login: 'Login OTP - Vita Stay',
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1976d2;">Vita Stay</h2>
      <p>Your OTP for ${type.replace('_', ' ')} is:</p>
      <h1 style="color: #1976d2; letter-spacing: 8px;">${otp}</h1>
      <p>This OTP expires in ${config.otpExpiresMinutes} minutes.</p>
      <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  return sendEmail({ to: email, subject: subjects[type] || 'OTP - Vita Stay', html });
};

module.exports = { sendEmail, sendOtpEmail };
