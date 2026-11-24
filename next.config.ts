import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Configuracion del sistema Corta Fecha */
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/reports/export": [
      "./node_modules/pdfkit/js/standard-fonts/**/*",
      "./node_modules/pdfkit/js/data/**/*",
      "./public/images/**/*",
    ],
  },
  allowedDevOrigins: ["192.168.2.159"],
};

export default nextConfig;
