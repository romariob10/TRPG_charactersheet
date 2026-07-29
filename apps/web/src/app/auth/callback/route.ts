import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(
    new URL(safeRedirectPath(url.searchParams.get("next")), url.origin),
  );
}
