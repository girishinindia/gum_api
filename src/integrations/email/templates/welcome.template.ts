import { baseLayout, successBox, paragraph, infoBox, warningBox } from './base-layout.template';

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

// ─── Admin-created variant ─────────────────────────────────
//
// Sent when an administrator creates an account on the user's
// behalf via POST /api/v1/users. The user did not pick their
// own password, so the email points them at the
// "forgot password" flow on the login page to set one.

export const welcomeAdminCreatedTemplate = (input: {
  name: string;
  email: string;
  loginUrl: string;
  setPasswordUrl: string;
  createdByName?: string | null;
}): string => {
  const createdLine = input.createdByName
    ? `An administrator (<strong>${input.createdByName}</strong>) has created a Grow Up More account for you.`
    : `An administrator has created a Grow Up More account for you.`;

  const body = `
    ${successBox('Your Grow Up More account is ready.')}
    ${paragraph(createdLine)}
    ${paragraph('Here are your account details:')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px; width: 100%;
                background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px;">
      <tr>
        <td style="padding: 12px 16px; font-size: 13px; color: #475569;">
          <strong style="color: #0F172A;">Login email:</strong> ${input.email}
        </td>
      </tr>
    </table>
    ${paragraph('To set your password and access your account for the first time, click the button below. You will be sent a one-time verification code to your email and mobile.')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 12px 0 20px;">
      <tr>
        <td align="center">
          <a href="${input.setPasswordUrl}" target="_blank"
             style="display: inline-block; padding: 12px 28px; background: #0284C7;
                    color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none;
                    border-radius: 8px;">
            Set Your Password
          </a>
        </td>
      </tr>
    </table>
    ${infoBox(`Already set your password? <a href="${input.loginUrl}" style="color: #0284C7; text-decoration: underline;">Sign in here</a>.`)}
    ${warningBox('If you did not expect this account, you can safely ignore this email — without setting a password, no one can sign in.')}
  `;

  return baseLayout({
    preheader: `Your Grow Up More account is ready, ${input.name}`,
    title: `Welcome, ${input.name}!`,
    greeting: `Hi ${input.name},`,
    body,
    footerNote: 'You received this email because an administrator created an account for you on Grow Up More.'
  });
};
