import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getGlobalCohort, isRegistrationEnabled } from "@/lib/data";

export async function POST(req: Request) {
  try {
    // Kontrola, zda je registrace povolena
    const regEnabled = await isRegistrationEnabled();
    if (!regEnabled) {
      return NextResponse.json(
        { message: "Registrace je momentálně zakázána. Kontaktujte administrátora." },
        { status: 403 }
      );
    }

    const { email, password, firstName, lastName } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { message: "Chybí povinné údaje." },
        { status: 400 }
      );
    }

    // Serverová validace hesla
    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { message: "Heslo musí mít alespoň 6 znaků." },
        { status: 400 }
      );
    }

    // Zkontroluj, zda e-mail už nevyužívá někdo jiný
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Uživatel s tímto e-mailem již existuje." },
        { status: 409 }
      );
    }

    // Získání aktuálně nastaveného ročníku pro přiřazení novému uživateli
    const currentCohort = await getGlobalCohort();

    // Zahešování nového hesla
    const hashedPassword = await bcrypt.hash(password, 10);

    // Vytvoření uživatele v DB
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName,
        lastName,
        isActive: true,
        cohort: currentCohort || null,
      },
    });

    return NextResponse.json(
      { message: "Uživatel úspěšně vytvořen" },
      { status: 201 }
    );
  } catch {
    // console.error("Chyba při registraci:", error);
    return NextResponse.json(
      { message: "Omlouváme se, nastala vnitřní chyba serveru." },
      { status: 500 }
    );
  }
}
