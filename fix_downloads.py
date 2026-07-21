import os

with open(r'D:\Vizzy Redesign\Vizzy Redesign\backend\app\api\download_routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

# For download_raw_dataset
content = content.replace(
    '    file_path = Path(version.source_reference)\n\n    if not file_path.exists():\n        raise HTTPException(status_code=404, detail="Raw data file not found")\n\n    record_audit_event(',
    '    from app.services.storage import get_storage\n    file_path = version.source_reference\n\n    if not get_storage().exists(file_path):\n        raise HTTPException(status_code=404, detail="Raw data file not found")\n\n    record_audit_event('
)

content = content.replace(
    '    return FileResponse(\n        path=str(file_path),\n        filename=f"raw_data_{version_id}.csv",\n        media_type="text/csv",\n    )',
    '    from starlette.background import BackgroundTask\n    import os\n    local_path = get_storage().download_to_temp(file_path)\n    return FileResponse(\n        path=local_path,\n        filename=f"raw_data_{version_id}.csv",\n        media_type="text/csv",\n        background=BackgroundTask(os.remove, local_path)\n    )'
)

# For download_cleaned_dataset
content = content.replace(
    '    file_path = Path(version.cleaned_reference)\n\n    if not file_path.exists():\n        raise HTTPException(status_code=404, detail="Cleaned data file not found")\n\n    record_audit_event(',
    '    from app.services.storage import get_storage\n    file_path = version.cleaned_reference\n\n    if not get_storage().exists(file_path):\n        raise HTTPException(status_code=404, detail="Cleaned data file not found")\n\n    record_audit_event('
)

content = content.replace(
    '    return FileResponse(\n        path=str(file_path),\n        filename=f"cleaned_data_{version_id}.csv",\n        media_type="text/csv",\n    )',
    '    from starlette.background import BackgroundTask\n    import os\n    local_path = get_storage().download_to_temp(file_path)\n    return FileResponse(\n        path=local_path,\n        filename=f"cleaned_data_{version_id}.csv",\n        media_type="text/csv",\n        background=BackgroundTask(os.remove, local_path)\n    )'
)

# For download_latest_raw_dataset
content = content.replace(
    '    file_path = Path(version.source_reference)\n\n    if not file_path.exists():\n        raise HTTPException(status_code=404, detail="Raw data file not found")\n\n    record_audit_event(',
    '    from app.services.storage import get_storage\n    file_path = version.source_reference\n\n    if not get_storage().exists(file_path):\n        raise HTTPException(status_code=404, detail="Raw data file not found")\n\n    record_audit_event('
)

content = content.replace(
    '    return FileResponse(\n        path=str(file_path),\n        filename=f"raw_data_latest.csv",\n        media_type="text/csv",\n    )',
    '    from starlette.background import BackgroundTask\n    import os\n    local_path = get_storage().download_to_temp(file_path)\n    return FileResponse(\n        path=local_path,\n        filename=f"raw_data_latest.csv",\n        media_type="text/csv",\n        background=BackgroundTask(os.remove, local_path)\n    )'
)

# For download_latest_cleaned_dataset
content = content.replace(
    '    file_path = Path(version.cleaned_reference)\n\n    if not file_path.exists():\n        raise HTTPException(status_code=404, detail="Cleaned data file not found")\n\n    record_audit_event(',
    '    from app.services.storage import get_storage\n    file_path = version.cleaned_reference\n\n    if not get_storage().exists(file_path):\n        raise HTTPException(status_code=404, detail="Cleaned data file not found")\n\n    record_audit_event('
)

content = content.replace(
    '    return FileResponse(\n        path=str(file_path),\n        filename=f"cleaned_data_latest.csv",\n        media_type="text/csv",\n    )',
    '    from starlette.background import BackgroundTask\n    import os\n    local_path = get_storage().download_to_temp(file_path)\n    return FileResponse(\n        path=local_path,\n        filename=f"cleaned_data_latest.csv",\n        media_type="text/csv",\n        background=BackgroundTask(os.remove, local_path)\n    )'
)

with open(r'D:\Vizzy Redesign\Vizzy Redesign\backend\app\api\download_routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
