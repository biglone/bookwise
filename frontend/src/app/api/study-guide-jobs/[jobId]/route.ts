import { NextResponse } from "next/server";

const backendOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const response = await fetch(`${backendOrigin}/api/study-guide-jobs/${jobId}`, {
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
        error: error instanceof Error ? error.message : "Failed to load study guide job.",
      },
      { status: 500 },
    );
  }
}
