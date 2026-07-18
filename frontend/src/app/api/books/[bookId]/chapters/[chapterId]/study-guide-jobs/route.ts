import { NextResponse } from "next/server";

const backendOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await context.params;
    const response = await fetch(
      `${backendOrigin}/api/books/${bookId}/chapters/${chapterId}/study-guide-jobs`,
      {
        cache: "no-store",
      },
    );
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
        error: error instanceof Error ? error.message : "Failed to load study guide jobs.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await context.params;
    const url = new URL(request.url);
    const backendUrl = new URL(
      `${backendOrigin}/api/books/${bookId}/chapters/${chapterId}/study-guide-jobs`,
    );

    for (const [key, value] of url.searchParams.entries()) {
      backendUrl.searchParams.set(key, value);
    }

    const response = await fetch(
      backendUrl,
      {
        method: "POST",
      },
    );
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
        error: error instanceof Error ? error.message : "Failed to create study guide job.",
      },
      { status: 500 },
    );
  }
}
