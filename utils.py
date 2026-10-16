"""
utils.py — 公共工具函数
「银龄守护」老年人全周期健康智能画像系统
"""
import pandas as pd


def build_ent2pat(visit: pd.DataFrame) -> dict:
    """建立 ID_ENT → PATIENT_ID 映射字典"""
    vis = visit.copy()
    vis.columns = vis.columns.str.strip('"')
    return vis.set_index('ID_ENT')['PATIENT_ID'].to_dict()


def read_csv_robust(path: str) -> pd.DataFrame:
    """
    容错读取CSV：自动尝试多种编码和解析引擎组合。
    对含多行文本字段（如检查信息）的文件也能正常处理。
    """
    import pandas as pd
    for enc in ['gbk', 'utf-8', 'gb18030']:
        for engine in ['c', 'python']:
            try:
                df = pd.read_csv(
                    path, encoding=enc, engine=engine,
                    quotechar='"', on_bad_lines='skip'
                )
                return df
            except Exception:
                continue
    raise RuntimeError(f"无法读取文件（已尝试所有编码/引擎组合）: {path}")
