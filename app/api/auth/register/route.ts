import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isRegistrationEnabled, getDefaultRole, getRegistrationClassMode } from "@/modules/core/settings";
import { getPublicClassOptions } from "@/modules/core/school";

/** Nastavení registračního formuláře: zda se vybírá třída a které třídy jsou k dispozici. */
export async function GET() {
  try {
    const classMode = await getRegistrationClassMode();
    const classes = classMode === "off" ? [] : await getPublicClassOptions();
    return NextResponse.json({ classMode, classes });
  } catch {
    return NextResponse.json({ classMode: "off", classes: [] });
  }
}

export async function POST(req: Request) {
  try {
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    // Kontrola, zda je registrace povolena (první uživatel má výjimku)
    const regEnabled = await isRegistrationEnabled();
    if (!regEnabled && !isFirstUser) {
      return NextResponse.json(
        { message: "Registrace je momentálně zakázána. Kontaktujte administrátora." },
        { status: 403 }
      );
    }

    const { email, password, firstName, lastName, classGroupId } = await req.json();

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

    // Výběr třídy (nastavuje admin): jen žádost, role ani zařazení se tím nemění
    let requestedClassGroupId: string | null = null;
    const classMode = await getRegistrationClassMode();
    if (classMode !== "off" && !isFirstUser) {
      if (classGroupId) {
        const cls = typeof classGroupId === "string" ? await prisma.classGroup.findUnique({ where: { id: classGroupId } }) : null;
        if (!cls) return NextResponse.json({ message: "Vybraná třída neexistuje." }, { status: 400 });
        requestedClassGroupId = cls.id;
      } else if (classMode === "required" && (await prisma.classGroup.count()) > 0) {
        return NextResponse.json({ message: "Vyberte svou třídu." }, { status: 400 });
      }
    }

    // Výchozí role nového uživatele
    const defaultRole = await getDefaultRole();

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
        role: isFirstUser ? "ADMIN" : defaultRole,
        requestedClassGroupId,
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
