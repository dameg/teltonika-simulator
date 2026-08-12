import {
  reconcileLayerRegistry,
  reconcileSelectedKeys,
  samePositionTelemetry,
  type PositionTelemetry,
} from "../src/dashboard/frontend/map-layer-reconciler";

interface Model {
  key: string;
  value: number;
}

interface Entry {
  value: number;
}

function setup(initial: readonly Model[]) {
  const operations: string[] = [];
  const registry = new Map<string, Entry>(initial.map((model) => [model.key, { value: model.value }]));
  const adapter = {
    key: (model: Model) => model.key,
    create: (model: Model) => {
      operations.push(`create:${model.key}`);
      return { value: model.value };
    },
    update: (entry: Entry, model: Model) => {
      if (entry.value === model.value) return false;
      operations.push(`set:${model.key}`);
      entry.value = model.value;
      return true;
    },
    remove: (entry: Entry) => operations.push(`remove:${entry.value}`),
  };
  return { adapter, operations, registry };
}

describe("map layer reconciliation", () => {
  it("performs no layer operations for identical models", () => {
    const state = setup([{ key: "a", value: 1 }]);

    expect(reconcileLayerRegistry(state.registry, [{ key: "a", value: 1 }], state.adapter))
      .toEqual({ added: 0, removed: 0, updated: 0 });
    expect(state.operations).toEqual([]);
  });

  it("updates only the changed layer and adds only the new layer", () => {
    const state = setup([{ key: "a", value: 1 }, { key: "b", value: 2 }]);

    expect(reconcileLayerRegistry(
      state.registry,
      [{ key: "a", value: 1 }, { key: "b", value: 3 }, { key: "c", value: 4 }],
      state.adapter,
    )).toEqual({ added: 1, removed: 0, updated: 1 });
    expect(state.operations).toEqual(["set:b", "create:c"]);
  });

  it("removes only orphaned layers", () => {
    const state = setup([{ key: "a", value: 1 }, { key: "b", value: 2 }]);

    expect(reconcileLayerRegistry(state.registry, [{ key: "b", value: 2 }], state.adapter))
      .toEqual({ added: 0, removed: 1, updated: 0 });
    expect(state.operations).toEqual(["remove:1"]);
    expect([...state.registry.keys()]).toEqual(["b"]);
  });

  it("changes at most the previous and next selection", () => {
    const operations: string[] = [];

    reconcileSelectedKeys("old", "new", (key) => operations.push(`off:${key}`), (key) => operations.push(`on:${key}`));

    expect(operations).toEqual(["off:old", "on:new"]);
  });

  it.each(["speedKph", "altitudeMeters", "headingDegrees", "satellites"] as const)(
    "detects a changed %s telemetry field",
    (field) => {
      const position: PositionTelemetry = {
        id: "1",
        imei: "123",
        tripId: "trip",
        configRevision: 1,
        timestampMs: 1,
        latitude: 54,
        longitude: 25,
        altitudeMeters: 100,
        headingDegrees: 90,
        speedKph: 20,
        satellites: 8,
      };

      expect(samePositionTelemetry(position, { ...position, [field]: position[field] + 1 })).toBe(false);
    },
  );
});
