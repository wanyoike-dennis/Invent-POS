import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api";

import {
  LockKeyhole,
  Mail,
  ShoppingCart,
  Boxes,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await apiFetch(
        //"https://6f7c-41-90-137-114.ngrok-free.app/api/auth/login",
        "/api/auth/login", 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);

      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      setError("Could not connect to the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F8FA] lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      {/* Brand story */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[#071827] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'url("/brand/pattern-pos-dashboard.svg")',
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />

        <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#18C8E8]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#246BFD]/15 blur-3xl" />

        <div className="relative z-10">
          <img
            src="/brand/invent-pos-logo-reversed-transparent.svg"
            alt="Invent POS"
            className="h-14 w-auto max-w-[220px]"
          />

          <div className="mt-20 max-w-xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#18C8E8]">
              Sell clearly. Know your numbers.
            </p>

            <h1 className="text-4xl font-bold leading-[1.15] text-white xl:text-5xl">
              One clear view of your business.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300 xl:text-lg xl:leading-8">
              Record sales, control stock, track expenses and understand
              performance from one practical system.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="grid max-w-2xl grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm">
              <ShoppingCart size={22} className="mb-4 text-[#18C8E8]" />
              <p className="font-semibold text-white">Fast selling</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">
                Complete everyday sales with clear, practical actions.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm">
              <Boxes size={22} className="mb-4 text-[#18C8E8]" />
              <p className="font-semibold text-white">Stock control</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">
                Know what is available and what needs attention.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm">
              <BarChart3 size={22} className="mb-4 text-[#18C8E8]" />
              <p className="font-semibold text-white">Useful numbers</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">
                Review sales, expenses and profit without the clutter.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm">
              <ShieldCheck size={22} className="mb-4 text-[#18C8E8]" />
              <p className="font-semibold text-white">Reliable access</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">
                Role-based access keeps everyday work organized.
              </p>
            </div>
          </div>

          <p className="mt-8 text-xs text-slate-500">
            Invent POS • A product of Invent Solutions
          </p>
        </div>
      </section>

      {/* Sign in */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-9 flex justify-center lg:hidden">
            <img
              src="/brand/invent-pos-logo-primary-horizontal.svg"
              alt="Invent POS"
              className="h-14 w-auto max-w-[210px]"
            />
          </div>

          <div className="mb-8">
            <p className="mb-3 text-sm font-semibold text-[#246BFD]">
              Welcome back.
            </p>

            <h2 className="text-3xl font-bold text-[#071827] sm:text-4xl">
              Let&apos;s get selling.
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Sign in to access your Invent POS workspace.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(7,24,39,0.08)] sm:p-8">
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-[#071827]"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#246BFD] focus:ring-4 focus:ring-[#246BFD]/10"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-[#071827]"
                >
                  Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#246BFD] focus:ring-4 focus:ring-[#246BFD]/10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#246BFD] px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-[#1D5EEA] focus:outline-none focus:ring-4 focus:ring-[#246BFD]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-7 border-t border-slate-200 pt-5 text-center">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-400">
                <ShieldCheck size={15} />
                Secure access to Invent POS
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">
            Invent POS • A product of Invent Solutions
          </p>
        </div>
      </main>
    </div>
  );
}

export default Login;
