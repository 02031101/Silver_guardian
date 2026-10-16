"""
feature_engineering.py — 特征工程模块
包含：基础特征 / 疾病特征 / 检验时序特征 / 合并宽表
「银龄守护」老年人全周期健康智能画像系统
"""
import pandas as pd
import numpy as np
from config import (
    ALL_KEY_LABS, CHRONIC_DISEASE_KEYWORDS, CHARLSON_WEIGHTS, elapsed
)
from utils import build_ent2pat


# ============================================================
# 基础特征（患者人口学 + 就诊行为）
# ============================================================
def build_patient_features(patient: pd.DataFrame, visit: pd.DataFrame):
    print(f"\n 构建基础特征...  {elapsed()}")

    pat = patient.copy()
    pat.columns = pat.columns.str.strip('"')
    pat['年龄'] = pd.to_numeric(pat['年龄'], errors='coerce')
    pat['SEX'] = pd.to_numeric(pat['SEX'], errors='coerce')
    pat['年龄组_num'] = pd.cut(
        pat['年龄'], bins=[59, 64, 69, 74, 79, 84, 200],
        labels=[1, 2, 3, 4, 5, 6]
    ).astype(float)
    pat['高龄标志'] = (pat['年龄'] >= 80).astype(int)

    vis = visit.copy()
    vis.columns = vis.columns.str.strip('"')
    vis['DT_ACPT']  = pd.to_datetime(vis['DT_ACPT'], errors='coerce')
    vis['就诊季度']  = vis['DT_ACPT'].dt.quarter
    vis['是否急诊']  = (vis['CODE_ENTP'] == '20').astype(int)
    vis['就诊月']    = vis['DT_ACPT'].dt.month

    vis_agg = vis.groupby('PATIENT_ID').agg(
        就诊总次数 = ('ID_ENT',   'count'),
        首次就诊   = ('DT_ACPT',  'min'),
        末次就诊   = ('DT_ACPT',  'max'),
        就诊类型数 = ('CODE_ENTP','nunique'),
        急诊次数   = ('是否急诊', 'sum'),
        就诊季度数 = ('就诊季度', 'nunique'),
    ).reset_index()

    vis_agg['就诊跨度天数'] = (
        vis_agg['末次就诊'] - vis_agg['首次就诊']
    ).dt.days.clip(lower=1)
    vis_agg['月均就诊次数'] = (
        vis_agg['就诊总次数'] / (vis_agg['就诊跨度天数'] / 30 + 1)
    )
    vis_agg['急诊比例'] = (
        vis_agg['急诊次数'] / vis_agg['就诊总次数'].clip(lower=1)
    )

    # 就诊间隔统计
    vis_s = vis.sort_values(['PATIENT_ID', 'DT_ACPT'])
    vis_s['间隔天数'] = vis_s.groupby('PATIENT_ID')['DT_ACPT'].diff().dt.days
    gap = vis_s.groupby('PATIENT_ID')['间隔天数'].agg(
        平均就诊间隔='mean',
        就诊间隔标准差='std',
        最长就诊间隔='max',
    ).reset_index()

    # 冬季就诊占比（老年人冬季易发病）
    winter = (
        vis[vis['就诊月'].isin([12, 1, 2])]
        .groupby('PATIENT_ID').size()
        .reset_index(name='冬季就诊次数')
    )

    feat = (
        pat
        .merge(vis_agg, on='PATIENT_ID', how='left')
        .merge(gap,     on='PATIENT_ID', how='left')
        .merge(winter,  on='PATIENT_ID', how='left')
    )
    feat['冬季就诊占比'] = (
        feat['冬季就诊次数'].fillna(0) / feat['就诊总次数'].clip(lower=1)
    )
    for c in ['就诊总次数', '就诊跨度天数', '月均就诊次数']:
        feat[c] = feat[c].fillna(0)

    print(f" OK 基础特征: {feat.shape[1]} 列")
    return feat, vis


# ============================================================
# 疾病特征（慢病标志 + 住院统计）
# ============================================================
def build_disease_features(
    visit: pd.DataFrame,
    diagnosis: pd.DataFrame,
    inpatient: pd.DataFrame,
) -> pd.DataFrame:
    print(f"\n构建疾病特征...  {elapsed()}")

    ent2pat = build_ent2pat(visit)
    diag = diagnosis.copy(); diag.columns = diag.columns.str.strip('"')
    inp  = inpatient.copy(); inp.columns  = inp.columns.str.strip('"')

    # 门诊慢病标志
    diag['PATIENT_ID'] = diag['ID_ENT'].map(ent2pat)
    diag_grouped = (
        diag.groupby('PATIENT_ID')['NAME_DIDEF_DIS']
        .apply(lambda x: ' '.join(x.dropna().astype(str)))
        .reset_index()
    )
    diag_grouped.columns = ['PATIENT_ID', '所有诊断文本']

    for disease, kws in CHRONIC_DISEASE_KEYWORDS.items():
        diag_grouped[f'慢病_{disease}'] = (
            diag_grouped['所有诊断文本']
            .str.contains('|'.join(kws), na=False)
            .astype(int)
        )

    chronic_cols = [c for c in diag_grouped.columns if c.startswith('慢病_')]
    diag_grouped['共病数量']     = diag_grouped[chronic_cols].sum(axis=1)
    diag_grouped['Charlson指数'] = sum(
        diag_grouped[f'慢病_{d}'] * w for d, w in CHARLSON_WEIGHTS.items()
    )

    diag_count = (
        diag.groupby('PATIENT_ID')['NAME_DIDEF_DIS'].nunique()
        .reset_index(name='诊断种数')
    )

    # 住院特征
    inp['PATIENT_ID']  = inp['ID_ENT'].map(ent2pat)
    inp['B12']         = pd.to_datetime(inp['B12'], errors='coerce')
    inp['B15']         = pd.to_datetime(inp['B15'], errors='coerce')
    inp['住院天数']     = (inp['B15'] - inp['B12']).dt.days.clip(lower=0)
    inp['有手术']       = inp['C14X01C'].notna().astype(int)
    inp['主诊断大类']   = inp['C03C'].str.extract(r'^([A-Z])', expand=False)

    inp_agg = inp.groupby('PATIENT_ID').agg(
        住院次数     = ('ID_ENT',       'count'),
        平均住院天数 = ('住院天数',     'mean'),
        最长住院天数 = ('住院天数',     'max'),
        总住院天数   = ('住院天数',     'sum'),
        手术次数     = ('有手术',       'sum'),
        涉及科室数   = ('B17',          'nunique'),
        主诊断大类数 = ('主诊断大类',   'nunique'),
        首次住院时间 = ('B12',          'min'),
        末次住院时间 = ('B15',          'max'),
    ).reset_index()

    inp_agg['手术率'] = inp_agg['手术次数'] / inp_agg['住院次数'].clip(lower=1)
    inp_agg['住院跨度天数'] = (
        inp_agg['末次住院时间'] - inp_agg['首次住院时间']
    ).dt.days.clip(lower=1)
    inp_agg['年均住院次数'] = (
        inp_agg['住院次数'] / (inp_agg['住院跨度天数'] / 365 + 1)
    )

    # 住院天数趋势（末次-首次，反映病情进展）
    inp_s = inp.sort_values(['PATIENT_ID', 'B12'])
    stay_trend = (
        inp_s.groupby('PATIENT_ID')['住院天数'].last()
        - inp_s.groupby('PATIENT_ID')['住院天数'].first()
    ).reset_index(name='住院天数趋势')
    inp_agg = inp_agg.merge(stay_trend, on='PATIENT_ID', how='left')

    disease_feat = (
        diag_grouped
        .merge(diag_count, on='PATIENT_ID', how='outer')
        .merge(inp_agg,    on='PATIENT_ID', how='outer')
    )
    print(
        f"  OK 疾病特征: {disease_feat.shape[1]} 列, "
        f"{disease_feat['PATIENT_ID'].nunique():,} 名患者"
    )
    return disease_feat


# ============================================================
# 检验时序特征（时间衰减 + 趋势加速度 + 免疫比值）
# ============================================================
def build_lab_features(lab: pd.DataFrame, visit: pd.DataFrame) -> pd.DataFrame:
    print(f"\n 构建检验时序特征...  {elapsed()}")

    ent2pat = build_ent2pat(visit)
    lb = lab.copy()
    lb.columns = ['ID_ENT', '报告时间', '检验项目', '检验结果',
                  '参考范围', '单位', '异常标识']
    lb['PATIENT_ID']   = lb['ID_ENT'].map(ent2pat)
    lb['报告时间']      = pd.to_datetime(lb['报告时间'], errors='coerce')
    lb['检验结果数值']  = pd.to_numeric(lb['检验结果'], errors='coerce')
    lb['是否异常']      = lb['异常标识'].notna().astype(int)

    # 解析参考范围上下界
    ref = lb['参考范围'].str.extract(r'([\d.]+)\s*[-–]\s*([\d.]+)')
    lb['参考下限']  = pd.to_numeric(ref[0], errors='coerce')
    lb['参考上限']  = pd.to_numeric(ref[1], errors='coerce')
    lb['参考中值']  = (lb['参考下限'] + lb['参考上限']) / 2
    lb['参考范围宽'] = (lb['参考上限'] - lb['参考下限']).clip(lower=1e-8)
    lb['偏离度']    = (
        (lb['检验结果数值'] - lb['参考中值'])
        / (lb['参考范围宽'] / 2 + 1e-8)
    )

    lb_key = lb[lb['检验项目'].isin(ALL_KEY_LABS)].copy()
    print(f"  关键指标记录数: {lb_key.shape[0]:,}")

    DECAY = 0.01  # 时间衰减系数

    def _lab_stats(group: pd.DataFrame) -> dict | None:
        grp  = group.sort_values('报告时间')
        vals = grp['检验结果数值'].dropna()
        if len(vals) == 0:
            return None

        now      = grp['报告时间'].max()
        days_ago = (now - grp.loc[vals.index, '报告时间']).dt.days.clip(lower=0)
        w        = np.exp(-DECAY * days_ago.values)

        r = {
            'mean':          vals.mean(),
            'std':           vals.std() if len(vals) > 1 else 0.0,
            'min':           vals.min(),
            'max':           vals.max(),
            'last':          vals.iloc[-1],
            'count':         len(vals),
            'abnormal_rate': group['是否异常'].mean(),
            'dev_mean':      grp.loc[vals.index, '偏离度'].mean(),
            'dev_max':       grp.loc[vals.index, '偏离度'].abs().max(),
            'w_mean':        np.average(vals.values, weights=w),
            'range_ratio':   (vals.max() - vals.min()) / (vals.mean() + 1e-8),
        }

        t = (grp['报告时间'] - grp['报告时间'].min()).dt.days
        t = t[vals.index].values
        if len(vals) >= 3 and t.std() > 0:
            r['slope'] = np.polyfit(t, vals.values, 1)[0]
            r['acceleration'] = (
                np.polyfit(t, vals.values, 2)[0] if len(vals) >= 5 else np.nan
            )
        else:
            r['slope'] = r['acceleration'] = np.nan

        return r

    records = []
    for (pid, item), grp in lb_key.groupby(['PATIENT_ID', '检验项目']):
        s = _lab_stats(grp)
        if s:
            row = {'PATIENT_ID': pid}
            row.update({f'{item}_{k}': v for k, v in s.items()})
            records.append(row)

    lab_wide = pd.DataFrame(records).groupby('PATIENT_ID').first().reset_index()

    # 衍生免疫炎症比值
    def _lm(item: str) -> pd.Series:
        return (
            lb_key[lb_key['检验项目'] == item]
            .groupby('PATIENT_ID')['检验结果数值'].mean()
            .rename(item)
        )

    base = pd.concat([
        _lm('中性粒细胞绝对值'), _lm('淋巴细胞绝对值'),
        _lm('血小板'), _lm('单核细胞绝对值'),
        _lm('天门冬氨酸氨基转移酶'), _lm('丙氨酸氨基转移酶'),
    ], axis=1).reset_index()
    base.columns = ['PATIENT_ID', 'NEU', 'LYM', 'PLT', 'MON', 'AST', 'ALT']

    base['NLR_中性淋巴比']    = base['NEU'] / (base['LYM'] + 1e-8)
    base['PLR_血小板淋巴比']  = base['PLT'] / (base['LYM'] + 1e-8)
    base['LMR_淋巴单核比']    = base['LYM'] / (base['MON'] + 1e-8)
    base['DeRitis_AST_ALT比'] = base['AST'] / (base['ALT'] + 1e-8)
    base['SII_免疫炎症指数']  = base['PLT'] * base['NEU'] / (base['LYM'] + 1e-8)

    ratio_df = base[['PATIENT_ID', 'NLR_中性淋巴比', 'PLR_血小板淋巴比',
                      'LMR_淋巴单核比', 'DeRitis_AST_ALT比', 'SII_免疫炎症指数']]
    lab_wide = lab_wide.merge(ratio_df, on='PATIENT_ID', how='left')

    print(
        f" OK 检验特征: {lab_wide.shape[1]} 列, "
        f"{lab_wide['PATIENT_ID'].nunique():,} 名患者  {elapsed()}"
    )
    return lab_wide


# ============================================================
# 合并宽表
# ============================================================
def merge_all_features(
    patient_feat: pd.DataFrame,
    disease_feat: pd.DataFrame,
    lab_feat: pd.DataFrame,
) -> pd.DataFrame:
    print(f"\n🔧 合并所有特征...  {elapsed()}")
    df = (
        patient_feat
        .merge(disease_feat, on='PATIENT_ID', how='left')
        .merge(lab_feat,     on='PATIENT_ID', how='left')
    )
    drop_cols = ['所有诊断文本', '首次就诊', '末次就诊',
                 '首次住院时间', '末次住院时间']
    df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)
    print(f"  最终宽表: {df.shape[0]:,} 行 × {df.shape[1]} 列")
    return df
