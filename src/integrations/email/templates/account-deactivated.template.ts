import { baseLayout, paragraph, infoBox, warningBox } from './base-layout.template';

export const accountDeactivatedTemplate = (name: string): string => {
  const body = `
    <div style="margin: 16px 0; padding: 14px 18px; background: #FEF2F2; border-left: 4px solid #EF4444;
                border-radius: 0 8px 8px 0; font-size: 13px; color: #991B1B; line-height: 1.5;">
      Your Grow Up More account has been deactivated.
    </div>
    ${paragraph('Your account access has been suspended. You will no longer be able to log in or use any services associated with this account.')}
    ${paragraph('This may have happened because:')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 4px 0 16px 8px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">An administrator deactivated your account</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">A security concern was detected on your account</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">Your account violated our terms of service</td>
      </tr>
    </table>
    ${infoBox('If you believe this was done in error or would like to request reactivation, please reach out to our support team for assistance.')}
    ${warningBox('Any active sessions have been terminated. You will not be able to access your data until the account is reactivated.')}
  `;

  return baseLayout({
    preheader: 'Your Grow Up More account has been deactivated',
    title: 'Account Deactivated',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because your Grow Up More account status was changed.'
  });
};
