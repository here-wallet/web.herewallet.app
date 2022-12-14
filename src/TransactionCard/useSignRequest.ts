import { useEffect, useState } from "react";
import { HereProviderRequest, HereProviderResult, HereProviderStatus } from "@here-wallet/core";
import { proxyProvider } from "@here-wallet/core/build/here-provider";
import { base_decode } from "near-api-js/lib/utils/serialize";

export const useSignRequest = () => {
  const [request, setRequest] = useState<HereProviderRequest | null>(null);
  const [result, setResult] = useState<HereProviderResult | null>(null);
  const [link, setLink] = useState("");

  const makeRequest = async () => {
    const query = await parseQuery();
    if (query == null) throw Error();
    if (query.request == null && query.id == null) throw Error();

    await proxyProvider({
      id: query.id,
      request: query.request,
      disableCleanupRequest: request == null,

      onFailed: (r) => {
        setResult(r);
        query.returnUrl && callRedirect(query.returnUrl, r);
      },

      onSuccess: (r) => {
        setResult(r);
        query.returnUrl && callRedirect(query.returnUrl, r);
      },

      onApproving: (r) => setResult(r),
      onRequested: (id, request) => {
        if (request.type == null) request.type = "call";
        setRequest(request);

        const url = new URL(`${window.location.origin}/${request.type}/${id}`);
        window.history.replaceState(null, "", url);

        if (request.network === "testnet") {
          setLink(`testnet.herewallet://h4n.app/${id}`);
        } else {
          setLink(`herewallet://h4n.app/${id}`);
        }
      },
    });
  };

  useEffect(() => {
    makeRequest().catch(() => setResult({ account_id: "", status: HereProviderStatus.FAILED }));
  }, []);

  return {
    link,
    result,
    request,
  };
};

interface HereRoute {
  id?: string;
  request?: HereProviderRequest;
  returnUrl?: URL;
}

export const parseRequest = (data: string, type?: "call" | "sign"): HereRoute => {
  try {
    const request = JSON.parse(base_decode(data).toString("utf8"));
    if (type != null) request.type = type;
    return { request };
  } catch {
    return { id: data };
  }
};

/**
 * 1) my.herewallet/ID
 * 2) my.herewallet/call/ID
 * 3) my.herewallet/sign/ID
 * 4) my.herewallet/g/TEMPLATE
 * 5) my.herewallet/call/base58({ transactions, network })
 * 6) my.herewallet/sign/base58({ receiver, network, message, nonce })
 */
export const parseQuery = async (): Promise<HereRoute | null> => {
  const [, route, id] = window.location.pathname.split("/");

  let returnUrl: URL;
  try {
    const url = new URL(window.location.href).searchParams.get("returnUrl");
    returnUrl = new URL(url!);
  } catch {}

  // Lagacy
  if (id == null) {
    const root = parseRequest(route);
    if (root.id != null) return { returnUrl, id: root.id };
  }

  if (route === "g") {
    const res = await fetch(`https://api.herewallet.app/api/v1/dapp/generate_transaction/${id}`);
    const { data } = await res.json();
    if (data == null) return null;
    return { returnUrl, ...parseRequest(data, "call") };
  }

  if (route === "approve" || route === "call") {
    return { returnUrl, ...parseRequest(id, "call") };
  }

  if (route === "sign") {
    return { returnUrl, ...parseRequest(id, "sign") };
  }

  return null;
};

export const callRedirect = (returnUrl: URL, result: HereProviderResult) => {
  if (result.account_id) {
    returnUrl.searchParams.set("account_id", result.account_id);
  }

  if (result.status === HereProviderStatus.SUCCESS) {
    returnUrl.searchParams.set("success", encodeURI(result.payload ?? ""));
  }

  if (result.status === HereProviderStatus.FAILED) {
    returnUrl.searchParams.set("failed", encodeURI(result.payload ?? ""));
  }

  window.location.assign(returnUrl);
};
