import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../database/db.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "invent-pos-secret-key";

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Name, email and password are required",
    });
  }

  try {
    const existingUser = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.trim().toLowerCase());

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db
      .prepare(`
        INSERT INTO users (
          name,
          email,
          password,
          role
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(
        name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        "admin"
      );

    res.status(201).json({
      message: "User registered successfully",
      userId: result.lastInsertRowid,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to register user",
    });
  }
});


// ============================================================
// CREATE STAFF USER
// Admin only
// ============================================================

router.post(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req: AuthRequest, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, email, password and role are required",
      });
    }

    const normalizedRole = String(role).trim().toLowerCase();

    const allowedRoles = ["admin", "manager", "cashier"];

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        message: "Role must be admin, manager or cashier",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    try {
      const normalizedEmail = String(email)
        .trim()
        .toLowerCase();

      const existingUser = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(normalizedEmail);

      if (existingUser) {
        return res.status(400).json({
          message: "A user with this email already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(
        String(password),
        10
      );

      const result = db
        .prepare(`
          INSERT INTO users (
            name,
            email,
            password,
            role
          )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          String(name).trim(),
          normalizedEmail,
          hashedPassword,
          normalizedRole
        );

      const createdUser = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            created_at
          FROM users
          WHERE id = ?
        `)
        .get(result.lastInsertRowid);

      return res.status(201).json({
        message: "User created successfully",
        user: createdUser,
      });
    } catch (error) {
      console.error("Create user error:", error);

      return res.status(500).json({
        message: "Failed to create user",
      });
    }
  }
);

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as
    | {
        id: number;
        name: string;
        email: string;
        password: string;
        role: string;
      }
    | undefined;

  if (!user) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordMatches) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: "8h",
    }
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

export default router;