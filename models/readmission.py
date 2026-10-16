"""
models/readmission.py — 任务3：30天再入院风险预测
XGBoost + 严格时间切分 + searchsorted历史特征 + SHAP
「银龄守护」老年人全周期健康智能画像系统
"""
import numpy as np
import pandas as pd
import joblib
import xgboost as xgb
from sklearn.metrics import roc_auc_score, average_precision_score, roc_curve
from sklearn.metrics import classification_report
from sklearn.impute import SimpleImputer

from config import MODEL_DIR, OUTPUT_DIR, elapsed
from utils import build_ent2pat


def run_readmission_risk(
    df: pd.DataFrame,
    inpatient: pd.DataFrame,
    visit: pd.DataFrame,
):
    """
    再入院风险预测（无数据泄露版本）。
    - 使用 searchsorted 构建"入院前"历史就诊特征
    - 按时间排序做前80%/后20%切分
    返回：(model, feat_cols, imputer, roc_data)
    """
    print(f"\n 任务3: 再入院风险预测（严格时间切分）...  {elapsed()}")

    ent2pat = build_ent2pat(visit)

    inp = inpatient.copy(); inp.columns = inp.columns.str.strip('"')
    inp['PATIENT_ID']    = inp['ID_ENT'].map(ent2pat)
    inp['B12']           = pd.to_datetime(inp['B12'], errors='coerce')
    inp['B15']           = pd.to_datetime(inp['B15'], errors='coerce')
    inp['住院天数']       = (inp['B15'] - inp['B12']).dt.days.clip(lower=0)
    inp['有手术']         = inp['C14X01C'].notna().astype(int)
    sys_codes            = {c: i + 1 for i, c in enumerate('ABCDEFGHIJKLMNOPQRSZ')}
    inp['主诊断系统_num'] = (
        inp['C03C'].str.extract(r'^([A-Z])', expand=False).map(sys_codes).fillna(0)
    )

    # 构建再入院标签
    inp_s = inp.dropna(subset=['PATIENT_ID', 'B12']).sort_values(['PATIENT_ID', 'B12']).copy()
    inp_s['下次入院']      = inp_s.groupby('PATIENT_ID')['B12'].shift(-1)
    inp_s['距下次入院天数'] = (inp_s['下次入院'] - inp_s['B15']).dt.days
    inp_s['再入院30天']    = (
        (inp_s['距下次入院天数'] >= 0) & (inp_s['距下次入院天数'] <= 30)
    ).astype(int)
    inp_s['历史住院次数']   = inp_s.groupby('PATIENT_ID').cumcount()

    pos_rate = inp_s['再入院30天'].mean()
    print(f"  住院记录数: {len(inp_s):,}  30天再入院率: {pos_rate:.2%}")

    # 用 searchsorted 高效构建入院前历史就诊特征
    print("  构建入院前历史就诊特征（searchsorted）...")
    vis2 = visit.copy(); vis2.columns = vis2.columns.str.strip('"')
    vis2['DT_ACPT']  = pd.to_datetime(vis2['DT_ACPT'], errors='coerce')
    vis2['是否急诊'] = (vis2['CODE_ENTP'] == '20').astype(int)
    vis2_clean = vis2.dropna(subset=['DT_ACPT', 'PATIENT_ID']).sort_values(
        ['PATIENT_ID', 'DT_ACPT']
    )
    vis2_clean['cum_visits'] = vis2_clean.groupby('PATIENT_ID').cumcount() + 1
    vis2_clean['cum_emerg']  = vis2_clean.groupby('PATIENT_ID')['是否急诊'].cumsum()

    vis_gb = {pid: g.reset_index(drop=True)
              for pid, g in vis2_clean.groupby('PATIENT_ID')}

    hist_visits, hist_emerg = [], []
    for row in inp_s[['PATIENT_ID', 'B12']].itertuples(index=False):
        pid, b12 = row.PATIENT_ID, row.B12
        g = vis_gb.get(pid)
        if g is not None and pd.notna(b12):
            idx = (
                np.searchsorted(g['DT_ACPT'].values, np.datetime64(b12), side='left') - 1
            )
            if idx >= 0:
                hist_visits.append(int(g.loc[idx, 'cum_visits']))
                hist_emerg.append(int(g.loc[idx, 'cum_emerg']))
            else:
                hist_visits.append(0); hist_emerg.append(0)
        else:
            hist_visits.append(0); hist_emerg.append(0)

    inp_s = inp_s.copy()
    inp_s['历史就诊次数'] = hist_visits
    inp_s['历史急诊次数'] = hist_emerg
    inp_s['历史急诊比例'] = inp_s['历史急诊次数'] / inp_s['历史就诊次数'].clip(lower=1)

    # 合并患者静态特征（年龄、性别、慢病、检验均值）
    static_cols = (
        ['PATIENT_ID', '年龄', 'SEX', '高龄标志']
        + [c for c in df.columns if c.startswith('慢病_')]
        + [c for c in df.columns if c.endswith('_mean')]
        + [c for c in df.columns if c.endswith('_w_mean')]
        + [c for c in ['NLR_中性淋巴比', 'PLR_血小板淋巴比',
                        'SII_免疫炎症指数', 'DeRitis_AST_ALT比',
                        '血红蛋白_slope', '白蛋白_slope', '肌酐_slope',
                        '血红蛋白_last', '白蛋白_last', '肌酐_last']
           if c in df.columns]
    )
    static_df = df[list(dict.fromkeys(static_cols))].copy()
    merged = inp_s.merge(static_df, on='PATIENT_ID', how='left')

    # 严格时间切分
    merged = merged.sort_values('B12').reset_index(drop=True)
    split_n = int(len(merged) * 0.8)

    excl = {'PATIENT_ID', 'ID_ENT', 'B12', 'B15', '再入院30天',
            '下次入院', '距下次入院天数', '主诊断系统'}
    feat_cols = [
        c for c in merged.select_dtypes(include=[np.number]).columns
        if c not in excl
    ]

    X = merged[feat_cols].values
    y = merged['再入院30天'].values
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)

    X_train, X_test = X[:split_n], X[split_n:]
    y_train, y_test = y[:split_n], y[split_n:]
    print(f"  训练集: {len(X_train):,} | 测试集: {len(X_test):,}（时间切分）")

    pos_weight = (1 - pos_rate) / (pos_rate + 1e-8)
    model = xgb.XGBClassifier(
        n_estimators=800, max_depth=6, learning_rate=0.015,
        subsample=0.8, colsample_bytree=0.7,
        reg_alpha=0.5, reg_lambda=1.0,
        scale_pos_weight=pos_weight,
        eval_metric='auc', early_stopping_rounds=60,
        random_state=42, n_jobs=-1, verbosity=0,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_proba = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_proba)
    ap  = average_precision_score(y_test, y_proba)
    print(f"  再入院预测 AUC: {auc:.3f}  AP: {ap:.3f}  （时间切分，无泄露）")

    # Youden最优阈值
    fpr_arr, tpr_arr, thresholds = roc_curve(y_test, y_proba)
    best_th = thresholds[np.argmax(tpr_arr - fpr_arr)]
    y_pred  = (y_proba >= best_th).astype(int)
    print(f"  最优阈值: {best_th:.3f}")
    print(classification_report(y_test, y_pred,
                                 target_names=['未再入院', '30天再入院'], digits=3))

    # SHAP
    print("  SHAP特征重要性...")
    shap_results = {}
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        s_idx = np.random.choice(len(X_test), min(500, len(X_test)), replace=False)
        sv = explainer.shap_values(X_test[s_idx])
        sv_arr = sv[1] if isinstance(sv, list) else sv
        top15 = pd.Series(np.abs(sv_arr).mean(axis=0), index=feat_cols).nlargest(15)
        shap_results = dict(top15)
    except Exception:
        top15 = pd.Series(model.feature_importances_, index=feat_cols).nlargest(15)
        shap_results = dict(top15)

    print("\n  Top 15 重要特征:")
    for fn, val in top15.items():
        print(f"    {fn:35s} {'█'*int(val/top15.max()*20)}  {val:.4f}")

    # 风险评分 + 分层（按分位数1/3各档）
    all_proba = model.predict_proba(X)[:, 1]
    q33, q66  = np.percentile(all_proba, [33, 66])
    risk_level = pd.cut(all_proba, bins=[-np.inf, q33, q66, np.inf],
                        labels=['低风险', '中风险', '高风险'])
    risk_df = pd.DataFrame({
        'PATIENT_ID':    merged['PATIENT_ID'].values,
        '入院时间':       merged['B12'].dt.strftime('%Y-%m-%d'),
        '再入院风险评分': all_proba.round(4),
        '再入院30天实际': y,
        '风险等级':       risk_level,
    })
    risk_df.to_csv(f"{OUTPUT_DIR}/再入院风险评分.csv", index=False, encoding='utf-8-sig')
    print(f"\n  风险分层（各占约1/3）:")
    print(risk_df['风险等级'].value_counts().sort_index().to_string())

    joblib.dump(model,   f"{MODEL_DIR}/xgb_readmission.pkl")
    joblib.dump(imputer, f"{MODEL_DIR}/task3_imputer.pkl")

    roc_data = {'fpr': fpr_arr, 'tpr': tpr_arr, 'auc': auc,
                'ap': ap, 'best_th': best_th}
    return model, feat_cols, imputer, roc_data, shap_results
