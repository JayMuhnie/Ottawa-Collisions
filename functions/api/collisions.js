const ARCGIS_BASE =
  "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Collisions/FeatureServer/0/query";

export async function onRequest(context) {
  const { request } = context;
  const incoming = new URL(request.url);

  // Forward all query params to ArcGIS
  const target = new URL(ARCGIS_BASE);
  target.search = incoming.search;

  try {
    const response = await fetch(target.toString());
    const body = await response.text();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
