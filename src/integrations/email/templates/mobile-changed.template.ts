import { baseLayout, successBox, warningBox, paragraph } from './base-layout.template';

export const mobileChangedTemplate = (name: string, newMobile: string): string => {
  // Mask the mobile: 98****3210
  const masked = newMobile.length >= 6
    ? `${newMobile.slice(0, 2)}${'*'.repeat(newMobile.length - 4)}${newMobile.slice(-4)}`
    : newMobile;

  const body = `
    ${successBox('Your mobile number has been changed successfully.')}
    ${paragraph(`The mobile number linked to your Grow Up More account has been updated to <strong>${masked}</strong>.`)}
    ${paragraph('All existing sessions have been logged out for security. Please log in again to continue.')}
    ${warningBox('If you did not make this change, your account may be compromised. Please contact our support team immediately and reset your password.')}
  `;

  return baseLayout({
    preheader: 'Your mobile number has been changed',
    title: 'Mobile Number Changed',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because the mobile number on your Grow Up More account was changed.'
  });
};
