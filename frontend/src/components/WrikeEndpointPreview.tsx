const DEFAULT_WRIKE_HOST = "https://app-eu.wrike.com";

/** Full Wrike URLs the server will call for a given host; blank means the app-eu default. */
function wrikeEndpoints(host: string) {
  const base = host.trim().replace(/\/+$/, "") || DEFAULT_WRIKE_HOST;
  return {
    api: `${base}/api/v4`,
    datahub: `${base}/app/wrike_v2_web/public/api/v1`,
  };
}

/** Plain-text preview shown under the Wrike API Host input in the environment forms. */
export default function WrikeEndpointPreview({ host }: { host: string }) {
  const { api, datahub } = wrikeEndpoints(host);
  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 12,
        color: "var(--text-muted)",
        lineHeight: 1.6,
        wordBreak: "break-all",
      }}
    >
      <div>REST API: {api}</div>
      <div>Datahub: {datahub}</div>
    </div>
  );
}
