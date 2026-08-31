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
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-2">

      {/* Left branding section */}
      <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">

        {/* Decorative shapes */}
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        {/* Brand */}
        <div className="relative z-10">

          <div className="mb-12 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-900/30">
              IP
            </div>

            <div>
              <h1 className="text-xl font-bold text-white">
                Invent POS
              </h1>

              <p className="text-sm text-slate-400">
                Business Management System
              </p>
            </div>
          </div>

          <div className="max-w-lg">

            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
              Smarter business management
            </p>

            <h2 className="text-4xl font-bold leading-tight text-white">
              Manage sales, stock and business performance from one place.
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-400">
              Invent POS gives small businesses a simple way to manage
              products, inventory, sales and reporting in one system.
            </p>

          </div>

        </div>

        {/* Feature cards */}
        <div className="relative z-10 grid grid-cols-2 gap-4">

          <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4 backdrop-blur">
            <ShoppingCart
              size={22}
              className="mb-3 text-blue-400"
            />

            <p className="font-medium text-white">
              Point of Sale
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Fast and simple checkout
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4 backdrop-blur">
            <Boxes
              size={22}
              className="mb-3 text-blue-400"
            />

            <p className="font-medium text-white">
              Inventory
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Track stock in real time
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4 backdrop-blur">
            <BarChart3
              size={22}
              className="mb-3 text-blue-400"
            />

            <p className="font-medium text-white">
              Reports
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Understand business performance
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4 backdrop-blur">
            <ShieldCheck
              size={22}
              className="mb-3 text-blue-400"
            />

            <p className="font-medium text-white">
              Secure Access
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Protected user accounts
            </p>
          </div>

        </div>

      </div>

      {/* Login section */}
      <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-12">

        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
              IP
            </div>

            <div>
              <h1 className="text-lg font-bold text-slate-800">
                Invent POS
              </h1>

              <p className="text-xs text-slate-500">
                Business Management
              </p>
            </div>

          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">

            <div className="mb-7">

              <p className="mb-2 text-sm font-medium text-blue-600">
                Welcome back
              </p>

              <h2 className="text-3xl font-bold text-slate-800">
                Sign in to your account
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your account details to access Invent POS.
              </p>

            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >

              {/* Email */}
              <div>

                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </label>

                <div className="relative">

                  <Mail
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@inventpos.com"
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                </div>

              </div>

              {/* Password */}
              <div>

                <div className="mb-2 flex items-center justify-between">

                  <label className="text-sm font-medium text-slate-700">
                    Password
                  </label>

                  <button
                    type="button"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Forgot password?
                  </button>

                </div>

                <div className="relative">

                  <LockKeyhole
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                </div>

              </div>

              {/* Sign in */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Signing in..."
                  : "Sign In"}
              </button>

            </form>

            <div className="mt-7 border-t border-slate-200 pt-5 text-center">

              <p className="text-xs text-slate-400">
                Secure access to Invent POS
              </p>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Login;