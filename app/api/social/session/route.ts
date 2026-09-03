import { NextRequest, NextResponse } from "next/server";
import {
  newRequesterToken,
  readSocialRequesterCookie,
  socialRequesterCookieHeader,
} from "@/lib/spotify/socialRequesterCookie";

export async function GET(req: NextRequest) {
  let token = readSocialRequesterCookie(req);
  const headers = new Headers();

  if (!token) {
    token = newRequesterToken();
    headers.set("Set-Cookie", socialRequesterCookieHeader(token));
  }

  return NextResponse.json({ ok: true }, { headers });
}
