import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { authenticateToken } from "./middleware/authMiddleware.js";
import saleRoutes from "./routes/saleRoutes.js";

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
app.use("/api/products", authenticateToken, productRoutes);
app.use("/api/categories", authenticateToken, categoryRoutes);
app.use("/api/sales",authenticateToken,saleRoutes);



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Invent POS API running on port ${PORT}`);
});