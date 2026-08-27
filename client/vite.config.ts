import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

   server: {
    allowedHosts: [
      'e055-41-90-137-114.ngrok-free.app'
    ]
  }
});