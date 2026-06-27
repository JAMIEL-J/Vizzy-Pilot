"""Domain Workforce - extracted from generators.py"""
from .prioritization import _should_average_metric, _metric_format_type, _trend_aggregation_for_metric
from .titles import _pick_column_by_keywords, _get_binary_target_labels, _smart_target_label, _beautify_column_name
from .query_helpers import _get_target_distribution, _get_time_trend, _to_trend_point_key, _get_scatter_data, _distribution_chart
from .churn_analytics import _get_churned_vs_retained_avg, _get_lifecycle_cohorts, _build_target_rate_chart
from .domain_ops import _generate_generic_charts

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

from app.services.analytics.column_filter import ColumnClassification

from .aggregators import _safe_groupby_mean, _safe_groupby_sum, _safe_value_counts
from .models import ChartRecommendation
from .prioritization import (
    _get_metric_prefix,
    _infer_time_value_label,
    _metric_format_type,
    _prioritize_dimensions,
    _prioritize_metrics,
    _round_mean_value,
    _should_average_metric,
    _trend_aggregation_for_metric,
)
from .query_helpers import (
    _distribution_chart,
    _get_scatter_data,
    _get_target_distribution,
    _get_time_trend,
    _smart_aggregate,
)
from .sanitization import _coerce_numeric_metric_series, _safe_to_datetime
from .titles import (
    _beautify_column_name,
    _create_smart_title,
    _format_categorical_value,
    _get_binary_target_labels,
    _pick_column_by_keywords,
    _smart_target_label,
)

logger = logging.getLogger(__name__)

def _generate_healthcare_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate operational/clinical charts for the Healthcare domain."""
    charts = []
    def add_chart(rec):
        if rec:
            rec.is_domain_specific = True
            charts.append(rec)

    pm = classification.metrics
    pd_ = classification.dimensions
    dates = classification.dates
    excluded = classification.excluded

    # 1. Enhanced Pre-Mapper Role Definitions (Semantic Detection)
    patient_col = _pick_column_by_keywords(df, pd_, ['patient', 'patientid', 'name', 'mrn', 'subject_id'], exclude=excluded)
    encounter_col = _pick_column_by_keywords(df, pd_, ['encounter', 'visit', 'admission_id', 'hadm_id'], exclude=excluded)
    age_col = _pick_column_by_keywords(df, pm, ['age'], exclude=excluded)
    condition_col = _pick_column_by_keywords(df, pd_, ['condition', 'diagnosis', 'disease', 'medical_condition', 'drg', 'drg_code', 'icd'], exclude=excluded)
    insurance_col = _pick_column_by_keywords(df, pd_, ['insurance', 'provider', 'insurance_provider', 'payer', 'primary_payer'], exclude=excluded)
    cost_col = _pick_column_by_keywords(df, pm, ['cost', 'charge', 'charges', 'bill', 'billing', 'billing_amount', 'total_amount', 'paid'], exclude=excluded)
    
    admission_type_col = _pick_column_by_keywords(df, pd_, ['admission_type', 'intake_method', 'admit_type', 'admission'], exclude=excluded)
    gender_col = _pick_column_by_keywords(df, pd_, ['gender', 'sex'], exclude=excluded)
    dept_col = _pick_column_by_keywords(df, pd_, ['department', 'ward', 'unit'], exclude=excluded)
    hospital_col = _pick_column_by_keywords(df, pd_, ['hospital', 'facility', 'clinic', 'location'], exclude=excluded)
    doctor_col = _pick_column_by_keywords(df, pd_, ['doctor', 'physician', 'provider', 'attending'], exclude=excluded)
    medication_col = _pick_column_by_keywords(df, pd_, ['medication', 'drug', 'medicine', 'prescription'], exclude=excluded)
    
    # Advanced / Calculated columns
    admit_date_col = _pick_column_by_keywords(df, dates, ['admit', 'admission', 'admission_date', 'date_of_admission'], exclude=excluded)
    if not admit_date_col and dates: admit_date_col = dates[0]
    
    los_col = _pick_column_by_keywords(df, pm, ['los', 'length_of_stay', 'days_in_hospital'], exclude=excluded)
    readmission_col = _pick_column_by_keywords(df, pd_ + classification.targets, ['readmission', 'readmitted', '30_day_readmit'], exclude=excluded)
    mortality_col = _pick_column_by_keywords(df, pd_ + classification.targets, ['mortality', 'deceased', 'expired', 'death', 'died'], exclude=excluded)

    # ── 1. Readmission Rate by Condition (Bar) ────────────────────────────────
    if condition_col and readmission_col:
        add_chart(_build_target_rate_chart(
            df, readmission_col, condition_col,
            f'Readmission Rate by {_beautify_column_name(condition_col)}',
            'Identifies high-risk clinical conditions driving readmissions'
        ))

    # ── 2. Total Cost by Condition (Bar) ──────────────────────────────────────
    if condition_col and cost_col:
        data = _safe_groupby_sum(df, condition_col, cost_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Total Cost by {_beautify_column_name(condition_col)}', 'hbar', data, 'HIGH',
                'Highest cost conditions driving facility expenses',
                format_type='currency', value_label='Cost',
                dimension=condition_col, metric=cost_col, aggregation='sum'
            ))

    # ── 3. Average Length of Stay by Condition (Bar) ──────────────────────────
    if condition_col and los_col:
        data = _safe_groupby_mean(df, condition_col, los_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Avg Length of Stay by {_beautify_column_name(condition_col)}', 'hbar', data, 'HIGH',
                'Resource utilization and capacity forecasting',
                format_type='number', value_label='Days',
                dimension=condition_col, metric=los_col, aggregation='mean'
            ))

    # ── 4. Cost vs. Length of Stay (Scatter) ──────────────────────────────────
    if cost_col and los_col:
        data = _get_scatter_data(df, los_col, cost_col, label_col=condition_col or dept_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Cost vs. Length of Stay', 'scatter', data, 'HIGH',
                'Correlation between time in hospital and total charges',
                dimension=los_col, metric=cost_col, aggregation='mean'
            ))

    # ── 5. Revenue / Cost by Payer Mix (Donut) ────────────────────────────────
    if insurance_col:
        if cost_col:
            data = _safe_groupby_sum(df, insurance_col, cost_col)
            add_chart(ChartRecommendation(
                '', 'Revenue by Payer Mix', 'donut', data, 'HIGH',
                'Financial exposure across insurance providers',
                format_type='currency', value_label='Revenue',
                dimension=insurance_col, metric=cost_col, aggregation='sum'
            ))
        else:
            add_chart(_distribution_chart(
                df, insurance_col,
                'Payer Mix (Patient Volume)', 'HIGH',
                'Insurance provider distribution', 'Patients', prefer_pie=True
            ))

    # ── 6. Admissions Over Time (Area/Line) ──────────────────────────────────
    if admit_date_col:
        try:
            df_temp = df.copy()
            df_temp[admit_date_col] = _safe_to_datetime(df_temp[admit_date_col])
            df_temp = df_temp.dropna(subset=[admit_date_col])
            trend = df_temp.groupby(pd.Grouper(key=admit_date_col, freq='MS')).size()
            data = [{"timestamp": ts_label, "date": ts_date, "value": int(v)} 
                    for k, v in trend.items() 
                    for ts_label, ts_date in [_to_trend_point_key(k)] if ts_label is not None]
            if data:
                add_chart(ChartRecommendation(
                    '', 'Admissions Trend Over Time', 'area', data, 'HIGH',
                    'Patient volume flow',
                    format_type='number', value_label='Admissions',
                    dimension=admit_date_col, metric=None, aggregation='count'
                ))
        except Exception:
            pass

    # ── 7. Mortality Rate by Department (Bar) ─────────────────────────────────
    if dept_col and mortality_col:
        add_chart(_build_target_rate_chart(
            df, mortality_col, dept_col,
            f'Mortality Rate by {_beautify_column_name(dept_col)}',
            'Clinical outcome tracking across departments'
        ))

    # ── 8. Admission Types (Pie) ─────────────────────────────────────────────
    if admission_type_col:
        add_chart(_distribution_chart(
            df, admission_type_col,
            'Admission Types', 'MEDIUM',
            'Emergency vs Elective intake breakdown',
            'Patients', prefer_pie=True
        ))

    # ── 9. Condition Distribution (Bar) ──────────────────────────────────────
    if condition_col:
        add_chart(_distribution_chart(
            df, condition_col,
            'Top Medical Conditions', 'MEDIUM',
            'Identifies where expertise and equipment should be focused',
            'Patients', prefer_pie=False
        ))
        
    # ── 10. Top Doctors by Patient Volume (Bar) ──────────────────────────────
    if doctor_col:
        add_chart(_distribution_chart(
            df, doctor_col,
            f'Top {_beautify_column_name(doctor_col)}s by Patient Volume', 'MEDIUM',
            'Workload distribution across physicians',
            'Patients', prefer_pie=False
        ))
        
    # ── 11. Top Hospitals / Facilities (Bar) ─────────────────────────────────
    if hospital_col:
        add_chart(_distribution_chart(
            df, hospital_col,
            f'Patient Volume by {_beautify_column_name(hospital_col)}', 'MEDIUM',
            'Facility utilization and volume',
            'Patients', prefer_pie=False
        ))

    # ── 12. Medication Distribution (Pie/Bar) ────────────────────────────────
    if medication_col:
        add_chart(_distribution_chart(
            df, medication_col,
            'Top Prescribed Medications', 'MEDIUM',
            'Pharmacy utilization patterns',
            'Prescriptions', prefer_pie=False
        ))
        
    # ── 13. Test Results (Pie/Bar) ───────────────────────────────────────────
    test_result_col = _pick_column_by_keywords(df, pd_, ['test', 'result', 'lab'], exclude=excluded)
    if test_result_col:
        add_chart(_distribution_chart(
            df, test_result_col,
            'Test Results Distribution', 'MEDIUM',
            'Clinical testing outcomes',
            'Patients', prefer_pie=True
        ))
        
    # ── 14. Financials by Doctor (Bar) ───────────────────────────────────────
    if doctor_col and cost_col:
        data = _safe_groupby_sum(df, doctor_col, cost_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Total Revenue by {_beautify_column_name(doctor_col)}', 'hbar', data, 'MEDIUM',
                'Physician financial contribution',
                format_type='currency', value_label='Revenue',
                dimension=doctor_col, metric=cost_col, aggregation='sum'
            ))

    # ── EXHAUSTIVE DIMENSION COVERAGE ──────────────────────────────────────────
    MAX_CHARTS = 15
    used_dims = {condition_col, insurance_col, admission_type_col, dept_col,
                 gender_col, hospital_col, doctor_col, medication_col, test_result_col}
    used_dims.discard(None)
    
    avail_dims = [d for d in pd_ if d not in used_dims]
    
    # STRICT FALLBACK: Only perform dimension cross-tabs if we have a true operational metric.
    # We DO NOT want to cross-tab every dimension against 'Age' or a random numeric column.
    operational_metric = cost_col or los_col
    
    for dim in avail_dims:
        if len(charts) >= MAX_CHARTS:
            break
        nunique = df[dim].nunique()
        if nunique < 2 or nunique > 50:
            continue
        
        # 1. Always add the volume distribution
        add_chart(_distribution_chart(
            df, dim,
            f'{_beautify_column_name(dim)} Distribution', 'LOW',
            f'Patient distribution by {_beautify_column_name(dim)}',
            'Count', prefer_pie=nunique <= 5
        ))
        
        # 2. Add operational metric cross-tab (Cost/LOS)
        if operational_metric and len(charts) < MAX_CHARTS:
            agg = 'mean' if _should_average_metric(operational_metric) else 'sum'
            data = _safe_groupby_mean(df, dim, operational_metric) if agg == 'mean' else _safe_groupby_sum(df, dim, operational_metric)
            if data:
                add_chart(ChartRecommendation(
                    '', f'{_beautify_column_name(operational_metric)} by {_beautify_column_name(dim)}',
                    'bar' if nunique < 8 else 'hbar', data, 'LOW',
                    f'{_beautify_column_name(operational_metric)} breakdown across {_beautify_column_name(dim)}',
                    dimension=dim, metric=operational_metric, aggregation=agg
                ))

    # Assign slot numbers
    for i, chart in enumerate(charts):
        chart.slot = f"slot_{i + 1}"
    
    return charts


def _infer_hr_metric_context(df: pd.DataFrame, col: Optional[str]) -> tuple:
    """Infer (format_type, value_label) for HR-specific metrics.

    Returns smart format_type and value_label based on column semantics + value range.
    This prevents DailyRate from being shown as %, and gives proper units to Likert scales,
    distance, training counts, etc.

    Returns:
        (format_type: str, value_label: str)
    """
    if not col or col not in df.columns:
        return ('number', 'Value')

    low = col.lower().replace('_', '').replace('-', '').replace(' ', '')

    # ── Percentage metrics (check FIRST — 'percentsalaryhike' contains 'salary') ──
    pct_patterns = ['percentsalaryhike', 'salaryhike', 'attrition', 'turnover',
                    'percent', 'pct', 'hike']
    if any(pat in low for pat in pct_patterns):
        return ('percentage', '%')

    # ── Currency metrics ───────────────────────────────────────────
    currency_patterns = [
        'salary', 'income', 'pay', 'wage', 'compensation', 'payroll',
        'dailyrate', 'hourlyrate', 'monthlyrate', 'monthlyincome',
        'annualincome', 'annualsalary', 'hourlypay', 'dailypay',
    ]
    if any(pat in low for pat in currency_patterns):
        # Determine pay period for label
        if 'hourly' in low or 'hourlypay' in low:
            return ('currency', 'USD/hr')
        if 'daily' in low or 'dailypay' in low:
            return ('currency', 'USD/day')
        if 'monthly' in low:
            return ('currency', 'USD/mo')
        if 'annual' in low or 'yearly' in low:
            return ('currency', 'USD/yr')
        return ('currency', 'USD')

    # ── Likert scale metrics (1-4 or 1-5) ──────────────────────────
    likert_patterns = [
        'satisfaction', 'jobsatisfaction', 'environmentsatisfaction',
        'relationshipsatisfaction', 'involvement', 'jobinvolvement',
        'worklifebalance', 'worklife', 'performancerating', 'performance',
        'rating', 'joblevel', 'education', 'stockoptionlevel',
    ]
    if any(pat in low for pat in likert_patterns):
        # Detect the actual scale from data
        try:
            vals = pd.to_numeric(df[col], errors='coerce').dropna()
            if not vals.empty:
                col_min = int(vals.min())
                col_max = int(vals.max())
                if col_max <= 5:
                    return ('number', f'Rating ({col_min}-{col_max})')
                elif col_max <= 10:
                    return ('number', f'Score ({col_min}-{col_max})')
        except Exception:
            pass
        return ('number', 'Rating')

    # ── Distance / commute ─────────────────────────────────────────
    if any(pat in low for pat in ['distance', 'distancefromhome', 'commute']):
        return ('number', 'Miles')

    # ── Age ─────────────────────────────────────────────────────────
    if low in ('age', 'employeeage'):
        return ('number', 'Years')

    # ── Tenure / years-based ───────────────────────────────────────
    tenure_patterns = [
        'yearsatcompany', 'totalworkingyears', 'yearsincurrentrole',
        'yearssince', 'yearswithcurr', 'tenure', 'experience', 'seniority',
    ]
    if any(pat in low for pat in tenure_patterns):
        return ('number', 'Years')

    # ── Training ───────────────────────────────────────────────────
    if any(pat in low for pat in ['training', 'trainingtimes', 'courses', 'learning']):
        return ('number', 'Sessions')

    # ── Count-like / ID-like ───────────────────────────────────────
    if any(pat in low for pat in ['numcompanies', 'companiesworked', 'count', 'number']):
        return ('number', 'Count')

    # ── Standard hours ─────────────────────────────────────────────
    if 'hours' in low or 'standardhours' in low:
        return ('number', 'Hours')

    # ── Fallback: use _metric_format_type ──────────────────────────
    fmt = _metric_format_type(col)
    return (fmt or 'number', 'Value')


def _generate_hr_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate HR-specific charts focused on workforce, attrition, compensation, and engagement.

    Tiered approach (mirrors Churn density):
    1. Attrition & Retention Analysis (target-based, if available)
    2. Compensation Analysis (salary, income, pay breakdowns)
    3. Performance & Engagement (ratings, satisfaction, work-life balance)
    4. Workforce Demographics (department, gender, education, marital status)
    5. Exhaustive Dimension Coverage (every unused dim gets charts)
    """
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    # ── COLUMN RESOLUTION (broad keyword matching) ──────────────────────
    target_col = classification.targets[0] if classification.targets else None

    # Dimensions
    department_col = _pick_column_by_keywords(df, pd_, ['department', 'team', 'org', 'division', 'business unit', 'unit'])
    role_col = _pick_column_by_keywords(df, pd_, ['role', 'job', 'title', 'position', 'level', 'grade', 'designation', 'jobrole', 'job role'])
    location_col = _pick_column_by_keywords(df, pd_, ['location', 'office', 'site', 'region', 'city', 'country', 'branch'])
    gender_col = _pick_column_by_keywords(df, pd_, ['gender', 'sex'])
    education_col = _pick_column_by_keywords(df, pd_, ['education', 'educationfield', 'education field', 'degree', 'qualification'])
    marital_col = _pick_column_by_keywords(df, pd_, ['marital', 'marital status', 'maritalstatus', 'married'])
    overtime_col = _pick_column_by_keywords(df, pd_, ['overtime', 'over time', 'over_time'])
    travel_col = _pick_column_by_keywords(df, pd_, ['travel', 'business travel', 'businesstravel'])

    # Metrics
    salary_col = _pick_column_by_keywords(df, pm, [
        'salary', 'pay', 'wage', 'compensation', 'payroll', 'income',
        'monthly income', 'monthlyincome', 'annual income', 'hourly rate', 'hourlyrate',
        'daily rate', 'dailyrate', 'monthly rate', 'monthlyrate'
    ])
    tenure_col = _pick_column_by_keywords(df, pm, [
        'tenure', 'years at company', 'yearsatcompany', 'experience',
        'seniority', 'total working years', 'totalworkingyears',
        'years in current role', 'yearsincurrentrole', 'years with curr manager',
        'yearswithcurrmanager', 'numcompaniesworked', 'num companies worked'
    ])
    performance_col = _pick_column_by_keywords(df, pm, [
        'performance', 'rating', 'performance rating', 'performancerating',
        'score', 'review', 'appraisal'
    ])
    satisfaction_col = _pick_column_by_keywords(df, pm, [
        'satisfaction', 'job satisfaction', 'jobsatisfaction',
        'environment satisfaction', 'environmentsatisfaction',
        'relationship satisfaction', 'relationshipsatisfaction'
    ])
    involvement_col = _pick_column_by_keywords(df, pm, [
        'involvement', 'job involvement', 'jobinvolvement', 'engagement'
    ])
    worklife_col = _pick_column_by_keywords(df, pm, [
        'work life', 'worklife', 'work life balance', 'worklifebalance', 'balance'
    ])
    age_col = _pick_column_by_keywords(df, pm, ['age', 'employee age'])
    training_col = _pick_column_by_keywords(df, pm, [
        'training', 'training times', 'trainingtimeslastyear',
        'training times last year', 'courses', 'learning'
    ])
    distance_col = _pick_column_by_keywords(df, pm, [
        'distance', 'distance from home', 'distancefromhome', 'commute'
    ])

    # Best primary dimension for grouping
    primary_dim = department_col or role_col or (pd_[0] if pd_ else None)

    used_dims: Set[Optional[str]] = set()

    # ── TIER 1: ATTRITION & RETENTION ──────────────────────────────────
    if target_col:
        # 1a. Attrition Overview (donut)
        data = _get_target_distribution(df, target_col)
        if data:
            label = _smart_target_label(target_col)
            add_chart(ChartRecommendation(
                '', f'{label} Overview', 'donut', data, 'HIGH',
                f'Overall {label.lower()} split across workforce',
                value_label='Employees',
                dimension=target_col, metric=None, aggregation='count'
            ))

        # 1b. Attrition Rate by Department
        if department_col:
            add_chart(_build_target_rate_chart(
                df, target_col, department_col,
                f'Attrition Rate by {_beautify_column_name(department_col)}',
                'Attrition risk across departments'
            ))
            used_dims.add(department_col)

        # 1c. Attrition Rate by Job Role
        if role_col and role_col != department_col:
            add_chart(_build_target_rate_chart(
                df, target_col, role_col,
                f'Attrition Rate by {_beautify_column_name(role_col)}',
                'Attrition risk across job roles'
            ))
            used_dims.add(role_col)

        # 1d. Attrition Rate by Overtime
        if overtime_col:
            add_chart(_build_target_rate_chart(
                df, target_col, overtime_col,
                f'Attrition Rate by {_beautify_column_name(overtime_col)}',
                'Overtime impact on attrition'
            ))
            used_dims.add(overtime_col)

        # 1e. Attrition by Travel Frequency
        if travel_col:
            add_chart(_build_target_rate_chart(
                df, target_col, travel_col,
                f'Attrition Rate by {_beautify_column_name(travel_col)}',
                'Travel requirements impact on attrition'
            ))
            used_dims.add(travel_col)

        # 1f. Attrition by Marital Status
        if marital_col:
            add_chart(_build_target_rate_chart(
                df, target_col, marital_col,
                f'Attrition Rate by {_beautify_column_name(marital_col)}',
                'Marital status impact on attrition'
            ))
            used_dims.add(marital_col)

        # 1g. Attrition by Education Field
        if education_col:
            add_chart(_build_target_rate_chart(
                df, target_col, education_col,
                f'Attrition Rate by {_beautify_column_name(education_col)}',
                'Education field impact on attrition'
            ))
            used_dims.add(education_col)

        # 1h. Tenure Cohort Attrition (data-driven quartile buckets)
        if tenure_col:
            data = _get_lifecycle_cohorts(df, tenure_col, target_col)
            if data:
                add_chart(ChartRecommendation(
                    '', f'Attrition Rate by {_beautify_column_name(tenure_col)} Cohort (%)',
                    'bar', data, 'HIGH',
                    'When in the employee lifecycle do they leave?',
                    format_type='percentage',
                    dimension=tenure_col, metric=target_col, aggregation='mean'
                ))

        # 1i. Avg Metric comparison: Attrited vs Retained (for key metrics)
        for metric in [salary_col, satisfaction_col, worklife_col, age_col]:
            if metric:
                data = _get_churned_vs_retained_avg(df, target_col, metric)
                if data:
                    fmt, vlbl = _infer_hr_metric_context(df, metric)
                    label = _smart_target_label(target_col)
                    pos_lbl, neg_lbl = _get_binary_target_labels(target_col)
                    add_chart(ChartRecommendation(
                        '', f'Avg {_beautify_column_name(metric)}: {pos_lbl} vs {neg_lbl}',
                        'bar', data, 'HIGH',
                        f'{_beautify_column_name(metric)} comparison between attrited and retained',
                        format_type=fmt, value_label=vlbl,
                        dimension=target_col, metric=metric, aggregation='mean'
                    ))

    # ── TIER 2: COMPENSATION ANALYSIS ──────────────────────────────────
    sal_fmt, sal_vlbl = _infer_hr_metric_context(df, salary_col)
    if salary_col:
        # 2a. Salary by Department
        if department_col:
            data = _safe_groupby_mean(df, department_col, salary_col)
            add_chart(ChartRecommendation(
                '', f'Avg {_beautify_column_name(salary_col)} by {_beautify_column_name(department_col)}',
                'bar', data, 'HIGH', 'Compensation by department',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=department_col, metric=salary_col, aggregation='mean'
            ))

        # 2b. Salary by Job Role
        if role_col:
            data = _safe_groupby_mean(df, role_col, salary_col)
            add_chart(ChartRecommendation(
                '', f'Avg {_beautify_column_name(salary_col)} by {_beautify_column_name(role_col)}',
                'hbar', data, 'HIGH', 'Compensation by role',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=role_col, metric=salary_col, aggregation='mean'
            ))

        # 2c. Salary by Education
        if education_col:
            data = _safe_groupby_mean(df, education_col, salary_col)
            add_chart(ChartRecommendation(
                '', f'Avg {_beautify_column_name(salary_col)} by {_beautify_column_name(education_col)}',
                'bar', data, 'MEDIUM', 'Compensation by education',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=education_col, metric=salary_col, aggregation='mean'
            ))

        # 2d. Salary by Gender (pay equity)
        if gender_col:
            data = _safe_groupby_mean(df, gender_col, salary_col)
            add_chart(ChartRecommendation(
                '', f'Avg {_beautify_column_name(salary_col)} by {_beautify_column_name(gender_col)}',
                'bar', data, 'HIGH', 'Pay equity analysis by gender',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=gender_col, metric=salary_col, aggregation='mean'
            ))

    # 2e. Salary Trend over time
    if dates and salary_col:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, salary_col, aggregation=_trend_aggregation_for_metric(salary_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(salary_col)} Trend',
                'line', data, 'MEDIUM', 'Compensation trend over time',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=date_col, metric=salary_col, aggregation=_trend_aggregation_for_metric(salary_col)
            ))

    # ── TIER 3: PERFORMANCE & ENGAGEMENT ───────────────────────────────
    if performance_col and primary_dim:
        perf_fmt, perf_vlbl = _infer_hr_metric_context(df, performance_col)
        data = _safe_groupby_mean(df, primary_dim, performance_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(performance_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'HIGH', 'Performance distribution across segments',
            format_type=perf_fmt, value_label=perf_vlbl,
            dimension=primary_dim, metric=performance_col, aggregation='mean'
        ))

    if satisfaction_col and primary_dim:
        sat_fmt, sat_vlbl = _infer_hr_metric_context(df, satisfaction_col)
        data = _safe_groupby_mean(df, primary_dim, satisfaction_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(satisfaction_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'MEDIUM', 'Employee satisfaction across segments',
            format_type=sat_fmt, value_label=sat_vlbl,
            dimension=primary_dim, metric=satisfaction_col, aggregation='mean'
        ))

    if worklife_col and primary_dim:
        wl_fmt, wl_vlbl = _infer_hr_metric_context(df, worklife_col)
        data = _safe_groupby_mean(df, primary_dim, worklife_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(worklife_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'MEDIUM', 'Work-life balance across segments',
            format_type=wl_fmt, value_label=wl_vlbl,
            dimension=primary_dim, metric=worklife_col, aggregation='mean'
        ))

    if involvement_col and primary_dim:
        inv_fmt, inv_vlbl = _infer_hr_metric_context(df, involvement_col)
        data = _safe_groupby_mean(df, primary_dim, involvement_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(involvement_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'MEDIUM', 'Employee involvement across segments',
            format_type=inv_fmt, value_label=inv_vlbl,
            dimension=primary_dim, metric=involvement_col, aggregation='mean'
        ))

    # Scatter: Salary vs Performance (correlation)
    if salary_col and performance_col:
        data = _get_scatter_data(df, salary_col, performance_col, label_col=role_col or department_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(salary_col)} vs {_beautify_column_name(performance_col)}',
                'scatter', data, 'MEDIUM', 'Compensation-performance correlation',
                format_type=sal_fmt, value_label=sal_vlbl,
                dimension=salary_col, metric=performance_col, aggregation='mean'
            ))

    # Scatter: Tenure vs Satisfaction (correlation)
    if tenure_col and satisfaction_col:
        data = _get_scatter_data(df, tenure_col, satisfaction_col, label_col=department_col or role_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(tenure_col)} vs {_beautify_column_name(satisfaction_col)}',
                'scatter', data, 'MEDIUM', 'Tenure-satisfaction correlation',
                dimension=tenure_col, metric=satisfaction_col, aggregation='mean'
            ))

    # ── TIER 4: WORKFORCE DEMOGRAPHICS ─────────────────────────────────
    if tenure_col and department_col:
        data = _safe_groupby_mean(df, department_col, tenure_col)
        ten_fmt, ten_vlbl = _infer_hr_metric_context(df, tenure_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(tenure_col)} by {_beautify_column_name(department_col)}',
            'bar', data, 'MEDIUM', 'Tenure distribution across departments',
            format_type=ten_fmt, value_label=ten_vlbl,
            dimension=department_col, metric=tenure_col, aggregation='mean'
        ))

    if age_col and department_col:
        data = _safe_groupby_mean(df, department_col, age_col)
        age_fmt, age_vlbl = _infer_hr_metric_context(df, age_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(age_col)} by {_beautify_column_name(department_col)}',
            'bar', data, 'MEDIUM', 'Age distribution across departments',
            format_type=age_fmt, value_label=age_vlbl,
            dimension=department_col, metric=age_col, aggregation='mean'
        ))

    # Distributions for key demographic dimensions
    for dim, label in [(gender_col, 'Gender'), (marital_col, 'Marital Status'),
                       (education_col, 'Education'), (overtime_col, 'Overtime'),
                       (travel_col, 'Travel'), (location_col, 'Location')]:
        if dim and dim not in used_dims:
            prefer_pie = dim in (gender_col, marital_col, overtime_col) and df[dim].nunique() <= 5
            add_chart(_distribution_chart(
                df, dim,
                f'{_beautify_column_name(dim)} Distribution',
                'MEDIUM',
                f'Workforce {label.lower()} mix',
                'Employees',
                prefer_pie=prefer_pie
            ))
            used_dims.add(dim)

    # Training by Department
    if training_col and department_col:
        data = _safe_groupby_mean(df, department_col, training_col)
        trn_fmt, trn_vlbl = _infer_hr_metric_context(df, training_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(training_col)} by {_beautify_column_name(department_col)}',
            'bar', data, 'MEDIUM', 'Training investment across departments',
            format_type=trn_fmt, value_label=trn_vlbl,
            dimension=department_col, metric=training_col, aggregation='mean'
        ))

    # Distance from Home by Department
    if distance_col and department_col:
        data = _safe_groupby_mean(df, department_col, distance_col)
        dist_fmt, dist_vlbl = _infer_hr_metric_context(df, distance_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(distance_col)} by {_beautify_column_name(department_col)}',
            'bar', data, 'LOW', 'Commute distance across departments',
            format_type=dist_fmt, value_label=dist_vlbl,
            dimension=department_col, metric=distance_col, aggregation='mean'
        ))

    # ── TIER 5: EXHAUSTIVE DIMENSION COVERAGE ──────────────────────────
    MAX_CHARTS = 22
    used_dims.update({department_col, role_col, gender_col, education_col,
                      marital_col, overtime_col, travel_col, location_col})
    used_dims.discard(None)

    avail_dims = [d for d in pd_ if d not in used_dims and d != target_col]
    best_metric = salary_col or performance_col or satisfaction_col or (pm[0] if pm else None)

    for dim in avail_dims:
        if len(charts) >= MAX_CHARTS:
            break
        nunique = df[dim].nunique()
        if nunique < 2 or nunique > 50:
            continue

        # Distribution for this dimension
        add_chart(_distribution_chart(
            df, dim,
            f'{_beautify_column_name(dim)} Distribution', 'LOW',
            f'Workforce distribution by {_beautify_column_name(dim)}',
            'Employees', prefer_pie=nunique <= 5
        ))

        # Metric cross-tab
        if best_metric and len(charts) < MAX_CHARTS:
            agg = 'mean' if _should_average_metric(best_metric) else 'sum'
            data = _safe_groupby_mean(df, dim, best_metric) if agg == 'mean' else _safe_groupby_sum(df, dim, best_metric)
            if data:
                bm_fmt, bm_vlbl = _infer_hr_metric_context(df, best_metric)
                add_chart(ChartRecommendation(
                    '', f'{_beautify_column_name(best_metric)} by {_beautify_column_name(dim)}',
                    'bar' if nunique < 8 else 'hbar', data, 'LOW',
                    f'{_beautify_column_name(best_metric)} breakdown across {_beautify_column_name(dim)}',
                    format_type=bm_fmt, value_label=bm_vlbl,
                    dimension=dim, metric=best_metric, aggregation=agg
                ))

    # Extra metric coverage: pair unused metrics with primary_dim
    if primary_dim:
        used_metrics = {salary_col, tenure_col, performance_col, satisfaction_col,
                        involvement_col, worklife_col, age_col, training_col, distance_col}
        used_metrics.discard(None)
        for metric in pm:
            if len(charts) >= MAX_CHARTS:
                break
            if metric in used_metrics:
                continue
            agg = 'mean' if _should_average_metric(metric) else 'sum'
            data = _safe_groupby_mean(df, primary_dim, metric) if agg == 'mean' else _safe_groupby_sum(df, primary_dim, metric)
            if data:
                m_fmt, m_vlbl = _infer_hr_metric_context(df, metric)
                add_chart(ChartRecommendation(
                    '', f'{_beautify_column_name(metric)} by {_beautify_column_name(primary_dim)}',
                    'bar', data, 'LOW',
                    f'{_beautify_column_name(metric)} across {_beautify_column_name(primary_dim)}',
                    format_type=m_fmt, value_label=m_vlbl,
                    dimension=primary_dim, metric=metric, aggregation=agg
                ))
                used_metrics.add(metric)

    # Assign slot numbers
    for i, chart in enumerate(charts):
        chart.slot = f"slot_{i + 1}"

    return charts


def _generate_education_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate education charts covering enrollment, performance, and outcomes."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    program_col = _pick_column_by_keywords(df, pd_, ['program', 'major', 'course', 'class', 'subject'])
    instructor_col = _pick_column_by_keywords(df, pd_, ['teacher', 'instructor', 'faculty', 'professor'])
    cohort_col = _pick_column_by_keywords(df, pd_, ['cohort', 'year', 'grade level'])

    gpa_col = _pick_column_by_keywords(df, pm, ['gpa', 'grade', 'score', 'marks'])
    attendance_col = _pick_column_by_keywords(df, pm, ['attendance', 'presence', 'absent'])
    enrollment_col = _pick_column_by_keywords(df, pm, ['enrollment', 'credits', 'units'])

    target_col = classification.targets[0] if classification.targets else _pick_column_by_keywords(
        df, list(df.columns), ['graduated', 'passed', 'completed', 'outcome']
    )

    primary_dim = program_col or cohort_col or instructor_col
    if primary_dim:
        add_chart(_distribution_chart(
            df,
            primary_dim,
            f'Enrollment by {_beautify_column_name(primary_dim)}',
            'HIGH',
            'Enrollment distribution',
            'Students'
        ))

    if gpa_col and primary_dim:
        data = _safe_groupby_mean(df, primary_dim, gpa_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(gpa_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'HIGH', 'Academic performance by segment',
            dimension=primary_dim, metric=gpa_col, aggregation='mean'
        ))

    if attendance_col and primary_dim:
        data = _safe_groupby_mean(df, primary_dim, attendance_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(attendance_col)} by {_beautify_column_name(primary_dim)}',
            'bar', data, 'MEDIUM', 'Attendance patterns',
            format_type='percentage' if _metric_format_type(attendance_col) == 'percentage' else None,
            dimension=primary_dim, metric=attendance_col, aggregation='mean'
        ))

    if target_col and primary_dim:
        add_chart(_build_target_rate_chart(
            df,
            target_col,
            primary_dim,
            f'Completion Rate by {_beautify_column_name(primary_dim)}',
            'Outcome rate by segment'
        ))

    if dates and (gpa_col or enrollment_col):
        metric = gpa_col or enrollment_col
        date_col = dates[0]
        data = _get_time_trend(df, date_col, metric, aggregation=_trend_aggregation_for_metric(metric))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(metric)} Trend',
                'line', data, 'MEDIUM', 'Performance trend over time',
                dimension=date_col, metric=metric, aggregation=_trend_aggregation_for_metric(metric)
            ))

    return charts


