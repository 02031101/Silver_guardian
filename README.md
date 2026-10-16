# 银龄守护

老年共病患者健康分析与连续随访演示项目。

- 根目录的 Python 文件：原有离线特征工程、健康画像、共病分析、再入院预测及检验时序建模。
- [`frontend/`](frontend/README.md)：新增医护工作台，使用 React、TypeScript、ECharts、本地 JSON 和浏览器存储，不需要数据库或后端。

## 启动前端

```bash
cd frontend
npm ci
npm run dev
```

包含工作台、患者档案、风险复核、随访任务，以及导出与重置功能。全部为明确标注的虚拟患者与模拟结果；界面不运行 Python 模型，也不代表真实临床验证。

详细启动、演示流程、数据格式与测试说明见 [前端使用说明](frontend/README.md)。

![工作台预览](frontend/docs/workbench.png)
