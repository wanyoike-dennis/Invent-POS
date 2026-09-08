import { Navigate, Outlet } from "react-router-dom";

export default function SuperAdminProtectedRoute() {
  const token = localStorage.getItem("superAdminToken");
  const userRaw = localStorage.getItem("superAdminUser");

  let validUser = false;

  try {
    const user = userRaw ? JSON.parse(userRaw) : null;
    validUser = user?.role === "super_admin";
  } catch {
    validUser = false;
  }

  if (!token || !validUser) {
    return <Navigate to="/super-admin/login" replace />;
  }

  return <Outlet />;
}
