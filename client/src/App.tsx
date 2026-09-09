import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminBilling from "./pages/SuperAdminBilling";
import SuperAdminPlans from "./pages/SuperAdminPlans";
import SuperAdminOrganizationDetails from "./pages/SuperAdminOrganizationDetails";
import SuperAdminProtectedRoute from "./components/SuperAdminProtectedRoute";

import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>

      {/* Public routes */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />

      {/* Super Admin routes */}
      <Route path="/super-admin/login" element={<SuperAdminLogin />} />
      <Route element={<SuperAdminProtectedRoute />}>
        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
        <Route path="/super-admin/billing" element={<SuperAdminBilling />} />
        <Route path="/super-admin/plans" element={<SuperAdminPlans />} />
        <Route path="/super-admin/organizations/:id" element={<SuperAdminOrganizationDetails />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>

        <Route element={<MainLayout />}>

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/products"
            element={<Products />}
          />

          <Route
            path="/inventory"
            element={<Inventory />}
          />

          <Route
            path="/sales"
            element={<Sales />}
          />

          <Route
            path="/customers"
            element={<Customers />}
          />

          <Route
            path="/suppliers"
            element={<Suppliers />}
          />

          <Route
            path="/expenses"
            element={<Expenses />}
          />

          <Route
            path="/reports"
            element={<Reports />}
          />

          <Route
            path="/settings"
            element={<Settings />}
          />

        </Route>

      </Route>

    </Routes>
  );
}

export default App;