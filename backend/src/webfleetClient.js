import fetch from "node-fetch";

export async function getFleetSnapshot() {
    const url = new URL(process.env.API_BASE);
    url.searchParams.set("action", "showObjectReportExtern");
    url.searchParams.set("account", process.env.WEBFLEET_ACCOUNT);
    url.searchParams.set("apikey", process.env.WEBFLEET_APIKEY);
    url.searchParams.set("username", process.env.WEBFLEET_USERNAME);
    url.searchParams.set("password", process.env.WEBFLEET_PASSWORD);
    url.searchParams.set("outputformat", "json");
    url.searchParams.set("lang", "en");

    const res = await fetch(url.href);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}
