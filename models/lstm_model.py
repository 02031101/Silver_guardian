"""
models/lstm_model.py — 任务4：多变量LSTM+多头注意力 检验时序预测与异常预警
「银龄守护」老年人全周期健康智能画像系统
"""
import numpy as np
import pandas as pd
from config import MODEL_DIR, OUTPUT_DIR, LSTM_TARGETS, LAB_REFERENCE, elapsed
from utils import build_ent2pat


# ============================================================
# IQR鲁棒归一化工具
# ============================================================
def _compute_iqr_stats(lb: pd.DataFrame) -> dict:
    """对每个LSTM目标指标计算IQR归一化参数"""
    stats = {}
    for item in LSTM_TARGETS:
        vals = lb[lb['检验项目'] == item]['检验结果数值'].dropna()
        q25, q75 = vals.quantile(0.25), vals.quantile(0.75)
        iqr = q75 - q25
        lo_clip, hi_clip = q25 - 3 * iqr, q75 + 3 * iqr
        vals_clip = vals.clip(lo_clip, hi_clip)
        stats[item] = {
            'q25': q25, 'q75': q75, 'iqr': max(iqr, 1e-8),
            'lo_clip': lo_clip, 'hi_clip': hi_clip,
            'median': vals_clip.median(),
        }
        print(f"  {item}: Q1={q25:.1f}, Q3={q75:.1f}, IQR={iqr:.1f}, "
              f"截断=[{lo_clip:.1f},{hi_clip:.1f}]")
    return stats


def _normalize(item: str, vals: np.ndarray, stats: dict) -> np.ndarray:
    s = stats[item]
    return (np.clip(vals, s['lo_clip'], s['hi_clip']) - s['median']) / s['iqr']


def _denormalize(item: str, vals_norm: np.ndarray, stats: dict) -> np.ndarray:
    s = stats[item]
    return vals_norm * s['iqr'] + s['median']


# ============================================================
# 模型定义
# ============================================================
def _build_model(n_feats: int, hidden: int = 128, layers: int = 2,
                 dropout: float = 0.3):
    import torch.nn as nn

    class _MultiheadAttn(nn.Module):
        def __init__(self, hidden, n_heads=4):
            super().__init__()
            self.attn = nn.MultiheadAttention(hidden, n_heads,
                                               batch_first=True, dropout=0.1)
            self.norm = nn.LayerNorm(hidden)

        def forward(self, h):
            out, _ = self.attn(h, h, h)
            return self.norm(h + out)

    class _MultiVarLSTM(nn.Module):
        def __init__(self):
            super().__init__()
            self.proj = nn.Linear(n_feats, hidden)
            self.lstm = nn.LSTM(hidden, hidden, layers,
                                batch_first=True, dropout=dropout)
            self.attn = _MultiheadAttn(hidden, n_heads=4)
            self.pool = nn.AdaptiveAvgPool1d(1)
            self.bn   = nn.BatchNorm1d(hidden)
            self.fc   = nn.Sequential(
                nn.Dropout(dropout),
                nn.Linear(hidden, 64), nn.GELU(),
                nn.Linear(64, 1),
            )

        def forward(self, x):
            x = self.proj(x)
            h, _ = self.lstm(x)
            h = self.attn(h)
            h = self.pool(h.transpose(1, 2)).squeeze(-1)
            return self.fc(self.bn(h)).squeeze(-1)

    return _MultiVarLSTM()


# ============================================================
# 主函数
# ============================================================
def run_lstm(lab: pd.DataFrame, visit: pd.DataFrame):
    """
    多变量LSTM时序预测 + 异常预警输出。
    返回：(model, item_stats, preds_real, trues_real)
    """
    print(f"\n 任务4: 多变量LSTM+Attention + 异常预警...  {elapsed()}")

    try:
        import torch, torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError:
        print("  ⚠️  PyTorch未安装，跳过")
        return None, None, None, None

    ent2pat = build_ent2pat(visit)
    lb = lab.copy()
    lb.columns = ['ID_ENT', '报告时间', '检验项目', '检验结果',
                  '参考范围', '单位', '异常标识']
    lb['PATIENT_ID']  = lb['ID_ENT'].map(ent2pat)
    lb['报告时间']     = pd.to_datetime(lb['报告时间'], errors='coerce')
    lb['检验结果数值'] = pd.to_numeric(lb['检验结果'], errors='coerce')

    item_stats = _compute_iqr_stats(lb)

    SEQ_LEN = 8
    TARGET  = '血红蛋白'

    # Pivot：每位患者每天的4指标
    lb_pivot = lb[lb['检验项目'].isin(LSTM_TARGETS)].copy()
    lb_pivot['日期'] = lb_pivot['报告时间'].dt.date
    lb_pivot = (
        lb_pivot.groupby(['PATIENT_ID', '日期', '检验项目'])['检验结果数值']
        .mean().reset_index()
    )
    lb_pivot = lb_pivot.pivot_table(
        index=['PATIENT_ID', '日期'], columns='检验项目', values='检验结果数值'
    ).reset_index()
    lb_pivot.columns.name = None

    for item in LSTM_TARGETS:
        if item in lb_pivot.columns:
            lb_pivot[item] = _normalize(item, lb_pivot[item].values, item_stats)

    lb_pivot = lb_pivot.sort_values(['PATIENT_ID', '日期'])
    feat_items  = [c for c in LSTM_TARGETS if c in lb_pivot.columns]
    target_idx  = feat_items.index(TARGET) if TARGET in feat_items else 0

    seqs, targets = [], []
    for pid, grp in lb_pivot.groupby('PATIENT_ID'):
        grp = grp.dropna(subset=[TARGET])
        if len(grp) < SEQ_LEN + 1:
            continue
        grp = grp.copy()
        grp[feat_items] = grp[feat_items].fillna(0)
        vals = grp[feat_items].values
        for i in range(len(vals) - SEQ_LEN):
            seqs.append(vals[i:i + SEQ_LEN])
            targets.append(vals[i + SEQ_LEN, target_idx])

    N_FEATS = len(feat_items)
    print(f"\n  多变量序列: {len(seqs):,}  特征维度: {N_FEATS}")
    if len(seqs) < 200:
        print("  序列不足，跳过")
        return None, item_stats, None, None

    X_seq = np.clip(np.array(seqs,    dtype=np.float32), -5, 5)
    y_seq = np.clip(np.array(targets, dtype=np.float32), -5, 5)

    idx  = np.random.permutation(len(X_seq))
    X_seq, y_seq = X_seq[idx], y_seq[idx]
    n_train = int(len(X_seq) * 0.8)
    n_val   = int(len(X_seq) * 0.9)

    def _make_dl(x, y, bs=256, shuffle=True):
        return DataLoader(
            TensorDataset(torch.FloatTensor(x), torch.FloatTensor(y)),
            batch_size=bs, shuffle=shuffle
        )

    train_dl = _make_dl(X_seq[:n_train],       y_seq[:n_train])
    val_dl   = _make_dl(X_seq[n_train:n_val],  y_seq[n_train:n_val], shuffle=False)
    test_dl  = _make_dl(X_seq[n_val:],         y_seq[n_val:],        shuffle=False)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"  使用设备: {device}")
    model = _build_model(N_FEATS).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=100, eta_min=1e-5
    )
    criterion = nn.HuberLoss(delta=1.0)

    best_val, patience_cnt = float('inf'), 0
    PATIENCE, EPOCHS = 15, 100

    for epoch in range(1, EPOCHS + 1):
        model.train()
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            loss = criterion(model(xb), yb)
            optimizer.zero_grad(); loss.backward(); optimizer.step()
        scheduler.step()

        model.eval()
        with torch.no_grad():
            vl = np.mean([
                criterion(model(xb.to(device)), yb.to(device)).item()
                for xb, yb in val_dl
            ])

        if epoch % 10 == 0:
            print(f"    Epoch {epoch:3d}/{EPOCHS}  "
                  f"val_loss={vl:.4f}  "
                  f"lr={scheduler.get_last_lr()[0]:.6f}")

        if vl < best_val - 1e-5:
            best_val, patience_cnt = vl, 0
            torch.save(model.state_dict(), f"{MODEL_DIR}/lstm_mv_best.pt")
        else:
            patience_cnt += 1
            if patience_cnt >= PATIENCE:
                print(f"  早停触发，epoch={epoch}")
                break

    model.load_state_dict(
        torch.load(f"{MODEL_DIR}/lstm_mv_best.pt", weights_only=True)
    )
    model.eval()
    preds, trues = [], []
    with torch.no_grad():
        for xb, yb in test_dl:
            preds.append(model(xb.to(device)).cpu().numpy())
            trues.append(yb.numpy())
    preds = np.concatenate(preds)
    trues = np.concatenate(trues)

    mae  = np.abs(preds - trues).mean()
    rmse = np.sqrt(((preds - trues) ** 2).mean())
    print(f"\n  测试集 MAE:  {mae:.4f}（IQR归一化）")
    print(f"  测试集 RMSE: {rmse:.4f}（IQR归一化）")

    # 反归一化 + 异常预警
    preds_real = np.clip(_denormalize(TARGET, preds, item_stats), 50, 220)
    trues_real = np.clip(_denormalize(TARGET, trues, item_stats), 50, 220)
    lo_ref, hi_ref = LAB_REFERENCE[TARGET]

    is_alert   = (preds_real < lo_ref) | (preds_real > hi_ref)
    real_alert = (trues_real < lo_ref) | (trues_real > hi_ref)
    mae_real   = np.abs(preds_real - trues_real).mean()

    print(f"\n  预警分析（{TARGET}，参考范围{lo_ref}~{hi_ref} g/L）:")
    print(f"    预测值范围: {preds_real.min():.1f} ~ {preds_real.max():.1f} g/L")
    print(f"    真实值范围: {trues_real.min():.1f} ~ {trues_real.max():.1f} g/L")
    print(f"    真实 MAE:   {mae_real:.2f} g/L")
    print(f"    预测超范围: {is_alert.sum()}/{len(preds_real)} ({is_alert.mean():.1%})")
    print(f"    真实超范围: {real_alert.sum()}/{len(trues_real)} ({real_alert.mean():.1%})")

    alert_df = pd.DataFrame({
        '真实值(g/L)': trues_real.round(1),
        '预测值(g/L)': preds_real.round(1),
        '误差(g/L)':   (preds_real - trues_real).round(1),
        '真实是否异常': real_alert.astype(int),
        '预测是否预警': is_alert.astype(int),
    })
    alert_df.to_csv(f"{OUTPUT_DIR}/LSTM预警结果.csv", index=False, encoding='utf-8-sig')
    print(f"  预警结果已保存: {OUTPUT_DIR}/LSTM预警结果.csv")

    return model, item_stats, preds_real, trues_real
