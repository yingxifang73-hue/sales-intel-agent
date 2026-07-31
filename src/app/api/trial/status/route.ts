import { NextResponse } from "next/server";
import { getTrialStatus, tokenFromRequest } from "@/lib/trial";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getTrialStatus(tokenFromRequest(request) ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "兑换码会话无效。" }, { status: 401 });
  }
}
