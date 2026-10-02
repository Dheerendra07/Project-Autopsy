import { env } from "../../config/env.js";

export const AUTH_EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;
export const AUTH_PASSWORD_RESET_TTL_MS = 60 * 60_000;
export const AUTH_EMAIL_SEND_TIMEOUT_MS = 10_000;

export type AuthEmailPurpose = "email_verification" | "password_reset";

export function isAuthEmailConfigured(): boolean {
  return Boolean(
    env.RESEND_API_KEY &&
      env.AUTOPSY_EMAIL_FROM &&
      env.AUTOPSY_PUBLIC_URL
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPublicUrl(path: string, token: string): string {
  return new URL(path + token, env.AUTOPSY_PUBLIC_URL).toString();
}

async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  idempotencyKey: string
): Promise<void> {
  if (!isAuthEmailConfigured()) {
    throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    AUTH_EMAIL_SEND_TIMEOUT_MS
  );

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        from: env.AUTOPSY_EMAIL_FROM,
        to: [to],
        subject,
        html,
        text
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("AUTH_EMAIL_SEND_FAILED");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AUTH_EMAIL_")) {
      throw error;
    }

    throw new Error("AUTH_EMAIL_SEND_FAILED", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  idempotencyKey: string
): Promise<void> {
  const safeEmail = escapeHtml(email);
  const link = buildPublicUrl("/?verify=", encodeURIComponent(token));

  await sendTransactionalEmail(
    email,
    "Verify your Project Autopsy account",
    `<!doctype html>
<html>
  <body style="margin:0;background:#f3efe6;color:#27231d;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px">
      <div style="font-size:11px;letter-spacing:.16em;color:#796b58">PROJECT AUTOPSY</div>
      <h1 style="font-size:28px;margin:12px 0">Verify your account</h1>
      <p style="line-height:1.6">Confirm that <strong>${safeEmail}</strong> belongs to you before using account recovery and other email-secured features.</p>
      <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 18px;background:#211d17;color:#fff;text-decoration:none;border-radius:7px">Verify email</a></p>
      <p style="font-size:12px;color:#756c60;line-height:1.6">This link expires in 24 hours. If you did not create this account, you can ignore this message.</p>
    </div>
  </body>
</html>`,
    `Verify your Project Autopsy account: ${link}

This link expires in 24 hours.`,
    idempotencyKey
  );
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  idempotencyKey: string
): Promise<void> {
  const link = buildPublicUrl("/?reset=", encodeURIComponent(token));

  await sendTransactionalEmail(
    email,
    "Reset your Project Autopsy password",
    `<!doctype html>
<html>
  <body style="margin:0;background:#f3efe6;color:#27231d;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px">
      <div style="font-size:11px;letter-spacing:.16em;color:#796b58">PROJECT AUTOPSY</div>
      <h1 style="font-size:28px;margin:12px 0">Reset your password</h1>
      <p style="line-height:1.6">A password reset was requested for <strong>${escapeHtml(email)}</strong>.</p>
      <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 18px;background:#211d17;color:#fff;text-decoration:none;border-radius:7px">Reset password</a></p>
      <p style="font-size:12px;color:#756c60;line-height:1.6">This link expires in 1 hour and can only be used once. If you did not request this, no action is required.</p>
    </div>
  </body>
</html>`,
    `Reset your Project Autopsy password: ${link}

This link expires in 1 hour and can only be used once.`,
    idempotencyKey
  );
}
