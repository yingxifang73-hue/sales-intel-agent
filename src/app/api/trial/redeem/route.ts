import { NextResponse } from "next/server";
import { redeemTrialCode } from "@/lib/trial";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: unknown };
    if (typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json({ error: "请输入兑换码。" }, { status: 400 });
    }
    const result = await redeemTrialCode(body.code);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "兑换失败，请稍后再试。" }, { status: 400 });
  }
}
