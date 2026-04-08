import { baseLayout, paragraph, infoBox, warningBox } from './base-layout.template';

export const accountDeletedTemplate = (name: string): string => {
  const body = `
    <div style="margin: 16px 0; padding: 14px 18px; background: #FEF2F2; border-left: 4px solid #EF4444;
                border-radius: 0 8px 8px 0; font-size: 13px; color: #991B1B; line-height: 1.5;">
      Your Grow Up More account has been deleted.
    </div>
    ${paragraph('Your account has been soft-deleted by an administrator. You will no longer be able to log in or access any services linked to this account.')}
    ${paragraph('What this means:')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 4px 0 16px 8px;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">Your account data is retained but marked as deleted</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">All active sessions have been terminated</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #475569; vertical-align: top;">&#8226;&nbsp;&nbsp;</td>
        <td style="padding: 4px 0; font-size: 14px; color: #475569;">Your account can be restored by an administrator if needed</td>
      </tr>
    </table>
    ${infoBox('If you believe this was done in error, please contact our support team or your organization administrator to request account restoration.')}
    ${warningBox('You will not be able to log in until an administrator restores your account.')}
  `;

  return baseLayout({
    preheader: 'Your Grow Up More account has been deleted',
    title: 'Account Deleted',
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because your Grow Up More account was deleted by an administrator.'
  });
};
