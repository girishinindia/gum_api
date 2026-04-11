import { baseLayout, paragraph, infoBox, warningBox } from './base-layout.template';

/**
 * Sent to a user after an administrator changes their role.
 *
 * Surfaces the diff (old → new) so the user has an audit trail
 * of what changed and can flag it if it was unexpected.
 */
export const roleChangedTemplate = (input: {
  name: string;
  oldRoleName: string;
  newRoleName: string;
  changedByName?: string | null;
}): string => {
  const actor = input.changedByName
    ? `An administrator (<strong>${input.changedByName}</strong>)`
    : 'An administrator';

  const body = `
    <div style="margin: 16px 0; padding: 14px 18px; background: #FEFCE8; border-left: 4px solid #EAB308;
                border-radius: 0 8px 8px 0; font-size: 13px; color: #713F12; line-height: 1.5;">
      Your role on Grow Up More has been changed.
    </div>
    ${paragraph(`${actor} has updated your role on your Grow Up More account. Your access permissions have changed accordingly.`)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 12px 0 20px; width: 100%;
                background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px;">
      <tr>
        <td style="padding: 12px 16px; font-size: 13px; color: #475569; border-bottom: 1px solid #BAE6FD;">
          <strong style="color: #0F172A;">Previous role:</strong> ${input.oldRoleName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-size: 13px; color: #475569;">
          <strong style="color: #0F172A;">New role:</strong> ${input.newRoleName}
        </td>
      </tr>
    </table>
    ${infoBox('You may notice changes to which features and pages you can access on your next sign-in. Existing sessions have been signed out for security.')}
    ${warningBox('If you did not expect this change or believe it was made in error, please contact your organization administrator immediately.')}
  `;

  return baseLayout({
    preheader: `Your Grow Up More role is now ${input.newRoleName}`,
    title: 'Role Changed',
    greeting: `Hi ${input.name},`,
    body,
    footerNote: 'You received this email because the role on your Grow Up More account was changed by an administrator.'
  });
};
