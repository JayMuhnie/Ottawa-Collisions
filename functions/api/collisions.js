// Cloudflare Pages Function: proxies queries to the City of Ottawa collisions layer.
// Update ARCGIS_BASE here (and in netlify/functions/arcgis-proxy.js) if the service is ever renamed again.
const ARCGIS_BASE =
  "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Traffic_Collisions_by_Location_2017-2024_(excluding_2023)/FeatureServer/0/query";

export async function onRequest(context) {
  const { request } = context;
  const incoming = new URL(request.url);

  // Forward all query params to ArcGIS
  const target = new URL(ARCGIS_BASE);
  target.search = incoming.search;

  try {
    const response = await fetch(target.toString());
    const body = await response.text();

    // Pass the upstream status and content type through unchanged so the app can
    // show a real error instead of failing to parse a plain-text "Bad Request".
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
