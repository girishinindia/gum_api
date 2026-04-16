import { config } from '../config';

export async function sendOtpSms(mobile: string, name: string, otp: string): Promise<void> {
  const phone = mobile.replace('+', '');
  const message = `Dear ${name}, OTP is for new user registration is ${otp}. Thank You, Genius ITens (Grow Up More)`;
  const params = new URLSearchParams({
    APIKey: config.sms.apiKey, senderid: config.sms.senderId,
    channel: config.sms.channel, DCS: config.sms.dcs, flashsms: config.sms.flash,
    number: phone, text: message, route: config.sms.route,
    EntityId: config.sms.entityId, dlttemplateid: config.sms.dltTemplateId,
  });
  const res = await fetch(`https://www.smsgatewayhub.com/api/mt/SendSMS?${params}`);
  const data = await res.json();
  if (data.ErrorCode && data.ErrorCode !== '000') throw new Error('SMS failed: ' + (data.ErrorMessage || ''));
}
