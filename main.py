"""
main.py — 主流程入口
「银龄守护」老年人全周期健康智能画像系统

项目结构：
  silver_guardian/
  ├── config.py               全局配置（路径、常量、标签）
  ├── utils.py                公共工具（读CSV、ent2pat映射）
  ├── data_loader.py          数据读取
  ├── feature_engineering.py  特征工程（基础/疾病/检验/合并）
  ├── visualization.py        所有可视化图表
  ├── models/
  │   ├── __init__.py
  │   ├── clustering.py       任务1 GMM健康画像软聚类
  │   ├── comorbidity.py      任务2 LightGBM共病预测
  │   ├── readmission.py      任务3 XGBoost再入院预警
  │   └── lstm_model.py       任务4 多变量LSTM时序预测
  └── main.py                 ← 本文件

运行方式：
  cd /Yty/LPR/ComputerDesign
  python3 silver_guardian/main.py
"""

import warnings
warnings.filterwarnings('ignore')

import sys, os
# 将当前目录加入路径，确保模块可被导入
sys.path.insert(0, os.path.dirname(__file__))

from config import elapsed, OUTPUT_DIR, FIG_DIR
import pandas as pd
import numpy as np

# ── 各功能模块 ────────────────────────────────────────────────
from data_loader       import load_data
from feature_engineering import (
    build_patient_features,
    build_disease_features,
    build_lab_features,
    merge_all_features,
)
from models.clustering  import run_clustering
from models.comorbidity import run_comorbidity_prediction
from models.readmission import run_readmission_risk
from models.lstm_model  import run_lstm
import visualization as viz


# ============================================================
# 保存汇总结果
# ============================================================
def save_results(df: pd.DataFrame) -> None:
    print(f"\n💾 保存结果...  {elapsed()}")
    out = f"{OUTPUT_DIR}/患者健康画像宽表.csv"
    df.to_csv(out, index=False, encoding='utf-8-sig')
    print(f"  ✅ 患者健康画像宽表.csv  ({df.shape[0]:,} 行 × {df.shape[1]} 列)")

    if '健康画像标签' not in df.columns:
        return

    chronic_cols = [c for c in df.columns if c.startswith('慢病_')]
    risk_cols    = [c for c in df.columns if c.startswith('风险_')]

    agg_dict = {
        '人数':         ('PATIENT_ID',  'count'),
        '平均年龄':     ('年龄',         'mean'),
        '平均就诊次数': ('就诊总次数',   'mean'),
        '平均共病数':   ('共病数量',     'mean'),
        'Charlson指数': ('Charlson指数', 'mean'),
        '平均归属概率': ('画像最大概率', 'mean'),
    }
    summary = df.groupby('健康画像标签').agg(**agg_dict).round(2)

    for c in chronic_cols:
        name = c.replace('慢病_', '')
        summary[f'{name}率%'] = (
            df.groupby('健康画像标签')[c].mean().fillna(0).mul(100).round(1)
        )
    for c in risk_cols:
        name = c.replace('风险_', '')
        summary[f'{name}风险'] = (
            df.groupby('健康画像标签')[c].mean().fillna(0).round(3)
        )

    print("\n📊 健康画像分组统计:")
    print(summary.to_string())
    summary.to_csv(f"{OUTPUT_DIR}/健康画像分组统计.csv", encoding='utf-8-sig')

    print("\n📋 GMM归属概率分布（越高=分组越确定）:")
    print(df.groupby('健康画像标签')['画像最大概率'].describe().round(3).to_string())


# ============================================================
# 主流程
# ============================================================
def main() -> None:
    print("=" * 62)
    print("  「银龄守护」老年人全周期健康智能画像系统  v4")
    print("=" * 62)
    print(f"  图表输出目录: {FIG_DIR}")
    print(f"  结果输出目录: {OUTPUT_DIR}\n")

    # ── ① 技术路线图（无需数据，程序启动即生成）──────────────
    print("🎨 生成技术路线图...")
    viz.plot_pipeline()

    # ── ② 数据读取 ────────────────────────────────────────────
    patient, visit, diagnosis, inpatient, exam, lab = load_data()

    # ── ③ 特征工程 ────────────────────────────────────────────
    patient_feat, vis = build_patient_features(patient, visit)
    disease_feat      = build_disease_features(visit, diagnosis, inpatient)
    lab_feat          = build_lab_features(lab, visit)
    df_wide           = merge_all_features(patient_feat, disease_feat, lab_feat)

    # 特征工程完成 → 数据概览仪表盘
    print("\n🎨 生成数据概览图...")
    viz.plot_data_overview(df_wide)

    # ── ④ 任务1：GMM健康画像软聚类 ──────────────────────────
    df_wide, X_scaled, X_pca2d, bic_records = run_clustering(df_wide)
    print("\n🎨 生成健康画像分析图...")
    viz.plot_health_profile(df_wide, X_pca2d, bic_records)

    # ── ⑤ 任务2：共病风险预测 ────────────────────────────────
    all_models, feat_cols2, imputer2, auc_results, shap_results = \
        run_comorbidity_prediction(df_wide)
    print("\n🎨 生成共病预测结果图...")
    viz.plot_comorbidity(auc_results, shap_results)

    # ── ⑥ 任务3：再入院风险预测 ──────────────────────────────
    model3, feat_cols3, imputer3, roc_data, shap3 = \
        run_readmission_risk(df_wide, inpatient, visit)
    print("\n🎨 生成再入院预测分析图...")
    viz.plot_readmission(roc_data, shap3)

    # ── ⑦ 任务4：LSTM时序预测与异常预警 ─────────────────────
    model4, item_stats, preds_real, trues_real = run_lstm(lab, visit)
    print("\n🎨 生成LSTM时序预测图...")
    viz.plot_lstm(preds_real, trues_real, item_stats)

    # ── ⑧ 综合性能评估图 ─────────────────────────────────────
    print("\n🎨 生成综合性能评估图...")
    viz.plot_summary(auc_results)

    # ── ⑨ 保存汇总结果 ───────────────────────────────────────
    save_results(df_wide)

    print(f"\n{'='*62}")
    print(f"  ✅ 全部完成！总耗时: {elapsed()}")
    print(f"  📊 图表: {FIG_DIR}  （共7张）")
    print(f"  📁 结果: {OUTPUT_DIR}")
    print(f"{'='*62}")


if __name__ == "__main__":
    main()
