import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }   // 👈 note the Promise here
) {
  const { id } = await context.params;            // 👈 unwrap it with await

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://drive.google.com/uc?export=download&id=${id}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Google returned ${res.status}` },
        { status: res.status }
      );
    }

    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(res.body, { headers });
  } catch (err: any) {
    console.error("Proxy fetch error:", err);
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}
