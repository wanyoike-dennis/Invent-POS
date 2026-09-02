
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

const routeRoles: Record<string, string[]> = {
  "/dashboard": ["admin", "manager", "cashier"],
  "/products": ["admin", "manager", "cashier"],
  "/inventory": ["admin", "manager"],
  "/sales": ["admin", "manager", "cashier"],
  "/customers": ["admin", "manager", "cashier"],
  "/suppliers": ["admin", "manager", "cashier"],
  "/expenses": ["admin", "manager"],
  "/reports": ["admin", "manager"],
  "/settings": ["admin"],
};

function ProtectedRoute() {
  const location = useLocation();

  const token = localStorage.getItem("token");
  const storedUser = localStorage.getItem("user");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  let user: {
    role?: string;
  } | null = null;

  try {
    user = storedUser
      ? JSON.parse(storedUser)
      : null;
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    return <Navigate to="/" replace />;
  }

  if (!user?.role) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    return <Navigate to="/" replace />;
  }

  const userRole = String(user.role).toLowerCase();

  const matchedRoute = Object.keys(routeRoles)
    .sort((a, b) => b.length - a.length)
    .find(
      (path) =>
        location.pathname === path ||
        location.pathname.startsWith(`${path}/`)
    );

  if (matchedRoute) {
    const allowedRoles = routeRoles[matchedRoute];

    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
