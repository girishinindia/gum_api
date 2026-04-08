import { baseLayout, successBox, warningBox, paragraph, infoBox } from './base-layout.template';

export const passwordChangedTemplate = (name: string): string => {
  const body = `
    ${successBox('Your password has been changed successfully.')}
    ${paragraph('Your account password was updated just now. All existing sessions have been logged out for security. Please log in again with your new password.')}
    ${warningBox('If you did not make this change, your account may be compromised. Please reset your password immediately using the "Forgot Password" option and contact our support team.')}
    ${infoBox('<strong>Security Tip:</strong> Use a strong, unique password that includes uppercase letters, lowercase letters, and numbers. Never reuse passwords across different services.')}
  `;

  return baseLayout({
    preheader: 'Your password has been changed successfully',
    title: 'Password Changed',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because your Grow Up More account password was changed.'
  });
};
