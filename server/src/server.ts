import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import {
  authenticateToken,
  authorizeRoles,
} from "./middleware/authMiddleware.js";
import saleRoutes from "./routes/saleRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";

dotenv.config();

const app = express();


app.use(cors());


app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Invent POS API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/products",authenticateToken,productRoutes);
app.use( "/api/categories",authenticateToken,categoryRoutes);
app.use( "/api/sales", authenticateToken, authorizeRoles("admin", "manager", "cashier"),saleRoutes);
app.use("/api/dashboard", authenticateToken, authorizeRoles("admin", "manager", "cashier"), dashboardRoutes);
app.use("/api/reports",authenticateToken,authorizeRoles("admin", "manager"),reportRoutes);
app.use("/api/expenses",authenticateToken,authorizeRoles("admin", "manager"),expenseRoutes);
app.use("/api/suppliers", authenticateToken, supplierRoutes);
app.use("/api/customers", authenticateToken, customerRoutes);


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Invent POS API running on port ${PORT}`);
});