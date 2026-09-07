// SECTION: Health endpoint
export function GET() {
  return Response.json({
    status: "ok",
    service: "nextpath-backend"
  });
}
// End of section: this endpoint gives the team and deployment platform a simple way to verify that the API is running.
