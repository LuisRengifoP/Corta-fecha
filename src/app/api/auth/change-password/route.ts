import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/session-token";
import { logActivity } from "@/lib/corta-fecha";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const fullName = body.fullName ? String(body.fullName).trim() : "";

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta" },
        { status: 400 }
      );
    }

    if (newPassword && newPassword.length < 6) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
      },
    });

    const token = await signSessionToken({
      userId: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      role: updated.role,
    });

    await logActivity({
      entityType: "SISTEMA",
      entityId: updated.id,
      action: "ACTUALIZAR_CUENTA",
      actor: updated.fullName,
      summary: `Datos de acceso actualizados para ${updated.fullName}`,
    });

    const response = NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName,
        role: updated.role,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Error en POST /api/auth/change-password:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta" },
      { status: 500 }
    );
  }
}
