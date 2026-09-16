export type MapsClientConfig = {
  enabled: boolean;
  apiKey: string;
  mapId: string;
};

export function mapsClientConfig(env: NodeJS.ProcessEnv): MapsClientConfig {
  const apiKey = env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const configuredMapId = env.GOOGLE_MAPS_MAP_ID?.trim() ?? "";
  return {
    enabled: apiKey.length >= 20,
    apiKey: apiKey.length >= 20 ? apiKey : "",
    mapId: configuredMapId || "DEMO_MAP_ID",
  };
}
