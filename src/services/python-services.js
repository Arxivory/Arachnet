const PYTHON_SERVICE_URLS = Object.freeze({
  bimIngestion: process.env.REACT_APP_BIM_INGESTION_API_URL || "http://127.0.0.1:8000",
});

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted.", "AbortError");
}

function delay(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError(signal));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class PythonServiceClient {
  constructor({ baseUrl, fetchImpl = (...args) => window.fetch(...args) } = {}) {
    if (!baseUrl) throw new TypeError("A Python service base URL is required.");
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async request(path, options = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new TypeError("Python service requests must stay on the configured service origin.");
    }
    const response = await this.fetchImpl(url.toString(), options);
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`.trim();
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new Error(`Python service request failed: ${detail}`);
    }
    return response;
  }
}

export class BimIngestionClient extends PythonServiceClient {
  async uploadIfc(file, {
    signal,
    onJobUpdate = () => {},
    pollIntervalMs = 1000,
  } = {}) {
    if (!file || typeof file.name !== "string" || !file.name.toLowerCase().endsWith(".ifc")) {
      throw new TypeError("Select an IFC file with a .ifc extension.");
    }
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
      throw new RangeError("The job polling interval must be a non-negative number.");
    }

    const body = new FormData();
    body.append("file", file);
    const uploadResponse = await this.request("/api/v1/imports", {
      method: "POST",
      body,
      signal,
    });
    let job = await uploadResponse.json();
    onJobUpdate(job);

    while (job.status === "uploaded" || job.status === "processing") {
      await delay(pollIntervalMs, signal);
      const statusResponse = await this.request(`/api/v1/imports/${encodeURIComponent(job.id)}`, {
        signal,
      });
      job = await statusResponse.json();
      onJobUpdate(job);
    }
    if (job.status !== "ready") {
      throw new Error(job.error || "The BIM ingestion service did not complete the import.");
    }

    const [manifestResponse, graphResponse] = await Promise.all([
      this.request(`/api/v1/imports/${encodeURIComponent(job.id)}/manifest`, { signal }),
      this.request(`/api/v1/imports/${encodeURIComponent(job.id)}/graph`, { signal }),
    ]);
    const glbArtifacts = job.artifacts.filter((artifact) => artifact.kind === "glb");
    const models = await Promise.all(glbArtifacts.map(async (artifact) => {
      const modelResponse = await this.request(artifact.url, { signal });
      return { ...artifact, data: await modelResponse.arrayBuffer() };
    }));

    return {
      job,
      manifest: await manifestResponse.json(),
      graph: await graphResponse.json(),
      models,
    };
  }
}

export const pythonServices = Object.freeze({
  bimIngestion: new BimIngestionClient({ baseUrl: PYTHON_SERVICE_URLS.bimIngestion }),
});
