import { NextResponse } from "next/server";
import { loadActivity, incrementActivity, resetActivity } from "@/lib/storage/json-storage";

export async function GET() {
  const data = await loadActivity();
  return NextResponse.json(data);
}

export async function POST() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  await incrementActivity(today);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await resetActivity();
  return NextResponse.json({ ok: true });
}
