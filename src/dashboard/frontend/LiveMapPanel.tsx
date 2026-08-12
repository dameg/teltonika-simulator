import { Badge, Group, Paper, Title } from "@mantine/core";
import { memo, startTransition, useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { request } from "./dashboard-api";
import {
  DeviceMap,
  type MapConfigRevision,
  type MapDevice,
  type MapPosition,
} from "./DeviceMap";
import {
  MAX_LIVE_POSITIONS,
  mergeConfigRevisions,
  mergeLivePositions,
  type LivePositionsPage,
} from "./live-positions";

const POSITION_POLL_INTERVAL_MS = 4_000;
const DELTA_PAGE_SIZE = 1_000;
const MAX_PAGES_PER_REFRESH = 5;

interface LiveMapPanelProps {
  devices: MapDevice[];
  selectedImei: string;
  selectedDeviceLabel?: string;
  refreshRevision: number;
  onError: (message: string) => void;
}

export const LiveMapPanel = memo(function LiveMapPanel({
  devices,
  selectedImei,
  selectedDeviceLabel,
  refreshRevision,
  onError,
}: LiveMapPanelProps): ReactElement {
  const [positions, setPositions] = useState<MapPosition[]>([]);
  const [configRevisions, setConfigRevisions] = useState<MapConfigRevision[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const pollingRef = useRef(false);
  const generationRef = useRef(0);
  const handledRefreshRevisionRef = useRef(refreshRevision);

  const refreshPositions = useCallback(async (force = false) => {
    if (!force && (document.hidden || pollingRef.current)) return;
    const generation = generationRef.current;
    pollingRef.current = true;
    try {
      let pageCount = 0;
      let hasMore = true;
      while (hasMore && pageCount < MAX_PAGES_PER_REFRESH) {
        pageCount += 1;
        const cursor = cursorRef.current;
        const query = cursor === undefined
          ? ""
          : `?afterRecordId=${encodeURIComponent(cursor)}&limit=${DELTA_PAGE_SIZE}`;
        const page = await request<LivePositionsPage>(`/api/status/positions${query}`);
        if (generation !== generationRef.current) return;
        cursorRef.current = page.nextRecordId;
        hasMore = page.hasMore;
        startTransition(() => {
          setPositions((current) => mergeLivePositions(current, page.positions, MAX_LIVE_POSITIONS));
          setConfigRevisions((current) => mergeConfigRevisions(current, page.configRevisions));
        });
      }
    } catch (error) {
      if (generation === generationRef.current) {
        onError(error instanceof Error ? error.message : "Position refresh failed");
      }
    } finally {
      if (generation === generationRef.current) pollingRef.current = false;
    }
  }, [onError]);

  useEffect(() => {
    void refreshPositions(true);
    const interval = window.setInterval(() => void refreshPositions(), POSITION_POLL_INTERVAL_MS);
    return () => {
      generationRef.current += 1;
      pollingRef.current = false;
      window.clearInterval(interval);
    };
  }, [refreshPositions]);

  useEffect(() => {
    if (handledRefreshRevisionRef.current === refreshRevision) return;
    handledRefreshRevisionRef.current = refreshRevision;
    generationRef.current += 1;
    cursorRef.current = undefined;
    setPositions([]);
    setConfigRevisions([]);
    void refreshPositions(true);
  }, [refreshPositions, refreshRevision]);

  return (
    <Paper withBorder className="surface map-surface">
      <Group justify="space-between" align="flex-start" className="surface-heading">
        <Title order={2}>Live map</Title>
        {selectedDeviceLabel ? <Badge variant="outline" color="gray">Focused: {selectedDeviceLabel}</Badge> : null}
      </Group>
      <DeviceMap
        devices={devices}
        positions={positions}
        configRevisions={configRevisions}
        selectedImei={selectedImei}
      />
    </Paper>
  );
});
