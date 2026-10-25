import { createAuthClient, type VanillaBetterAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";

const authUrl = (import.meta.env.VITE_NEON_AUTH_URL || "").trim().replace(/\/$/, "");

export interface AuthUser {
  id: string | number;
  email: string;
  emailVerified?: boolean;
}

export interface SignUpResult {
  user: AuthUser | null;
  needsVerification: boolean;
}

// Neon Auth uses an HttpOnly session cookie. Include it for the cross-origin
// calls to the branch's managed auth service; API calls use short-lived JWTs.
export const neonAuthConfigured = Boolean(authUrl);

export const authClient = createAuthClient(authUrl || "http://127.0.0.1:9/neon-auth-not-configured", {
  adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: "include" } }),
}) as VanillaBetterAuthClient;

let cachedToken: { token: string; expiresAt: number } | null = null;

export function clearAuthTokenCache(): void {
  cachedToken = null;
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + 60_000;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 - 30_000 : Date.now() + 60_000;
  } catch {
    return Date.now() + 60_000;
  }
}

function toAuthUser(user: { id: string; email: string; emailVerified?: boolean }): AuthUser {
  return { id: user.id, email: user.email, emailVerified: user.emailVerified };
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getSessionUser(): Promise<AuthUser | null> {
  if (!neonAuthConfigured) return null;
  try {
    const result = await authClient.getSession();
    if (result.error || !result.data || !("user" in result.data) || !result.data.user) return null;
    return toAuthUser(result.data.user);
  } catch {
    return null;
  }
}

export async function getNeonJwt(): Promise<string | null> {
  if (!neonAuthConfigured) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  try {
    const session = await authClient.getSession();
    const sessionToken = typeof session.data?.session?.token === "string" ? session.data.session.token : null;
    if (sessionToken && tokenExpiry(sessionToken) > Date.now()) {
      cachedToken = { token: sessionToken, expiresAt: tokenExpiry(sessionToken) };
      return sessionToken;
    }
    // The Neon adapter caches `getSession()` responses. Its token endpoint is
    // routed through the same cache, so an ordinary call here can receive the
    // cached session object instead of a fresh `{ token }` response.
    const result = await authClient.token({
      fetchOptions: { headers: { "X-Force-Fetch": "true" } },
    });
    if (result.error) return null;
    const token = typeof result.data?.token === "string" ? result.data.token : null;
    if (!token) return null;
    cachedToken = { token, expiresAt: tokenExpiry(token) };
    return token;
  } catch {
    return null;
  }
}

function authError(result: { error?: { message?: string } | null }): Error | null {
  return result.error ? new Error(result.error.message || "Authentication failed") : null;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const result = await authClient.signIn.email({ email: normalizedEmail(email), password });
  const error = authError(result);
  if (error) throw error;
  clearAuthTokenCache();
  const user = await getSessionUser();
  if (!user) throw new Error("Sign-in did not create a session. Please try again.");
  return user;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const normalized = normalizedEmail(email);
  const result = await authClient.signUp.email({
    name: normalized.split("@")[0] || "User",
    email: normalized,
    password,
  });
  const error = authError(result);
  if (error) throw error;
  clearAuthTokenCache();
  const user = await getSessionUser();
  return { user, needsVerification: !user };
}

export async function verifyEmail(email: string, otp: string): Promise<AuthUser | null> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const result = await authClient.emailOtp.verifyEmail({ email: normalizedEmail(email), otp: otp.trim() });
  const error = authError(result);
  if (error) throw error;
  clearAuthTokenCache();
  return getSessionUser();
}

export async function sendVerificationCode(email: string): Promise<void> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const result = await authClient.emailOtp.sendVerificationOtp({
    email: normalizedEmail(email),
    type: "email-verification",
  });
  const error = authError(result);
  if (error) throw error;
}

export async function sendSignInCode(email: string): Promise<void> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const result = await authClient.emailOtp.sendVerificationOtp({
    email: normalizedEmail(email),
    type: "sign-in",
  });
  const error = authError(result);
  if (error) throw error;
}

export async function signInWithCode(email: string, otp: string): Promise<AuthUser> {
  if (!neonAuthConfigured) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and restart the dev server.");
  }
  const result = await authClient.signIn.emailOtp({ email: normalizedEmail(email), otp: otp.trim() });
  const error = authError(result);
  if (error) throw error;
  clearAuthTokenCache();
  const user = await getSessionUser();
  if (!user) throw new Error("The code was accepted, but no session was created. Please try again.");
  return user;
}

export async function signOut(): Promise<void> {
  clearAuthTokenCache();
  try {
    await authClient.signOut();
  } catch {
    // The local session is already cleared; a failed network sign-out should
    // not trap the user inside the app.
  }
}
