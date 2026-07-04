"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts";
import { getSafeRedirectUrl } from "@/utils/redirect";
import { useSearchParams } from "next/navigation";

type AuthError = {
  status?: number;
  message?: string;
  error_description?: string;
  error?: string;
};

function formatSignInError(err: unknown, tErrors: ReturnType<typeof useTranslations>): string {
  const errorObj: AuthError = err && typeof err === "object" ? (err as AuthError) : {};
  const status = typeof errorObj.status === "number" ? errorObj.status : undefined;
  const errMsg =
    (typeof errorObj.message === "string" ? errorObj.message : null) ||
    (typeof errorObj.error_description === "string" ? errorObj.error_description : null) ||
    (typeof errorObj.error === "string" ? errorObj.error : null) ||
    "";

  const msg = errMsg.toLowerCase();
  if (msg.includes("invalid") && (msg.includes("credentials") || msg.includes("email"))) {
    return tErrors("invalidCredentials");
  }
  if (msg.includes("email not confirmed")) {
    return tErrors("invalidCredentials");
  }
  if (msg.includes("too many requests") || status === 429) {
    return tErrors("tooManyRequests");
  }
  if (msg.includes("rate limit")) {
    return tErrors("rateLimitExceeded");
  }
  if (msg.includes("network") || msg.includes("connection")) {
    return tErrors("networkError");
  }

  if (process.env.NODE_ENV !== "development") {
    return tErrors("invalidCredentials");
  }
  return tErrors("unexpected");
}

export const EmailSignInForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tSignin = useTranslations("auth.signin");
  const tFields = useTranslations("auth.fields");
  const tErrors = useTranslations("auth.errors");
  const tAuth = useTranslations("auth");

  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(formatSignInError(signInError, tErrors));
      } else {
        const redirectTo = getSafeRedirectUrl(searchParams.get("redirect_to"));
        router.push(redirectTo);
      }
    } catch {
      setError(tErrors("unexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full space-y-4 sm:space-y-6 bg-white p-4 sm:p-8 rounded-2xl shadow-xl">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
          {tSignin("emailPageTitle")}
        </h2>
        <p className="text-xs sm:text-sm text-gray-600">{tSignin("emailPageSubtitle")}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-red-400 mt-0.5 mr-3 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {tFields("email")}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            </div>
            <input
              type="email"
              id="email"
              data-testid="email-input"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {tFields("password")}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <input
              type="password"
              id="password"
              data-testid="password-input"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={tFields("password")}
              minLength={6}
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Link
            href="/reset-password"
            className="text-sm text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
            data-testid="forgot-password-link"
          >
            {tAuth("forgotPassword")}
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="login-button"
          className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out shadow-md"
        >
          {loading ? tSignin("loadingButton") : tSignin("submitButton")}
        </button>
      </form>

      <div className="text-center space-y-3 pt-2">
        <Link
          href="/login"
          className="block text-sm font-medium text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
          data-testid="back-to-login-options-link"
        >
          {tSignin("otherMethods")}
        </Link>
        <Link
          href="/signup"
          className="block text-xs text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
          data-testid="signup-link"
        >
          {tAuth("switchToSignup")}
        </Link>
      </div>
    </div>
  );
};
