"""
data_loader.py — 数据读取模块
「银龄守护」老年人全周期健康智能画像系统
"""
import pandas as pd
from config import DATA_DIR, elapsed
from utils import read_csv_robust


def load_data():
    """
    读取全部原始CSV数据，返回：
    patient, visit, diagnosis, inpatient, exam, lab
    """
    print("读取数据...")

    def _read(filename: str) -> pd.DataFrame:
        path = f"{DATA_DIR}/{filename}"
        df = read_csv_robust(path)
        print(f"  OK: {filename}: {df.shape[0]:,} 行, {df.shape[1]} 列")
        return df

    patient   = _read("患者信息表.csv")
    visit     = _read("患者就诊表.csv")
    diagnosis = _read("患者门诊诊断表.csv")
    inpatient = _read("病案首页表.csv")
    exam      = _read("检查信息.csv")

    lab_files = [
        "检验数据-2021年-1.csv", "检验数据-2021年-2.csv",
        "检验数据-2021年-3.csv", "检验数据-2021年-4.csv",
        "检验数据-2021年-5.csv", "检验数据-2021年-6.csv",
        "检验数据-2022.csv",
    ]
    lab = pd.concat([_read(f) for f in lab_files], ignore_index=True)
    print(f" 检验数据合并完成: {lab.shape[0]:,} 行  {elapsed()}")

    return patient, visit, diagnosis, inpatient, exam, lab
