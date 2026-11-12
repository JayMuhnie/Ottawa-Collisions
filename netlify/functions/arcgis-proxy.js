// Netlify Function: proxies queries to the City of Ottawa collisions layer.
// Keep ARCGIS_BASE in sync with functions/api/collisions.js.
const ARCGIS_BASE =
  "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Traffic_Collisions_by_Location_2017-2024_(excluding_2023)/FeatureServer/0/query";

exports.handler = async function (event) {
  const params = new URLSearchParams(event.queryStringParameters || {});

  try {
    const url = `${ARCGIS_BASE}?${params.toString()}`;
    const response = await fetch(url);
    const body = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: err.message } }),
    };
  }
};
