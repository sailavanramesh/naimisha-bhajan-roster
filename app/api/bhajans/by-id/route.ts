import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ bhajan: null }, { status: 400 });

  const b = await prisma.bhajan.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      raga: true,
      lyrics: true,
      meaning: true,
      referenceGentsPitch: true,
      referenceLadiesPitch: true,
    },
  });

  return NextResponse.json({ bhajan: b ?? null });
}
