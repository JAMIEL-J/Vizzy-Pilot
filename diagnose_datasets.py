"""Quick diagnostic: trace exactly what's happening on the dataset endpoints."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from sqlmodel import Session, select
from app.models.database import engine
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

with Session(engine) as session:
    # 1. List all active datasets
    datasets = session.exec(select(Dataset).where(Dataset.is_active == True)).all()
    print(f"\n=== ACTIVE DATASETS IN DB: {len(datasets)} ===")
    
    for ds in datasets:
        print(f"\n--- Dataset: {ds.name} (id={ds.id}) ---")
        print(f"    owner_id: {ds.owner_id}")
        
        # 2. Check if it has ANY versions
        all_versions = session.exec(
            select(DatasetVersion).where(DatasetVersion.dataset_id == ds.id)
        ).all()
        print(f"    Total versions (any status): {len(all_versions)}")
        
        # 3. Check active versions
        active_versions = session.exec(
            select(DatasetVersion).where(
                DatasetVersion.dataset_id == ds.id,
                DatasetVersion.is_active == True,
            ).order_by(DatasetVersion.version_number.desc())
        ).all()
        print(f"    Active versions: {len(active_versions)}")
        
        if active_versions:
            latest = active_versions[0]
            print(f"    Latest version: v{latest.version_number} (id={latest.id})")
            print(f"    source_reference: {latest.source_reference}")
            print(f"    source_ref exists: {os.path.exists(latest.source_reference) if latest.source_reference else 'N/A'}")
            print(f"    cleaned_reference: {latest.cleaned_reference}")
            print(f"    schema_metadata: {'present' if latest.schema_metadata else 'MISSING'}")
            print(f"    row_count: {latest.row_count}")
        else:
            print(f"    ⚠️  NO ACTIVE VERSIONS - getLatestVersion will throw ResourceNotFound!")
            
            if all_versions:
                for v in all_versions:
                    print(f"       Inactive version: v{v.version_number} (id={v.id}, is_active={v.is_active})")
            else:
                print(f"       ❌ NO VERSIONS AT ALL - orphaned dataset!")
