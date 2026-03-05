const ARCGIS_BASE =
  "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Collisions/FeatureServer/0/query";

export const handler = async (event) => {
  // Forward all query params straight to ArcGIS
  const params = new URLSearchParams(event.queryStringParameters || {});

  try {
    const url = `${ARCGIS_BASE}?${params.toString()}`;
    const response = await fetch(url);
    const body = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
