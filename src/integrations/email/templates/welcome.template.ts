import { baseLayout, successBox, paragraph, infoBox } from './base-layout.template';

export const welcomeTemplate = (name: string): string => {
  const body = `
    ${successBox('Your account has been created and verified successfully!')}
    ${paragraph('Welcome aboard! We are thrilled to have you join the Grow Up More community. Your account is now active and ready to use.')}
    ${paragraph('Here is what you can do next:')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px; width: 100%;">
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E0F2FE;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width: 32px; text-align: center; vertical-align: top; padding-top: 2px;">
                <div style="width: 24px; height: 24px; background: #E0F2FE; border-radius: 50%; text-align: center;
                            line-height: 24px; font-size: 12px; font-weight: 700; color: #0284C7;">1</div>
              </td>
              <td style="padding-left: 10px;">
                <p style="margin: 0; font-size: 14px; color: #0F172A; font-weight: 600;">Complete Your Profile</p>
                <p style="margin: 2px 0 0; font-size: 13px; color: #475569;">Add your details to personalize your experience.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #E0F2FE;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width: 32px; text-align: center; vertical-align: top; padding-top: 2px;">
                <div style="width: 24px; height: 24px; background: #E0F2FE; border-radius: 50%; text-align: center;
                            line-height: 24px; font-size: 12px; font-weight: 700; color: #0284C7;">2</div>
              </td>
              <td style="padding-left: 10px;">
                <p style="margin: 0; font-size: 14px; color: #0F172A; font-weight: 600;">Explore Features</p>
                <p style="margin: 2px 0 0; font-size: 13px; color: #475569;">Discover tools and resources available to you.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width: 32px; text-align: center; vertical-align: top; padding-top: 2px;">
                <div style="width: 24px; height: 24px; background: #E0F2FE; border-radius: 50%; text-align: center;
                            line-height: 24px; font-size: 12px; font-weight: 700; color: #0284C7;">3</div>
              </td>
              <td style="padding-left: 10px;">
                <p style="margin: 0; font-size: 14px; color: #0F172A; font-weight: 600;">Stay Connected</p>
                <p style="margin: 2px 0 0; font-size: 13px; color: #475569;">Keep your contact info updated for important notifications.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${infoBox('If you have any questions or need help getting started, our support team is always here to assist you.')}
  `;

  return baseLayout({
    preheader: `Welcome to Grow Up More, ${name}!`,
    title: `Welcome, ${name}!`,
    greeting: `Hi ${name},`,
    body,
    footerNote: 'You received this email because you created an account on Grow Up More.'
  });
};
