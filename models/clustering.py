"""
models/clustering.py — 任务1：GMM健康画像软聚类
「银龄守护」老年人全周期健康智能画像系统
"""
import numpy as np
import pandas as pd
import joblib
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import RobustScaler
from sklearn.impute import SimpleImputer
from sklearn.decomposition import PCA
from sklearn.feature_selection import VarianceThreshold

from config import MODEL_DIR, LABEL_POOL, elapsed


def run_clustering(df: pd.DataFrame):
    """
    GMM软聚类健康画像分层。
    返回：(df_with_labels, X_scaled, X_pca2d)
    """
    print(f"\n任务1: 健康画像GMM软聚类...  {elapsed()}")

    num_cols = [c for c in df.select_dtypes(include=[np.number]).columns
                if c != 'PATIENT_ID']
    X = df[num_cols].copy()

    # 填充缺失值
    imputer = SimpleImputer(strategy='median')
    X_imp = imputer.fit_transform(X)

    # 去低方差特征
    sel = VarianceThreshold(threshold=0.01)
    X_imp = sel.fit_transform(X_imp)

    # 去高相关特征（Pearson > 0.95）
    corr = np.corrcoef(X_imp.T)
    upper = np.triu(np.abs(corr), k=1)
    drop_idx = {
        j for i in range(upper.shape[0])
        for j in range(i + 1, upper.shape[1])
        if upper[i, j] > 0.95
    }
    keep_idx = [i for i in range(X_imp.shape[1]) if i not in drop_idx]
    X_imp = X_imp[:, keep_idx]

    # RobustScaler + 截断异常值
    scaler = RobustScaler()
    X_scaled = np.clip(scaler.fit_transform(X_imp), -5, 5)

    # PCA降维至30维
    n_pca = min(30, X_scaled.shape[1])
    pca_pre = PCA(n_components=n_pca, random_state=42)
    X_pca_pre = pca_pre.fit_transform(X_scaled)
    print(f"  PCA降维至 {n_pca} 维（解释方差: {pca_pre.explained_variance_ratio_.sum():.2%}）")

    # BIC自动选最优k（3~7，每组至少占2%）
    print("  GMM BIC评估（越小越好）:")
    best_k, best_bic = 4, np.inf
    bic_records = {}
    for k in range(3, 8):
        gmm = GaussianMixture(
            n_components=k, covariance_type='full',
            random_state=42, max_iter=200, n_init=5
        )
        gmm.fit(X_pca_pre)
        bic    = gmm.bic(X_pca_pre)
        counts = np.bincount(gmm.predict(X_pca_pre))
        bic_records[k] = bic
        print(f"    k={k}: BIC={bic:.0f}  各类={counts.tolist()}")
        if counts.min() / len(X_pca_pre) < 0.02:
            continue
        if bic < best_bic:
            best_bic, best_k = bic, k

    print(f"  最佳 k={best_k}（BIC={best_bic:.0f}）")
    gmm_best = GaussianMixture(
        n_components=best_k, covariance_type='full',
        random_state=42, max_iter=300, n_init=10
    )
    gmm_best.fit(X_pca_pre)

    # 写入分组标签和软概率
    df = df.copy()
    df['健康画像分组'] = gmm_best.predict(X_pca_pre)
    proba = gmm_best.predict_proba(X_pca_pre)
    for i in range(best_k):
        df[f'画像概率_组{i}'] = proba[:, i]
    df['画像最大概率'] = proba.max(axis=1)

    # 按共病均值从低到高命名（支持任意k）
    stats = df.groupby('健康画像分组').agg(
        共病=('共病数量',    'mean'),
        就诊=('就诊总次数',  'mean'),
        年龄=('年龄',         'mean'),
    ).fillna(0).sort_values('共病')
    label_map = {
        grp: LABEL_POOL[min(i, len(LABEL_POOL) - 1)]
        for i, grp in enumerate(stats.index)
    }
    df['健康画像标签'] = df['健康画像分组'].map(label_map)

    # 2D PCA用于可视化散点图
    pca2d = PCA(n_components=2, random_state=42)
    X_pca2d = pca2d.fit_transform(X_pca_pre)

    print("\n  聚类结果分布:")
    print(df['健康画像标签'].value_counts().to_string())
    print(f"  平均归属概率: {df['画像最大概率'].mean():.3f}")

    joblib.dump(gmm_best, f"{MODEL_DIR}/gmm_k{best_k}.pkl")
    return df, X_scaled, X_pca2d, bic_records
