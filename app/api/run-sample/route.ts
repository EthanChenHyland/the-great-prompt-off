export async function POST() {
  return Response.json(
    { error: "This legacy sample endpoint is disabled." },
    { status: 410 },
  );
}
