import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  neonAuthConfigured,
  sendSignInCode,
  sendVerificationCode,
  signIn,
  signInWithCode,
  signUp,
  verifyEmail,
  type AuthUser,
} from "@/auth";

export type { AuthUser } from "@/auth";

type Mode = "signin" | "signup" | "verify" | "otp";

export default function Auth({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const registering = mode === "signup";
  const codeMode = mode === "verify" || mode === "otp";
  const heading =
    mode === "signup" ? "Create account" : mode === "verify" ? "Verify your email" : mode === "otp" ? "Sign in with a code" : "Welcome back";
  const subheading =
    mode === "signup"
      ? "We'll email a 6-digit code to confirm your address."
      : mode === "verify"
        ? `Enter the code sent to ${email || "your email"}.`
        : mode === "otp"
          ? otpSent
            ? `Enter the 6-digit code sent to ${email}.`
            : "We'll email you a one-time sign-in code."
          : "Sign in to continue to your workspace.";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setCode("");
    setOtpSent(false);
    setConfirmPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email, password);
        if (result.user) {
          onAuthenticated(result.user);
          return;
        }
        setMode("verify");
        setCode("");
        setNotice(`We sent a 6-digit verification code to ${email.trim().toLowerCase()}.`);
        return;
      }

      if (mode === "signin") {
        try {
          const user = await signIn(email, password);
          onAuthenticated(user);
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (/verif/i.test(message)) {
            await sendVerificationCode(email);
            setMode("verify");
            setCode("");
            setNotice(`Your email is not verified. We sent a new code to ${email.trim().toLowerCase()}.`);
            return;
          }
          throw err;
        }
        return;
      }

      if (mode === "verify") {
        const user = await verifyEmail(email, code);
        if (user) {
          onAuthenticated(user);
          return;
        }
        setMode("signin");
        setPassword("");
        setCode("");
        setNotice("Email verified. Sign in with your password.");
        return;
      }

      if (mode === "otp") {
        if (!otpSent) {
          await sendSignInCode(email);
          setOtpSent(true);
          setCode("");
          setNotice(`We sent a 6-digit sign-in code to ${email.trim().toLowerCase()}.`);
          return;
        }
        const user = await signInWithCode(email, code);
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+\s*/, "") : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "otp") {
        await sendSignInCode(email);
        setNotice(`We sent a new sign-in code to ${email.trim().toLowerCase()}.`);
      } else {
        await sendVerificationCode(email);
        setNotice(`We sent a new verification code to ${email.trim().toLowerCase()}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+\s*/, "") : "Unable to resend the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck size={20} strokeWidth={1.8} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">GuardLoop</h1>
          <p className="mt-1 text-sm text-muted-foreground">Local security lab</p>
        </div>

        <Card className="px-6 py-6">
          <div className="mb-6">
            <h2 className="text-lg font-medium tracking-tight">{heading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
          </div>

          {!neonAuthConfigured && (
            <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Neon Auth is not configured. Set <span className="mono text-xs">NEON_AUTH_BASE_URL</span> and restart the dev server.
            </p>
          )}

          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 bg-background"
                readOnly={codeMode && (mode === "verify" || otpSent)}
                required
              />
            </div>

            {!codeMode && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={registering ? "new-password" : "current-password"}
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-10 bg-background pr-10"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {registering && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-confirm">Confirm password</Label>
                <Input
                  id="auth-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-10 bg-background"
                  required
                />
              </div>
            )}

            {codeMode && (mode === "verify" || otpSent) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-code">6-digit code</Label>
                <Input
                  id="auth-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="h-10 bg-background tracking-[0.3em]"
                  required
                />
              </div>
            )}

            {notice && (
              <p role="status" className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                {notice}
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-1 h-10 w-full" disabled={busy || !neonAuthConfigured}>
              {busy && <Loader2 className="animate-spin" />}
              {busy
                ? "Please wait"
                : mode === "signup"
                  ? "Create account"
                  : mode === "verify"
                    ? "Verify email"
                    : mode === "otp"
                      ? otpSent
                        ? "Sign in"
                        : "Send code"
                      : "Sign in"}
            </Button>

            {codeMode && (mode === "verify" || otpSent) && (
              <button
                type="button"
                onClick={resendCode}
                disabled={busy}
                className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            )}
          </form>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("otp")}
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Email me a sign-in code instead
            </button>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {codeMode ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => switchMode("signin")}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            ) : (
              <>
                {registering ? "Already have an account?" : "New to GuardLoop?"}{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => switchMode(registering ? "signin" : "signup")}
                >
                  {registering ? "Sign in" : "Create an account"}
                </button>
              </>
            )}
          </p>
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Accounts are managed by Neon Auth. Codes expire after 10 minutes. Check your spam folder if it does not arrive. Scan data stays scoped to your user.
        </p>
      </div>
    </main>
  );
}
