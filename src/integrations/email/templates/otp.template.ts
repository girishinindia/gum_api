export const otpTemplate = (otp: string) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6;">
    <h2>Your OTP Code</h2>
    <p>Use the following code to continue:</p>
    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</div>
  </div>
`;
