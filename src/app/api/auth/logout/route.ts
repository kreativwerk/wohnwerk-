import { NextResponse } from "next/server";

import { destroySession, getSessionUser, istBank } from "@/lib/auth";

export async function POST(request: Request) {
  // Der Bank-Zugang meldet sich per Code an - zurueck auf seine Anmeldeseite.
  const bank = istBank(await getSessionUser());
  await destroySession();
  return NextResponse.redirect(new URL(bank ? "/bank/anmelden" : "/login", request.url), { status: 303 });
}
