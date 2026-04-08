// ─── Shared Light Blue Theme Base Layout ────────────────────
// All email templates use this wrapper for consistent branding.

const BRAND_NAME = 'Grow Up More';
const BRAND_COLOR = '#0284C7';       // sky-600
const BRAND_LIGHT = '#E0F2FE';       // sky-100
const BRAND_LIGHTER = '#F0F9FF';     // sky-50
const HEADER_GRADIENT = 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)';
const FOOTER_BG = '#F0F9FF';
const TEXT_PRIMARY = '#0F172A';       // slate-900
const TEXT_SECONDARY = '#475569';     // slate-600
const TEXT_MUTED = '#94A3B8';         // slate-400
const BORDER_COLOR = '#BAE6FD';      // sky-200

export interface BaseLayoutOptions {
  preheader?: string;
  title: string;
  greeting: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  year?: number;
}

export const baseLayout = (options: BaseLayoutOptions): string => {
  const year = options.year ?? new Date().getFullYear();

  const ctaBlock = options.ctaText && options.ctaUrl ? `
    <tr>
      <td align="center" style="padding: 8px 0 24px;">
        <a href="${options.ctaUrl}" target="_blank"
           style="display: inline-block; padding: 14px 36px; background: ${BRAND_COLOR};
                  color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;
                  border-radius: 8px; letter-spacing: 0.3px;">
          ${options.ctaText}
        </a>
      </td>
    </tr>` : '';

  const footerNote = options.footerNote ? `
    <tr>
      <td style="padding: 12px 0 0; color: ${TEXT_MUTED}; font-size: 12px; line-height: 1.5;">
        ${options.footerNote}
      </td>
    </tr>` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${options.title}</title>
  <!--[if mso]>
  <noscript><xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml></noscript>
  <![endif]-->
  ${options.preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${options.preheader}</span>` : ''}
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_LIGHTER}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND_LIGHTER};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; width: 100%;">

          <!-- Logo / Brand Header -->
          <tr>
            <td align="center" style="padding: 0 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-radius: 12px 12px 0 0; overflow: hidden;">
                <tr>
                  <td align="center" style="background: ${HEADER_GRADIENT}; padding: 28px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right: 10px; vertical-align: middle;">
                          <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.25); border-radius: 8px; text-align: center; line-height: 36px; font-size: 20px; color: #ffffff;">
                            &#9650;
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">${BRAND_NAME}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="background: #ffffff; border-radius: 0 0 12px 12px; border: 1px solid ${BORDER_COLOR}; border-top: none; margin-top: -24px;">
                <tr>
                  <td style="padding: 32px 32px 8px;">
                    <!-- Title -->
                    <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: ${TEXT_PRIMARY}; line-height: 1.3;">
                      ${options.title}
                    </h1>
                    <!-- Accent Line -->
                    <div style="width: 48px; height: 3px; background: ${BRAND_COLOR}; border-radius: 2px; margin-bottom: 20px;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 32px;">
                    <!-- Greeting -->
                    <p style="margin: 0 0 16px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">
                      ${options.greeting}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 32px;">
                    <!-- Body -->
                    ${options.body}
                  </td>
                </tr>
                ${ctaBlock}
                <tr>
                  <td style="padding: 16px 32px 32px;">
                    <p style="margin: 0; font-size: 14px; color: ${TEXT_SECONDARY}; line-height: 1.6;">
                      Warm regards,<br>
                      <strong style="color: ${TEXT_PRIMARY};">The ${BRAND_NAME} Team</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.6;">
                    <p style="margin: 0 0 4px;">&copy; ${year} ${BRAND_NAME}. All rights reserved.</p>
                    <p style="margin: 0;">This is an automated message. Please do not reply directly to this email.</p>
                  </td>
                </tr>
                ${footerNote}
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ─── Reusable Styled Components ─────────────────────────────

/** Big OTP code block */
export const otpBlock = (otp: string): string => `
  <div style="margin: 20px 0; padding: 20px; background: ${BRAND_LIGHT}; border: 2px dashed ${BRAND_COLOR};
              border-radius: 10px; text-align: center;">
    <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: ${TEXT_SECONDARY}; text-transform: uppercase; letter-spacing: 1.5px;">
      Verification Code
    </p>
    <div style="font-size: 36px; font-weight: 800; color: ${BRAND_COLOR}; letter-spacing: 8px; font-family: 'Courier New', monospace;">
      ${otp}
    </div>
  </div>
`;

/** Info box (light blue background) */
export const infoBox = (text: string): string => `
  <div style="margin: 16px 0; padding: 14px 18px; background: ${BRAND_LIGHT}; border-left: 4px solid ${BRAND_COLOR};
              border-radius: 0 8px 8px 0; font-size: 13px; color: ${TEXT_SECONDARY}; line-height: 1.5;">
    ${text}
  </div>
`;

/** Warning box (amber tint) */
export const warningBox = (text: string): string => `
  <div style="margin: 16px 0; padding: 14px 18px; background: #FFFBEB; border-left: 4px solid #F59E0B;
              border-radius: 0 8px 8px 0; font-size: 13px; color: #92400E; line-height: 1.5;">
    &#9888;&#65039; ${text}
  </div>
`;

/** Success box (green tint) */
export const successBox = (text: string): string => `
  <div style="margin: 16px 0; padding: 14px 18px; background: #F0FDF4; border-left: 4px solid #22C55E;
              border-radius: 0 8px 8px 0; font-size: 13px; color: #166534; line-height: 1.5;">
    &#10004;&#65039; ${text}
  </div>
`;

/** Paragraph text */
export const paragraph = (text: string): string => `
  <p style="margin: 0 0 14px; font-size: 15px; color: #475569; line-height: 1.6;">${text}</p>
`;

export { BRAND_NAME, BRAND_COLOR, TEXT_SECONDARY };
