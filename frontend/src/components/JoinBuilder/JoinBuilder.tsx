import React, { useState, useEffect, useRef } from 'react';
import { useJoinBuilder, type ConnectionLine, type TablePosition } from '../../hooks/useJoinBuilder';
import './JoinBuilder.css';

interface JoinBuilderProps {
  datasetId: string;
  onClose: () => void;
  onApplySuccess?: () => void;
}

export const JoinBuilder: React.FC<JoinBuilderProps> = ({
  datasetId,
  onClose,
  onApplySuccess,
}) => {
  const {
    tables,
    connections,
    pendingConnection,
    tablePositions,
    isLoading,
    isValidating,
    isApplying,
    validationResult,
    applyResult,
    error,
    handleColumnClick,
    setConnectionJoinType,
    removeConnection,
    startDrag,
    onDrag,
    endDrag,
    validateCurrentJoins,
    applyCurrentJoins,
    cancelPendingConnection,
  } = useJoinBuilder(datasetId);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Handle global mouse events for card dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      onDrag(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      endDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onDrag, endDrag]);

  // Handle successful apply callback
  useEffect(() => {
    if (applyResult?.success && onApplySuccess) {
      onApplySuccess();
    }
  }, [applyResult, onApplySuccess]);

  // Helper to find column index in table schema
  const getColumnIndex = (tableName: string, columnName: string): number => {
    const table = tables.find((t) => t.table_name === tableName);
    if (!table) return 0;
    return table.columns.findIndex((col) => col.name === columnName);
  };

  // Helper to calculate coordinates of a column's port
  const getPortCoords = (
    tableName: string,
    columnName: string,
    otherTableName?: string
  ): { x: number; y: number } => {
    const pos = tablePositions[tableName] || { x: 0, y: 0 };
    const colIdx = getColumnIndex(tableName, columnName);
    
    const headerHeight = 39;
    const rowHeight = 28;
    const y = pos.y + headerHeight + colIdx * rowHeight + rowHeight / 2;

    const cardWidth = 240;
    let x = pos.x;

    if (otherTableName) {
      const otherPos = tablePositions[otherTableName] || { x: 0, y: 0 };
      if (pos.x < otherPos.x) {
        // We are on the left, so use right side port
        x = pos.x + cardWidth;
      } else {
        // We are on the right, so use left side port
        x = pos.x;
      }
    } else {
      x = pos.x + cardWidth;
    }

    return { x, y };
  };

  // Generate SVG path for a connection (Bezier curve)
  const drawBezier = (conn: ConnectionLine): string => {
    const start = getPortCoords(conn.leftTable, conn.leftColumn, conn.rightTable);
    const end = getPortCoords(conn.rightTable, conn.rightColumn, conn.leftTable);

    // Control point offset
    const dx = Math.abs(end.x - start.x) * 0.5;
    const cp1x = start.x + (end.x > start.x ? dx : -dx);
    const cp2x = end.x + (end.x > start.x ? -dx : dx);

    return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
  };

  // Generate coordinates for the join badge (midpoint of curve)
  const getBadgePosition = (conn: ConnectionLine): { x: number; y: number } => {
    const start = getPortCoords(conn.leftTable, conn.leftColumn, conn.rightTable);
    const end = getPortCoords(conn.rightTable, conn.rightColumn, conn.leftTable);

    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
  };

  const getTypeIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('int') || t.includes('double') || t.includes('float') || t.includes('decimal') || t.includes('numeric')) {
      return '🔢';
    }
    if (t.includes('date') || t.includes('time') || t.includes('timestamp')) {
      return '📅';
    }
    if (t.includes('bool')) {
      return '☑️';
    }
    return '🔤';
  };

  return (
    <div className="join-builder-overlay">
      <div className="join-builder-modal">
        {/* Header */}
        <div className="join-builder-header">
          <div>
            <h2>Relational Join Builder</h2>
            <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
              Connect primary and foreign keys visually to create a unified data model.
            </p>
          </div>
          <div className="join-builder-header-actions">
            {connections.length > 0 && (
              <>
                <button
                  className="jb-btn jb-btn-validate"
                  onClick={validateCurrentJoins}
                  disabled={isValidating || isApplying}
                >
                  {isValidating ? <span className="jb-spinner" /> : 'Validate Model'}
                </button>
                <button
                  className="jb-btn jb-btn-apply"
                  onClick={applyCurrentJoins}
                  disabled={isApplying || isValidating}
                >
                  {isApplying ? <span className="jb-spinner" /> : 'Apply Joins'}
                </button>
              </>
            )}
            <button className="jb-btn jb-btn-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="join-builder-body">
          {/* Canvas Area */}
          <div className="join-builder-canvas" ref={canvasRef}>
            {isLoading ? (
              <div className="jb-empty-state">
                <div className="jb-spinner" style={{ width: '40px', height: '40px' }} />
                <p>Loading schema models...</p>
              </div>
            ) : tables.length === 0 ? (
              <div className="jb-empty-state">
                <span className="jb-empty-state-icon">📂</span>
                <p className="jb-empty-state-text">
                  No tables found. Upload multiple CSV files in the dashboard first.
                </p>
              </div>
            ) : (
              <>
                {/* SVG Connections Canvas */}
                <svg className="jb-canvas-svg">
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="5"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.15)" />
                    </marker>
                  </defs>
                  {connections.map((conn) => {
                    const isSelected = selectedConnectionId === conn.id;
                    return (
                      <path
                        key={conn.id}
                        d={drawBezier(conn)}
                        className={`jb-connection-line jb-connection-line--${conn.joinType} ${
                          isSelected ? 'jb-connection-line--animated' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnectionId(isSelected ? null : conn.id);
                        }}
                      />
                    );
                  })}
                </svg>

                {/* SVG Connections Join Type Badges */}
                {connections.map((conn) => {
                  const badgePos = getBadgePosition(conn);
                  return (
                    <div
                      key={`badge_${conn.id}`}
                      className={`jb-join-badge jb-join-badge--${conn.joinType}`}
                      style={{
                        left: badgePos.x - 24,
                        top: badgePos.y - 12,
                      }}
                      onClick={() => setSelectedConnectionId(conn.id)}
                    >
                      {conn.joinType}
                    </div>
                  );
                })}

                {/* Table Cards */}
                {tables.map((table) => {
                  const pos = tablePositions[table.table_name] || { x: 0, y: 0 };
                  return (
                    <div
                      key={table.table_name}
                      className="jb-table-card"
                      style={{
                        left: pos.x,
                        top: pos.y,
                      }}
                    >
                      <div
                        className="jb-table-card-header"
                        onMouseDown={(e) => startDrag(table.table_name, e.clientX, e.clientY)}
                      >
                        <span className="jb-table-name" title={table.original_filename}>
                          {table.table_name}
                        </span>
                        {table.is_primary ? (
                          <span className="jb-table-badge jb-table-badge--primary">Primary</span>
                        ) : (
                          <span className="jb-table-badge jb-table-badge--rows">
                            {table.row_count ? `${table.row_count} rows` : ''}
                          </span>
                        )}
                      </div>
                      <div className="jb-table-columns">
                        {table.columns.map((col) => {
                          const isSelected =
                            pendingConnection?.tableId === table.table_name &&
                            pendingConnection?.columnName === col.name;

                          const isConnected = connections.some(
                            (c) =>
                              (c.leftTable === table.table_name && c.leftColumn === col.name) ||
                              (c.rightTable === table.table_name && c.rightColumn === col.name)
                          );

                          return (
                            <div
                              key={col.name}
                              className={`jb-column-row ${
                                isSelected ? 'jb-column-row--selected' : ''
                              } ${isConnected ? 'jb-column-row--connected' : ''}`}
                              onClick={() => handleColumnClick(table.table_name, col.name)}
                            >
                              <span className="jb-column-type-icon">
                                {getTypeIcon(col.type)}
                              </span>
                              <span className="jb-column-name" title={col.name}>
                                {col.name}
                              </span>
                              <span className="jb-column-type">{col.type}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Pending connection guide */}
                {pendingConnection && (
                  <div className="jb-pending-hint" onClick={cancelPendingConnection}>
                    Connecting {pendingConnection.tableId}.{pendingConnection.columnName} ... Click
                    another column to join (or click here to cancel)
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Panel / Properties */}
          <div className="join-builder-panel">
            {error && <div className="jb-error-banner">{error}</div>}

            {/* Selected Connection Properties */}
            {selectedConnectionId && (
              <div className="jb-panel-section">
                <h3>Join Properties</h3>
                {connections
                  .filter((c) => c.id === selectedConnectionId)
                  .map((conn) => (
                    <div key={conn.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#c0c0d0' }}>
                        Join <strong>{conn.leftTable}</strong> on{' '}
                        <strong>{conn.leftColumn}</strong> with <strong>{conn.rightTable}</strong>{' '}
                        on <strong>{conn.rightColumn}</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: '#666' }}>JOIN TYPE</label>
                        <div className="jb-join-type-selector">
                          {(['inner', 'left', 'right', 'outer'] as const).map((type) => (
                            <button
                              key={type}
                              className={`jb-join-type-option ${
                                conn.joinType === type ? 'jb-join-type-option--active' : ''
                              }`}
                              onClick={() => setConnectionJoinType(conn.id, type)}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        className="jb-btn jb-btn-ghost"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}
                        onClick={() => {
                          removeConnection(conn.id);
                          setSelectedConnectionId(null);
                        }}
                      >
                        Delete Connection
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Active Connections List */}
            <div className="jb-panel-section" style={{ flex: 1 }}>
              <h3>Active Connections</h3>
              {connections.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>
                  No connections defined. Click columns on two different tables to create a join.
                </p>
              ) : (
                <div className="jb-connection-list">
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      className={`jb-connection-item`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedConnectionId(c.id)}
                    >
                      <span className="jb-connection-item-tables">
                        {c.leftTable}.{c.leftColumn} ⟷ {c.rightTable}.{c.rightColumn} ({c.joinType})
                      </span>
                      <button
                        className="jb-connection-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeConnection(c.id);
                          if (selectedConnectionId === c.id) setSelectedConnectionId(null);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Validation Panel */}
            {validationResult && (
              <div className="jb-panel-section">
                <h3>Pre-flight Validation</h3>
                <div
                  className={`jb-validation-result jb-validation-result--${
                    validationResult.is_valid ? 'valid' : 'invalid'
                  }`}
                >
                  {validationResult.is_valid ? (
                    <>
                      <div className="jb-result-rows">
                        {validationResult.estimated_output_rows?.toLocaleString() || '0'}
                      </div>
                      <div>Estimated rows output. The join config matches correctly.</div>
                    </>
                  ) : (
                    <div>{validationResult.reason}</div>
                  )}
                </div>
              </div>
            )}

            {/* Apply Success Panel */}
            {applyResult && (
              <div className="jb-panel-section">
                <h3>View Created</h3>
                <div className="jb-apply-result">
                  <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: 'bold' }}>
                    ✓ Applied successfully!
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    Virtual table view <code>{applyResult.view_name}</code> created in DuckDB.
                  </div>
                  <div className="jb-apply-result-sql">{applyResult.sql}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
