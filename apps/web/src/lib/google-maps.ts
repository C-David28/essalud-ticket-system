import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configuredKey: string | null = null;

export async function loadGoogleMaps(apiKey: string) {
  if (configuredKey !== null && configuredKey !== apiKey)
    throw new Error("La API de Google Maps ya fue configurada con otra clave.");
  if (configuredKey === null) {
    setOptions({ key: apiKey, v: "weekly", language: "es", region: "PE", authReferrerPolicy: "origin" });
    configuredKey = apiKey;
  }
  const [maps, marker] = await Promise.all([importLibrary("maps"), importLibrary("marker")]);
  return { maps, marker };
}
