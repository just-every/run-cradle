const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const domain = 'run-cradle.com';
const service = 'cradle-production--site';
const report = (label, status, ok) => console.log(JSON.stringify({ label, status, ok }));

async function get(path) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

try {
  if (!/^[a-f0-9]{32}$/.test(account ?? '') || !token) {
    report('required inputs', 0, false);
    process.exitCode = 1;
  } else {
    const verification = await get(`/accounts/${account}/tokens/verify`);
    const tokenOK = verification.status === 200 && verification.body?.success === true && verification.body.result?.status === 'active';
    report('account token active', verification.status, tokenOK);
    const zones = await get(`/zones?name=${domain}&account.id=${account}`);
    const zone = zones.body?.result?.[0];
    const zoneOK = zones.status === 200 && zones.body?.success === true && Array.isArray(zones.body.result) && zones.body.result.length === 1 && zone.name === domain && zone.status === 'active' && zone.account?.id === account && /^[a-f0-9]{32}$/.test(zone.id);
    report('intended active zone', zones.status, zoneOK);
    let domainsOK = false;
    if (zoneOK) {
      const domains = await get(`/accounts/${account}/workers/domains?zone_id=${zone.id}`);
      domainsOK = domains.status === 200 && domains.body?.success === true && Array.isArray(domains.body.result) && !domains.body.result.some(row => [domain, `www.${domain}`].includes(row.hostname));
      report('site hostnames unclaimed', domains.status, domainsOK);
      const legacy = await get(`/zones/${zone.id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
      // Published rer generates the redirect in its Worker and makes no ruleset call.
      report('legacy redirect entrypoint (informational)', legacy.status, null);
    }
    const worker = await get(`/accounts/${account}/workers/scripts/${service}/settings`);
    const absent = worker.status === 404;
    report('first deployment worker absent', worker.status, absent);
    if (!tokenOK || !zoneOK || !domainsOK || !absent) process.exitCode = 1;
  }
} catch {
  report('probe completed', 0, false);
  process.exitCode = 1;
}
