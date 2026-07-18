import { NextResponse } from "next/server";

const backendOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await fetch(`${backendOrigin}/api/books/upload`, {
      method: "POST",
      body: formData,
    });
    const payload = await response.text();

    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload proxy failed.",
      },
      { status: 500 },
    );
  }
}
