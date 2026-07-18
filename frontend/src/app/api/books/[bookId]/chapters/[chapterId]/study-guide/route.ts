import { NextResponse } from "next/server";

const backendOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await context.params;
    const response = await fetch(
      `${backendOrigin}/api/books/${bookId}/chapters/${chapterId}/study-guide`,
      { cache: "no-store" },
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
        error: error instanceof Error ? error.message : "Failed to load study guide.",
      },
      { status: 500 },
    );
  }
}
