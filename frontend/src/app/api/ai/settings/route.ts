import { NextResponse } from "next/server";

const backendOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

export async function GET() {
  try {
    const response = await fetch(`${backendOrigin}/api/ai/settings`, {
      cache: "no-store",
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
        error: error instanceof Error ? error.message : "Failed to load AI settings.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(`${backendOrigin}/api/ai/settings`, {
      method: "PUT",
      body,
      headers: {
        "content-type": request.headers.get("content-type") || "application/json",
      },
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
        error: error instanceof Error ? error.message : "Failed to update AI settings.",
      },
      { status: 500 },
    );
  }
}
