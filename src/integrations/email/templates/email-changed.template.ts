import { baseLayout, successBox, warningBox, paragraph, infoBox } from './base-layout.template';

/** Sent to the OLD email address after email change */
export const emailChangedNotifyTemplate = (name: string, newEmail: string): string => {
  // Mask the new email for privacy: gi****@example.com
  const [localPart, domain] = newEmail.split('@');
  const masked = localPart.length > 2
    ? `${localPart.slice(0, 2)}${'*'.repeat(Math.min(localPart.length - 2, 4))}@${domain}`
    : `${localPart}****@${domain}`;

  const body = `
    ${successBox('Your account email address has been changed successfully.')}
    ${paragraph(`The email address associated with your Grow Up More account has been updated to <strong>${masked}</strong>.`)}
    ${paragraph('All existing sessions have been logged out for security. Please log in again using your new email address.')}
    ${warningBox('If you did not make this change, your account may be compromised. Please contact our support team immediately.')}
  `;

  return baseLayout({
    preheader: 'Your account email address has been changed',
    title: 'Email Address Changed',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this notification at your previous email address because the email on your Grow Up More account was changed.'
  });
};

/** Sent to the NEW email address after email change */
export const emailChangedWelcomeTemplate = (name: string): string => {
  const body = `
    ${successBox('This email address is now linked to your Grow Up More account.')}
    ${paragraph('Your account email has been updated to this address. All future communications will be sent here.')}
    ${infoBox('Please use this email address to log in to your account going forward.')}
  `;

  return baseLayout({
    preheader: 'Your email has been updated on Grow Up More',
    title: 'Email Updated Successfully',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because this address was set as the new email on a Grow Up More account.'
  });
};
