import { config } from '../config';

export async function sendOtpEmail(email: string, name: string, otp: string): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': config.email.brevoApiKey },
    body: JSON.stringify({
      sender: { name: config.email.fromName, email: config.email.from },
      to: [{ email, name }],
      subject: `${otp} - Verification Code | Grow Up More`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;background:#fff;">
        <div style="text-align:center;padding:20px 0;border-bottom:2px solid #0b5ed7;"><h1 style="color:#0b5ed7;margin:0;">Grow Up More</h1></div>
        <div style="padding:30px 0;text-align:center;">
          <p style="color:#555;font-size:16px;">Hello <strong>${name}</strong>,</p>
          <p style="color:#555;">Your verification code:</p>
          <div style="background:#f0f7ff;padding:20px;border-radius:8px;margin:20px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0b5ed7;">${otp}</span>
          </div>
          <p style="color:#999;font-size:13px;">Valid for ${config.otp.expirySeconds / 60} minutes. Do not share.</p>
        </div>
        <div style="text-align:center;padding:20px 0;border-top:1px solid #eee;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} Grow Up More</div>
      </div>`,
    }),
  });
  if (!res.ok) throw new Error('Brevo email failed: ' + (await res.text()));
}
