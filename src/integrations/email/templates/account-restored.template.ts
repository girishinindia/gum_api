import { baseLayout, successBox, paragraph, infoBox } from './base-layout.template';

export const accountRestoredTemplate = (name: string): string => {
  const body = `
    ${successBox('Great news! Your Grow Up More account has been restored.')}
    ${paragraph('An administrator has restored your account. You now have full access to all services linked to your account once again.')}
    ${paragraph('What you should do next:')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 4px 0 16px 8px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;"><strong>Log in</strong> to your account using your existing credentials</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;"><strong>Review your profile</strong> and ensure all your information is up to date</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;"><strong>Change your password</strong> if you have any security concerns</td>
      </tr>
    </table>
    ${infoBox('All your previous data, roles, and permissions have been preserved. If anything seems missing or incorrect, please contact our support team.')}
  `;

  return baseLayout({
    preheader: 'Your Grow Up More account has been restored',
    title: 'Account Restored',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because your Grow Up More account was restored by an administrator.'
  });
};
