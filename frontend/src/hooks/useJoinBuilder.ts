import { useState, useCallback, useRef, useEffect } from 'react';
import {
  listDatasetTables,
  listJoins,
  createJoin,
  deleteJoin,
  validateJoin,
  applyJoins,
  type TableInfo,
  type JoinConfig,
  type JoinColumn,
  type JoinValidationResponse,
  type ApplyJoinResponse,
} from '../services/joinApi';

export interface TablePosition {
  x: number;
  y: number;
}

export interface PendingConnection {
  tableId: string;
  columnName: string;
  side: 'left' | 'right';
}

export interface ConnectionLine {
  id: string;
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: 'inner' | 'left' | 'right' | 'outer' | 'cross';
}

export function useJoinBuilder(datasetId: string) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [joins, setJoins] = useState<JoinConfig[]>([]);
  const [versionId, setVersionId] = useState<string>('');
  const [hasJoinView, setHasJoinView] = useState(false);
  const [activeJoinView, setActiveJoinView] = useState<string | null>(null);

  const [tablePositions, setTablePositions] = useState<Record<string, TablePosition>>({});
  const [connections, setConnections] = useState<ConnectionLine[]>([]);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [validationResult, setValidationResult] = useState<JoinValidationResponse | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyJoinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dragRef = useRef<{ tableId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Load tables and joins
  const loadData = useCallback(async () => {
    if (!datasetId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [tablesRes, joinsRes] = await Promise.all([
        listDatasetTables(datasetId),
        listJoins(datasetId),
      ]);

      setTables(tablesRes.tables);
      setVersionId(tablesRes.version_id);
      setHasJoinView(tablesRes.has_join_view);
      setActiveJoinView(tablesRes.active_join_view || null);
      setJoins(joinsRes.joins);

      // Initialize positions if not set
      if (tablesRes.tables.length > 0) {
        const newPositions: Record<string, TablePosition> = {};
        const canvasWidth = 900;
        const cardWidth = 240;
        const spacing = 80;
        const totalWidth = tablesRes.tables.length * (cardWidth + spacing) - spacing;
        const startX = Math.max(40, (canvasWidth - totalWidth) / 2);

        tablesRes.tables.forEach((table, idx) => {
          if (!tablePositions[table.table_name]) {
            newPositions[table.table_name] = {
              x: startX + idx * (cardWidth + spacing),
              y: 60 + (idx % 2) * 120,
            };
          } else {
            newPositions[table.table_name] = tablePositions[table.table_name];
          }
        });
        setTablePositions(newPositions);
      }

      // Sync connections from joins
      const lines: ConnectionLine[] = joinsRes.joins.flatMap((join) =>
        join.columns.map((col, colIdx) => ({
          id: `${join.join_id}_${colIdx}`,
          leftTable: join.left_table,
          leftColumn: col.left_column,
          rightTable: join.right_table,
          rightColumn: col.right_column,
          joinType: join.join_type,
        }))
      );
      setConnections(lines);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Column click handler — start or complete a connection
  const handleColumnClick = useCallback(
    (tableName: string, columnName: string) => {
      if (!pendingConnection) {
        // Start connection
        setPendingConnection({ tableId: tableName, columnName, side: 'left' });
        return;
      }

      // Complete connection (must be different table)
      if (pendingConnection.tableId === tableName) {
        setPendingConnection(null);
        return;
      }

      const leftTable = pendingConnection.tableId;
      const leftColumn = pendingConnection.columnName;
      const rightTable = tableName;
      const rightColumn = columnName;

      // Add connection locally
      const newConn: ConnectionLine = {
        id: `pending_${Date.now()}`,
        leftTable,
        leftColumn,
        rightTable,
        rightColumn,
        joinType: 'inner',
      };
      setConnections((prev) => [...prev, newConn]);
      setPendingConnection(null);
    },
    [pendingConnection]
  );

  // Change join type for a connection
  const setConnectionJoinType = useCallback(
    (connectionId: string, joinType: ConnectionLine['joinType']) => {
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, joinType } : c))
      );
    },
    []
  );

  // Remove a connection
  const removeConnection = useCallback((connectionId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
  }, []);

  // Table drag handlers
  const startDrag = useCallback(
    (tableId: string, clientX: number, clientY: number) => {
      const pos = tablePositions[tableId] || { x: 0, y: 0 };
      dragRef.current = { tableId, startX: clientX, startY: clientY, origX: pos.x, origY: pos.y };
    },
    [tablePositions]
  );

  const onDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragRef.current) return;
      const { tableId, startX, startY, origX, origY } = dragRef.current;
      setTablePositions((prev) => ({
        ...prev,
        [tableId]: {
          x: origX + (clientX - startX),
          y: origY + (clientY - startY),
        },
      }));
    },
    []
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Save joins to backend
  const saveJoins = useCallback(async () => {
    if (!datasetId || connections.length === 0) return;
    setError(null);

    // Group connections by table pairs
    const joinGroups: Record<string, ConnectionLine[]> = {};
    for (const conn of connections) {
      const key = `${conn.leftTable}__${conn.rightTable}`;
      if (!joinGroups[key]) joinGroups[key] = [];
      joinGroups[key].push(conn);
    }

    try {
      // Delete existing joins first
      for (const existingJoin of joins) {
        try {
          await deleteJoin(datasetId, existingJoin.join_id);
        } catch {
          // Ignore delete errors
        }
      }

      // Create new joins
      const newJoins: JoinConfig[] = [];
      for (const [, group] of Object.entries(joinGroups)) {
        const firstConn = group[0];
        const columns: JoinColumn[] = group.map((c) => ({
          left_column: c.leftColumn,
          right_column: c.rightColumn,
        }));

        const created = await createJoin(datasetId, {
          left_table: firstConn.leftTable,
          right_table: firstConn.rightTable,
          join_type: firstConn.joinType,
          columns,
        });
        newJoins.push(created);
      }

      setJoins(newJoins);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save joins');
    }
  }, [datasetId, connections, joins]);

  // Validate current join configuration
  const validateCurrentJoins = useCallback(async () => {
    if (!datasetId || connections.length === 0) return;
    setIsValidating(true);
    setValidationResult(null);
    setError(null);

    try {
      // Validate first connection group
      const firstConn = connections[0];
      const result = await validateJoin(datasetId, {
        left_table: firstConn.leftTable,
        right_table: firstConn.rightTable,
        join_type: firstConn.joinType,
        columns: [{ left_column: firstConn.leftColumn, right_column: firstConn.rightColumn }],
      });
      setValidationResult(result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  }, [datasetId, connections]);

  // Apply joins (create VIEW)
  const applyCurrentJoins = useCallback(async () => {
    if (!datasetId || !versionId) return;
    setIsApplying(true);
    setApplyResult(null);
    setError(null);

    try {
      // Save joins first
      await saveJoins();

      // Apply
      const result = await applyJoins(datasetId, versionId);
      setApplyResult(result);
      setHasJoinView(true);
      setActiveJoinView(result.view_name);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to apply joins');
    } finally {
      setIsApplying(false);
    }
  }, [datasetId, versionId, saveJoins]);

  // Cancel pending connection
  const cancelPendingConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  return {
    // State
    tables,
    joins,
    versionId,
    hasJoinView,
    activeJoinView,
    tablePositions,
    connections,
    pendingConnection,
    isLoading,
    isValidating,
    isApplying,
    validationResult,
    applyResult,
    error,

    // Actions
    loadData,
    handleColumnClick,
    setConnectionJoinType,
    removeConnection,
    startDrag,
    onDrag,
    endDrag,
    saveJoins,
    validateCurrentJoins,
    applyCurrentJoins,
    cancelPendingConnection,
  };
}
