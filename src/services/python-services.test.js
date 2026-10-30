import { BimIngestionClient } from "./python-services";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(4),
  };
}

test("uploads an IFC, polls until ready, and retrieves its graph and models", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(jsonResponse({ id: "job/1", status: "uploaded" }, 202))
    .mockResolvedValueOnce(jsonResponse({ id: "job/1", status: "ready", artifacts: [
      { kind: "glb", floor_id: "floor-guid", url: "/model.glb" },
    ] }))
    .mockResolvedValueOnce(jsonResponse({ floors: [] }))
    .mockResolvedValueOnce(jsonResponse({ nodes: [], edges: [] }))
    .mockResolvedValueOnce(jsonResponse({}, 200));
  const client = new BimIngestionClient({
    baseUrl: "http://localhost:8000/",
    fetchImpl,
  });
  const updates = [];

  const result = await client.uploadIfc(
    new File(["ifc"], "building.ifc"),
    { pollIntervalMs: 0, onJobUpdate: (job) => updates.push(job.status) }
  );

  expect(result.job.status).toBe("ready");
  expect(result.graph.edges).toEqual([]);
  expect(result.models[0].data.byteLength).toBe(4);
  expect(updates).toEqual(["uploaded", "ready"]);
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "http://localhost:8000/api/v1/imports",
    "http://localhost:8000/api/v1/imports/job%2F1",
    "http://localhost:8000/api/v1/imports/job%2F1/manifest",
    "http://localhost:8000/api/v1/imports/job%2F1/graph",
    "http://localhost:8000/model.glb",
  ]);
});

test("rejects non-IFC files before making a request", async () => {
  const fetchImpl = jest.fn();
  const client = new BimIngestionClient({ baseUrl: "http://localhost:8000", fetchImpl });

  await expect(client.uploadIfc(new File(["data"], "building.ifczip"))).rejects.toThrow(
    "Select an IFC file"
  );
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("surfaces failed ingestion jobs", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(jsonResponse({ id: "job-1", status: "uploaded" }, 202))
    .mockResolvedValueOnce(jsonResponse({
      id: "job-1",
      status: "failed",
      error: "No renderable geometry",
    }));
  const client = new BimIngestionClient({ baseUrl: "http://localhost:8000", fetchImpl });

  await expect(client.uploadIfc(
    new File(["ifc"], "building.ifc"),
    { pollIntervalMs: 0 }
  )).rejects.toThrow("No renderable geometry");
});
