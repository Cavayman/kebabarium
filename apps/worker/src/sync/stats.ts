export interface SyncStats {
  callsUsed: number;
  placesAdded: number;
  placesUpdated: number;
  markedDead: number;
  externalAdded: number;
  threadsStatus: 'ok' | 'unavailable' | null;
  errors: string[];
  notes: string[];
}

export const newStats = (): SyncStats => ({
  callsUsed: 0,
  placesAdded: 0,
  placesUpdated: 0,
  markedDead: 0,
  externalAdded: 0,
  threadsStatus: null,
  errors: [],
  notes: [],
});
