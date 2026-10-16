"""
models/comorbidity.py — 任务2：慢病共病风险预测
LightGBM多标签分类 + 5折CV + SHAP + 概率校准
「银龄守护」老年人全周期健康智能画像系统
"""
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
from sklearn.impute import SimpleImputer
from sklearn.calibration import CalibratedClassifierCV

from config import MODEL_DIR, OUTPUT_DIR, elapsed


def run_comorbidity_prediction(df: pd.DataFrame):
    """
    共病风险多标签预测（严格剔除泄露特征）。
    返回：(all_models, feat_cols, imputer, all_results)
    同时将各慢病风险评分写入 df['风险_*'] 列。
    """
    print(f"\n 任务2: 共病风险预测...  {elapsed()}")

    try:
        import lightgbm as lgb
        USE_LGB = True
        print("  使用 LightGBM")
    except ImportError:
        USE_LGB = False
        print("  LightGBM未安装，使用 XGBoost")

    chronic_cols = [c for c in df.columns if c.startswith('慢病_')]

    # ===== 严格剔除泄露特征 =====
    LEAK = (
        ['共病数量', '诊断种数', 'Charlson指数',
         '健康画像分组', '健康画像标签', '所有诊断文本']
        + [f'画像概率_组{i}' for i in range(10)]
        + ['画像最大概率']
        + chronic_cols
    )
    feat_cols = [
        c for c in df.select_dtypes(include=[np.number]).columns
        if c not in ['PATIENT_ID'] + LEAK
    ]
    print(f"  特征数（剔除泄露后）: {len(feat_cols)}")

    X = df[feat_cols].values
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)

    lgb_params = dict(
        objective='binary', metric='auc', n_estimators=600,
        learning_rate=0.02, num_leaves=63, min_child_samples=50,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
        reg_alpha=0.1, reg_lambda=0.5, class_weight='balanced',
        n_jobs=-1, random_state=42, verbose=-1,
    )

    def _make_model():
        if USE_LGB:
            import lightgbm as lgb
            return lgb.LGBMClassifier(**lgb_params)
        else:
            import xgboost as xgb
            return xgb.XGBClassifier(
                n_estimators=400, learning_rate=0.03, max_depth=6,
                subsample=0.8, colsample_bytree=0.8,
                random_state=42, n_jobs=-1, verbosity=0
            )

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    valid_labels = [c for c in chronic_cols if df[c].fillna(0).sum() >= 100]
    all_results, all_models = {}, {}

    print(f"\n  {'慢病':<12} {'AUC':>8} {'±std':>8} {'正样本':>8}")
    print("  " + "-" * 38)

    for col in valid_labels:
        y = df[col].fillna(0).astype(int).values
        aucs = []
        for tr, va in skf.split(X, y):
            m = _make_model()
            if USE_LGB:
                import lightgbm as lgb
                m.fit(
                    X[tr], y[tr], eval_set=[(X[va], y[va])],
                    callbacks=[
                        lgb.early_stopping(60, verbose=False),
                        lgb.log_evaluation(period=-1),
                    ]
                )
            else:
                m.fit(X[tr], y[tr])
            aucs.append(roc_auc_score(y[va], m.predict_proba(X[va])[:, 1]))

        mu, sd = np.mean(aucs), np.std(aucs)
        all_results[col] = (mu, sd)
        name = col.replace('慢病_', '')
        print(f"  {name:<12} {mu:>8.3f} {f'±{sd:.3f}':>8} {int(y.sum()):>8}")

    # 全量训练 + 概率校准（Platt Scaling）
    print("\n  全量训练 + 概率校准...")
    for col in valid_labels:
        y = df[col].fillna(0).astype(int).values
        m = _make_model()
        m.fit(X, y)
        cal = CalibratedClassifierCV(m, method='sigmoid', cv=3)
        cal.fit(X, y)
        all_models[col] = cal
        name = col.replace('慢病_', '')
        df[f'风险_{name}'] = cal.predict_proba(X)[:, 1]
        joblib.dump(cal, f"{MODEL_DIR}/cal_{name}.pkl")

    # SHAP 可解释性（以恶性肿瘤为例）
    print("\n  SHAP特征重要性分析...")
    shap_results = {}
    try:
        import shap
        target_col = (
            '慢病_恶性肿瘤' if '慢病_恶性肿瘤' in valid_labels
            else valid_labels[-1]
        )
        y_t = df[target_col].fillna(0).astype(int).values
        raw = _make_model()
        raw.fit(X, y_t)
        s_idx = np.random.choice(len(X), min(500, len(X)), replace=False)
        explainer = shap.TreeExplainer(raw)
        sv = explainer.shap_values(X[s_idx])
        sv_arr = sv[1] if isinstance(sv, list) else sv
        mean_shap = np.abs(sv_arr).mean(axis=0)
        top15 = pd.Series(mean_shap, index=feat_cols).nlargest(15)
        shap_results = dict(top15)
        name = target_col.replace('慢病_', '')
        print(f"\n  Top 15 重要特征（{name}，SHAP）:")
        for fn, val in top15.items():
            bar = '█' * int(val / top15.max() * 20)
            print(f"    {fn:35s} {bar}  {val:.4f}")
        top15.to_csv(f"{OUTPUT_DIR}/SHAP_{name}.csv", encoding='utf-8-sig')
    except Exception as e:
        print(f"  SHAP跳过（{e}），输出 Feature Importance...")
        fi = pd.Series(raw.feature_importances_, index=feat_cols).nlargest(15)
        shap_results = dict(fi)
        for fn, val in fi.items():
            print(f"    {fn:35s} {'█'*int(val/fi.max()*20)}  {val:.4f}")

    joblib.dump(imputer, f"{MODEL_DIR}/task2_imputer.pkl")
    return all_models, feat_cols, imputer, all_results, shap_results
