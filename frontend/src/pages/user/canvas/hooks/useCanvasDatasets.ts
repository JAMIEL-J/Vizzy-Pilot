// useCanvasDatasets — dataset/version selection, field loading, schema — extracted from CanvasPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { datasetService, type Dataset, type DatasetVersionSummary } from '../../../../lib/api/dataset';
import { canvasService } from '../../../../lib/api/canvas';
import { toast } from 'react-hot-toast';
import type { CanvasWidget, FieldDef } from '../types';

interface UseCanvasDatasetsParams {
  setWidgets: React.Dispatch<React.SetStateAction<CanvasWidget[]>>;
  fieldsListRef: React.MutableRefObject<FieldDef[]>;
  checkedFieldsRef: React.MutableRefObject<string[]>;
  addLog: (msg: string) => void;
}

interface UseCanvasDatasetsReturn {
  // Dataset state
  datasets: Dataset[];
  selectedDatasetId: string;
  setSelectedDatasetId: (id: string) => void;
  versions: DatasetVersionSummary[];
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  canvasChatSessionId: string | null;
  setCanvasChatSessionId: (id: string | null) => void;

  // Fields
  fieldsList: FieldDef[];
  setFieldsList: React.Dispatch<React.SetStateAction<FieldDef[]>>;
  isLoadingColumns: boolean;
  checkedFields: string[];
  setCheckedFields: React.Dispatch<React.SetStateAction<string[]>>;

  // Calculated fields
  calcPrompt: string;
  setCalcPrompt: (v: string) => void;
  isCreatingCalcField: boolean;

  // Delete field modal state
  deleteFieldId: string | null;
  setDeleteFieldId: (id: string | null) => void;
  showDeleteFieldModal: boolean;
  setShowDeleteFieldModal: (v: boolean) => void;

  // Actions
  handleDatasetChange: (datasetId: string, keepWidgets?: boolean, targetVersionId?: string) => Promise<void>;
  handleVersionChange: (versionId: string) => void;
  handleFieldToggle: (fieldName: string, selectedWidgetId: string | null, recompileWidget: (widgetId: string, fields: string[]) => void) => void;
  handleDeleteField: (fieldName: string, e: React.MouseEvent) => void;
  executeDeleteField: () => Promise<void>;
  handleCreateCalculatedField: (e?: React.FormEvent | React.KeyboardEvent) => Promise<void>;
  loadDatasetColumns: (datasetId: string, versionId: string) => Promise<void>;
}

export function useCanvasDatasets(params: UseCanvasDatasetsParams): UseCanvasDatasetsReturn {
  const { setWidgets, fieldsListRef, checkedFieldsRef, addLog } = params;

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => localStorage.getItem('vizzy_last_dataset_id') || '');
  const [versions, setVersions] = useState<DatasetVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(() => localStorage.getItem('vizzy_last_version_id') || '');
  const [canvasChatSessionId, setCanvasChatSessionId] = useState<string | null>(null);

  const [fieldsList, setFieldsList] = useState<FieldDef[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [checkedFields, setCheckedFields] = useState<string[]>([]);

  const [calcPrompt, setCalcPrompt] = useState('');
  const [isCreatingCalcField, setIsCreatingCalcField] = useState(false);

  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [showDeleteFieldModal, setShowDeleteFieldModal] = useState(false);

  // Keep refs in sync
  useEffect(() => { fieldsListRef.current = fieldsList; }, [fieldsList, fieldsListRef]);
  useEffect(() => { checkedFieldsRef.current = checkedFields; }, [checkedFields, checkedFieldsRef]);

  // Load column schema
  const loadDatasetColumns = useCallback(async (datasetId: string, _versionId: string) => {
    setIsLoadingColumns(true);
    try {
      addLog('Loading column schema via Canvas API...');
      const schema = await canvasService.getSchema(datasetId);
      
      const dynamicFields = schema.columns.map((col: any) => ({
        name: col.name,
        category: col.category === 'Dates' ? 'Dimensions' : col.category,
        type: col.category === 'Metrics' ? 'numeric' : col.category === 'Dates' ? 'date' : 'text',
        formula: (col as any).formula
      }));
      
      if (dynamicFields.length > 0) {
        setFieldsList(dynamicFields);
        
        const defaultChecked: string[] = [];
        const firstMetric = dynamicFields.find((f: FieldDef) => f.category === 'Metrics');
        const firstDim = dynamicFields.find((f: FieldDef) => f.category === 'Dimensions');
        if (firstMetric) defaultChecked.push(firstMetric.name);
        if (firstDim) defaultChecked.push(firstDim.name);
        if (defaultChecked.length === 0 && dynamicFields.length > 0) {
          defaultChecked.push(dynamicFields[0].name);
        }
        setCheckedFields(defaultChecked);
        addLog(`Loaded ${dynamicFields.length} columns (${schema.dataset_name}, ${schema.row_count?.toLocaleString() ?? '?'} rows)`);
      } else {
        setFieldsList([]);
        addLog('No columns found in dataset schema.');
      }
    } catch (err) {
      console.error('Canvas schema load failed:', err);
      addLog('ERROR: Failed to load schema. Falling back to status endpoint...');
      
      try {
        const statusData = await datasetService.getDuckdbStatus(datasetId);
        if (statusData.schema && statusData.schema.length > 0) {
          const fallbackFields = statusData.schema.map((col: any) => {
            const typeLower = (col.dtype || '').toLowerCase();
            const isNumeric = ['int', 'double', 'float', 'decimal', 'numeric', 'real', 'bigint'].some(t => typeLower.includes(t));
            const isDate = ['date', 'time', 'timestamp'].some(t => typeLower.includes(t));
            return { name: col.name, category: isNumeric ? 'Metrics' : 'Dimensions', type: isNumeric ? 'numeric' : isDate ? 'date' : 'text' };
          });
          setFieldsList(fallbackFields);
          const defaultChecked = fallbackFields.slice(0, 2).map((f: any) => f.name);
          setCheckedFields(defaultChecked);
          addLog(`Fallback loaded ${fallbackFields.length} columns.`);
        } else {
          setFieldsList([]);
        }
      } catch {
        setFieldsList([]);
      }
    } finally {
      setIsLoadingColumns(false);
    }
  }, [addLog]);

  // Load datasets on mount
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const data = await datasetService.listDatasets();
        setDatasets(data);
        const savedDatasetId = localStorage.getItem('vizzy_last_dataset_id') || '';
        const savedVersionId = localStorage.getItem('vizzy_last_version_id') || '';
        if (savedDatasetId) {
          const vers = await datasetService.listVersionsForDataset(savedDatasetId);
          setVersions(vers);
          const activeVer = savedVersionId || (vers.length > 0 ? vers[0].id : '');
          if (activeVer) {
            setSelectedVersionId(activeVer);
            loadDatasetColumns(savedDatasetId, activeVer);
          }
        }
      } catch (err) {
        console.error("Failed to load datasets:", err);
      }
    };
    loadDatasets();
  }, [loadDatasetColumns]);

  const handleDatasetChange = useCallback(async (datasetId: string, keepWidgets: boolean = false, targetVersionId?: string) => {
    setSelectedDatasetId(datasetId);
    localStorage.setItem('vizzy_last_dataset_id', datasetId);
    setCanvasChatSessionId(null);
    if (!keepWidgets) setWidgets([]);
    try {
      if (datasetId) {
        const vers = await datasetService.listVersionsForDataset(datasetId);
        setVersions(vers);
        if (vers.length > 0) {
          const latestVersion = targetVersionId && vers.some((v: any) => v.id === targetVersionId) ? targetVersionId : vers[0].id;
          setSelectedVersionId(latestVersion);
          localStorage.setItem('vizzy_last_version_id', latestVersion);
          loadDatasetColumns(datasetId, latestVersion);
        } else {
          setSelectedVersionId('');
          setFieldsList([]);
        }
      } else {
        setVersions([]);
        setSelectedVersionId('');
        setFieldsList([]);
      }
    } catch (err) {
      console.error("Failed to load versions:", err);
      setFieldsList([]);
    }
  }, [setWidgets, loadDatasetColumns]);

  const handleVersionChange = useCallback((versionId: string) => {
    setSelectedVersionId(versionId);
    localStorage.setItem('vizzy_last_version_id', versionId);
    setCanvasChatSessionId(null);
    setWidgets([]);
    if (selectedDatasetId && versionId) {
      loadDatasetColumns(selectedDatasetId, versionId);
    }
  }, [selectedDatasetId, setWidgets, loadDatasetColumns]);

  const handleFieldToggle = useCallback((
    fieldName: string, 
    selectedWidgetId: string | null, 
    recompileWidget: (widgetId: string, fields: string[]) => void
  ) => {
    const fieldObj = fieldsList.find(f => f.name === fieldName);
    if (!fieldObj) return;

    let nextChecked = [...checkedFields];
    if (nextChecked.includes(fieldName)) {
      nextChecked = nextChecked.filter(f => f !== fieldName);
    } else {
      nextChecked.push(fieldName);
    }
    
    setCheckedFields(nextChecked);
    addLog(`PowerBI Fields updated: Active Selection: [${nextChecked.join(', ')}]`);

    if (selectedWidgetId) {
      recompileWidget(selectedWidgetId, nextChecked);
    }

    if (nextChecked.length >= 2) {
      const activeMetrics = nextChecked.filter(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
      const activeDimensions = nextChecked.filter(f => fieldsList.some(af => af.name === f && af.category === 'Dimensions'));
      
      if (activeMetrics.length > 0 && activeDimensions.length > 0) {
        addLog(`System suggestions: Compiling dynamic visual matching (${activeMetrics.join(' + ')} × ${activeDimensions.join(' + ')})...`);
      }
    }
  }, [fieldsList, checkedFields, addLog]);

  const handleDeleteField = useCallback((fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteFieldId(fieldName);
    setShowDeleteFieldModal(true);
  }, []);

  const executeDeleteField = useCallback(async () => {
    if (!deleteFieldId || !selectedDatasetId) return;
    
    try {
      const updatedSchema = await canvasService.deleteField(selectedDatasetId, deleteFieldId);
      
      if (updatedSchema && updatedSchema.columns) {
        const updatedCols = updatedSchema.columns.map((c: any) => ({
          name: c.name,
          dtype: c.dtype,
          category: c.category,
          type: c.dtype.toLowerCase(),
          formula: c.formula
        }));
        setFieldsList(updatedCols);
      } else {
        setFieldsList(prev => prev.filter(f => f.name !== deleteFieldId));
      }
      
      setCheckedFields(prev => prev.filter(f => f !== deleteFieldId));
      toast.success(`Field "${deleteFieldId}" deleted successfully`);
      addLog(`Field "${deleteFieldId}" deleted.`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to delete field: ${err.response?.data?.detail || err.message}`);
    } finally {
      setShowDeleteFieldModal(false);
      setDeleteFieldId(null);
    }
  }, [deleteFieldId, selectedDatasetId, addLog]);

  const handleCreateCalculatedField = useCallback(async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }
    if (!calcPrompt.trim()) {
      toast.error("Please type a calculation prompt.");
      return;
    }

    addLog(`AI Generating calculated field for: "${calcPrompt}"...`);
    setIsCreatingCalcField(true);

    try {
      const res = await canvasService.createCalculatedField(selectedDatasetId, calcPrompt);
      if (res && res.success) {
        addLog(`SUCCESS: Generated calculated field "${res.field_name}" with formula: [${res.formula_sql}]`);
        toast.success(`Created calculated field: "${res.field_name}"`);
        
        if (res.schema && res.schema.columns) {
          const updatedCols = res.schema.columns.map((c: any) => ({
            name: c.name,
            dtype: c.dtype,
            category: c.category,
            type: c.dtype.toLowerCase(),
            formula: c.formula
          }));
          setFieldsList(updatedCols);
        }
        
        setCalcPrompt('');
      } else {
        throw new Error("Failed to generate calculated field");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Calculated field failed: ${err.response?.data?.detail || err.message || err}`);
      toast.error(err.response?.data?.detail || "AI formula generation failed. Try specifying your math explicitly.");
    } finally {
      setIsCreatingCalcField(false);
    }
  }, [selectedDatasetId, calcPrompt, addLog]);

  return {
    datasets, selectedDatasetId, setSelectedDatasetId,
    versions, selectedVersionId, setSelectedVersionId,
    canvasChatSessionId, setCanvasChatSessionId,
    fieldsList, setFieldsList, isLoadingColumns,
    checkedFields, setCheckedFields,
    calcPrompt, setCalcPrompt, isCreatingCalcField,
    deleteFieldId, setDeleteFieldId,
    showDeleteFieldModal, setShowDeleteFieldModal,
    handleDatasetChange, handleVersionChange,
    handleFieldToggle, handleDeleteField, executeDeleteField,
    handleCreateCalculatedField, loadDatasetColumns
  };
}
