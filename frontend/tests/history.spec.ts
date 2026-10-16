import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Artificial fixtures only. Uploaded medical records must never be checked in.
const wide = `PATIENT_ID,年龄,SEX,慢病_高血压,慢病_糖尿病,健康画像标签,画像最大概率,就诊总次数,住院次数,血红蛋白_last,血红蛋白_mean,血红蛋白_min,血红蛋白_max,血红蛋白_count,风险_高血压
fixture-A,76,2,1,1,测试分组,0.98,8,2,104,112,98,125,6,0.72
fixture-B,81,1,1,0,另一测试分组,0.92,4,1,121,120,115,130,5,0.6
fixture-C,65,2,0,0,测试分组,0.9,1,1,,,,,,
`
const risk = `PATIENT_ID,入院时间,再入院风险评分,再入院30天实际,风险等级
fixture-A,2021-01-01,0.7,1,高风险
fixture-A,2021-01-01,0.7,1,高风险
fixture-A,2021-01-01,0.4,0,中风险
fixture-B,2021-02-01,0.2,0,低风险
fixture-X,2021-03-01,0.3,0,中风险
`
const file = (name: string, text: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
})
async function upload(page: Page, wideText = wide, riskText = risk, replace = false) {
  if (replace) await page.getByRole('button', { name: '更换数据', exact: true }).click()
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('fixture-wide.csv', wideText))
  await page
    .getByLabel('再入院风险评分表', { exact: true })
    .setInputFiles(file('fixture-risk.csv', riskText))
  await page.getByRole('button', { name: '打开工作台', exact: true }).click()
}
async function importFixture(page: Page) {
  await page.goto('/')
  await upload(page)
  await expect(page.getByRole('heading', { name: '健康管理概览' })).toBeVisible()
}

test('本地导入正确区分样本、患者、原始行及同日差异，不发送上传请求', async ({ page }) => {
  const uploads: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' || request.method() === 'PUT') uploads.push(request.url())
  })
  await importFixture(page)
  await expect(page.locator('.metric-value')).toHaveText(['3', '2', '4', '1'])
  await expect(page.locator('.history-quality')).toContainText('评分文件记录数5')
  await expect(page.locator('.history-quality')).toContainText('评分文件患者数3')
  await expect(page.locator('.history-quality')).toContainText('完全重复的额外行1')
  expect(uploads).toEqual([])
})

test('同日冲突不任意选分，重复保留次数，缺少明细时不造检验曲线', async ({ page }) => {
  await importFixture(page)
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await expect(page.locator('.history-latest-score strong')).toHaveText('待核对')
  await expect(page.locator('.history-score-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.history-score-table tbody tr').first()).toContainText('2')
  await expect(page.locator('.history-lab-summary tbody tr').first()).toContainText('104')
  await expect(page.locator('.lab-chart')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '暂无随访记录' })).toBeVisible()
  await expect(page.getByText('姓名、科室与出院日期未提供')).toBeVisible()
  await expect(page.locator('.history-source-id')).not.toContainText('林女士')
  await page.getByText('查看原始关联编号', { exact: true }).click()
  await expect(page.locator('.history-source-id code')).toHaveText('fixture-A')
})

test('未关联患者和缺失数值保持未提供，单条评分保留原值', async ({ page }) => {
  await importFixture(page)
  await page.getByRole('button', { name: '查看患者 H0002', exact: true }).click()
  await expect(page.locator('.history-latest-score strong')).toHaveText('0.2')
  await page.getByRole('button', { name: '返回历史患者目录', exact: true }).click()
  await page.getByRole('button', { name: '查看患者 H0003', exact: true }).click()
  await expect(page.locator('.history-latest-score strong')).toHaveText('未提供')
  await expect(page.getByRole('heading', { name: '没有关联评分' })).toBeVisible()
  await expect(page.locator('.history-lab-summary tbody tr').first()).toContainText('未提供')
})

test('核对与任务按文件隔离保存，相同文件重导入恢复，原始文件不写入存储', async ({ page }) => {
  await importFixture(page)
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await page.getByRole('button', { name: '记录评分核对', exact: true }).click()
  await page
    .getByRole('textbox', { name: '核对意见', exact: true })
    .fill('同日有两条差异记录，需要核实就诊事件编号。')
  await page.getByRole('button', { name: '保存核对意见' }).click()
  await page.getByRole('button', { name: '新建随访任务' }).click()
  await page.getByRole('textbox', { name: '任务名称', exact: true }).fill('核实记录流程测试')
  await page.getByRole('button', { name: '创建随访任务' }).click()
  await page
    .getByRole('navigation', { name: '历史数据导航' })
    .getByRole('button', { name: '随访任务' })
    .click()
  await page.getByRole('button', { name: '填写随访记录' }).click()
  await page.getByRole('combobox', { name: '联系结果' }).selectOption('未接通')
  await expect(page.getByRole('checkbox')).toBeDisabled()
  await page.getByRole('textbox', { name: '处理记录' }).fill('本地试用：暂未联系成功。')
  await page.getByRole('button', { name: '保存随访记录' }).click()
  await expect(page.locator('.task-status')).toHaveText('进行中')
  const state = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.startsWith('silver-guardian.history.')),
  )
  expect(state).toHaveLength(1)
  expect(state[0][1]).not.toContain('fixture-A')
  expect(state[0][1]).not.toContain('fixture-X')
  expect(state[0][1]).not.toContain('血红蛋白')
  await page.reload()
  await expect(page.getByRole('heading', { name: /导入健康数据/ })).toBeVisible()
  await upload(page)
  await expect(page.getByRole('heading', { name: '健康管理概览' })).toBeVisible()
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await expect(page.locator('.history-shell')).toContainText(
    '同日有两条差异记录，需要核实就诊事件编号。',
  )
  await expect(page.locator('.history-shell')).toContainText('本地试用：暂未联系成功。')
  await upload(page, wide, risk.replace('0.3,0,中风险', '0.31,0,中风险'), true)
  await expect(page.getByRole('heading', { name: '健康管理概览' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '历史数据导航' })
    .getByRole('button', { name: '随访任务' })
    .click()
  await expect(page.getByRole('heading', { name: '暂无随访任务' })).toBeVisible()
})

test('缺字段、重复患者或非法评分阻止导入且不覆盖当前页面', async ({ page }) => {
  await page.goto('/')
  await upload(page, 'PATIENT_ID,年龄\nfixture-A,76\n')
  await expect(page.locator('.import-card').getByRole('alert')).toContainText('缺少字段：SEX')
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('duplicate.csv', 'PATIENT_ID,年龄,SEX\nfixture-A,76,2\nfixture-A,76,2\n'))
  await page.getByRole('button', { name: '打开工作台' }).click()
  await expect(page.locator('.import-card').getByRole('alert')).toContainText('重复患者编号')
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('fixture-wide.csv', wide))
  await page
    .getByLabel('再入院风险评分表', { exact: true })
    .setInputFiles(file('bad-risk.csv', risk.replace('0.7,1,高风险', '1.7,1,高风险')))
  await page.getByRole('button', { name: '打开工作台' }).click()
  await expect(page.locator('.import-card').getByRole('alert')).toContainText('未丢弃或替换该记录')
  await expect(page.getByRole('heading', { name: /导入健康数据/ })).toBeVisible()
  await expect(page.locator('.history-shell')).toHaveCount(0)
})

test('历史模式手机导航、分页与数据隔离重置可用', async ({ page }) => {
  await importFixture(page)
  await page.evaluate(() => localStorage.setItem('unrelated-app', 'keep'))
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: '打开导航' }).click()
  await page
    .getByRole('navigation', { name: '历史数据导航' })
    .getByRole('button', { name: '患者档案' })
    .click()
  await page.getByRole('textbox', { name: '搜索历史患者' }).fill('H0002')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: '查看患者 H0002' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '数据说明', exact: true }).click()
  await page.getByRole('button', { name: '清除本地记录', exact: true }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('unrelated-app'))).toBe('keep')
})

test('首次打开只有真实文件入口，不加载内置患者或模拟资源', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /导入健康数据/ })).toBeVisible()
  await expect(page.locator('.metric-card')).toHaveCount(0)
  await expect(page.locator('.patient-table')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('DEMO')
  await expect(page.locator('body')).not.toContainText('模拟')
  await expect(page.locator('body')).not.toContainText('陈医生')
  expect(requests.some((url) => url.includes('/demo/') || url.includes('dataset.json'))).toBe(false)
})

test('所有页面正文、表格和操作字号清晰，保留单一数据工作流', async ({ page }) => {
  await importFixture(page)
  async function checkType() {
    const smallText = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element)
          const bounds = element.getBoundingClientRect()
          const text = [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )
          return (
            text &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            !['SCRIPT', 'STYLE', 'OPTION'].includes(element.tagName) &&
            parseFloat(style.fontSize) < 14
          )
        })
        .map(
          (element) =>
            `${element.tagName}.${element.className}: ${getComputedStyle(element).fontSize}`,
        ),
    )
    expect(smallText).toEqual([])
    await expect(page.locator('body')).not.toContainText('模拟数据')
    await expect(page.locator('.history-source-banner')).toHaveCount(0)
  }
  await checkType()
  for (const label of ['患者档案', '评分核对', '随访任务']) {
    await page
      .getByRole('navigation', { name: '历史数据导航' })
      .getByRole('button', { name: label, exact: true })
      .click()
    await checkType()
  }
  await page.getByRole('button', { name: '新建随访任务', exact: true }).click()
  await checkType()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('记录保存失败在表单内提示，不改变核对状态', async ({ page }) => {
  await importFixture(page)
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await page.getByRole('button', { name: '记录评分核对', exact: true }).click()
  await page
    .getByRole('textbox', { name: '核对意见', exact: true })
    .fill('本次记录应因浏览器存储失败而保持未保存。')
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
  await page.getByRole('button', { name: '保存核对意见' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('保存失败')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('导出只包含操作记录，更换文件取消时保留已有档案', async ({ page }) => {
  await importFixture(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出记录', exact: true }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const result = JSON.parse(Buffer.concat(chunks).toString())
  expect(result.tasks).toEqual([])
  expect(result.notes).toEqual({})
  expect(JSON.stringify(result)).not.toContain('fixture-A')
  await page.getByRole('button', { name: '更换数据', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.metric-value')).toHaveText(['3', '2', '4', '1'])
})

test('评分参照使用全文件原始行，分位数插值、重复同分及端点计算正确', async () => {
  const { buildScoreReference, scorePercentile, quantileSorted } =
    await import('../src/history/reference')
  const rows = [
    { score: 0.1, level: '低风险' },
    { score: 0.1, level: '低风险' },
    { score: 0.4, level: '中风险' },
    { score: 0.7, level: '高风险' },
    { score: 1, level: '高风险' },
  ]
  const reference = buildScoreReference(rows)
  expect(reference.q33).toBeCloseTo(0.196)
  expect(reference.q66).toBeCloseTo(0.592)
  expect(reference.median).toBe(0.4)
  expect(reference.histogram.reduce((sum, n) => sum + n, 0)).toBe(5)
  expect(reference.histogram[19]).toBe(1)
  expect(reference.levels.map((level) => level.count)).toEqual([2, 1, 2])
  expect(reference.labelMismatchCount).toBe(0)
  expect(scorePercentile(0.1, reference)).toBe(0)
  expect(scorePercentile(0.4, reference)).toBe(40)
  expect(scorePercentile(0.7, reference)).toBe(60)
  expect(scorePercentile(1, reference)).toBe(80)
  expect(quantileSorted([], 0.5)).toBeNull()
  const ties = buildScoreReference(
    ['低风险', '中风险', '高风险'].map((level) => ({ score: 0.5, level })),
  )
  expect(ties.labelMismatchCount).toBe(0)
  expect(ties.levels.map((level) => level.count)).toEqual([1, 1, 1])
})

test('分布图包含未关联与重复行，患者评分展示分位参照、同病中位数及范围图', async ({ page }) => {
  await importFixture(page)
  await expect(page.locator('.chart-kicker strong')).toHaveText('5 条')
  await expect(page.locator('.reference-bands')).toContainText(/0\.332.*0\.592/)
  await page.getByRole('button', { name: '评分 0.7 至 0.75，不含上界：2 条', exact: true }).click()
  await expect(page.locator('.chart-selection')).toContainText('2 条，占 40.0%')
  await expect(page.locator('.reference-warning')).toContainText('1 行原等级')
  await page.getByRole('button', { name: '查看患者 H0002', exact: true }).click()
  await expect(page.locator('.percentile-explanation')).toContainText('0.0%')
  await expect(page.locator('.individual-reference')).toContainText('不能把 0.2 直接当作20.0%')
  await expect(page.locator('.disease-row').first()).toContainText('中位数 0.66 · 有效样本 2 人')
  await expect(page.locator('.lab-range-row').first()).toContainText('最小 115最大 130')
  await expect(page.locator('.lab-range-track')).toHaveCount(1)
  await expect(page.locator('.profile-reference-note')).toContainText('不是风险概率')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const tiny = await page
    .locator('.history-shell *')
    .evaluateAll((elements) =>
      elements
        .filter(
          (e) =>
            [...e.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            ) &&
            e.getClientRects().length > 0 &&
            parseFloat(getComputedStyle(e).fontSize) < 14,
        )
        .map((e) => `${e.tagName}: ${getComputedStyle(e).fontSize}`),
    )
  expect(tiny).toEqual([])
})

test('历史评分图按真实日期绘点，同日差异断线，点击与键盘均可查看记录', async ({ page }) => {
  const datedRisk = `PATIENT_ID,入院时间,再入院风险评分,再入院30天实际,风险等级
fixture-A,2021-01-01,0.1,0,低风险
fixture-A,2021-01-01,0.1,0,低风险
fixture-A,2021-02-01,0.4,0,中风险
fixture-A,2021-03-01,0.7,1,高风险
fixture-A,2021-03-01,0.8,1,高风险
fixture-A,2021-04-01,1,1,高风险
fixture-B,2021-01-01,0.2,0,低风险
fixture-X,2021-01-01,0.3,0,低风险
`
  await page.goto('/')
  await upload(page, wide, datedRisk)
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await expect(page.locator('.timeline-point')).toHaveCount(5)
  await expect(page.locator('.timeline-connection')).toHaveCount(1)
  await expect(page.locator('.timeline-selected')).toContainText('2021-04-01')
  await page
    .getByRole('button', { name: '2021-03-01，评分 0.7，高风险，原表出现 1 次', exact: true })
    .click()
  await expect(page.locator('.timeline-selected')).toContainText('评分 0.7 · 高风险')
  const first = page.getByRole('button', {
    name: '2021-01-01，评分 0.1，低风险，原表出现 2 次',
    exact: true,
  })
  await first.focus()
  await first.press('Enter')
  await expect(page.locator('.timeline-selected')).toContainText('原表出现 2 次')
  await expect(page.locator('.percentile-explanation')).toContainText('87.5%')
  await expect(page.locator('.timeline-x')).toContainText('2021-01-01入院日期2021-04-01')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('检验单一值绘在中央，缺失范围不生成替代值', async ({ page }) => {
  await page.goto('/')
  await upload(page, wide.replace('104,112,98,125,6', '125,125,125,125,1'))
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await expect(page.locator('.lab-range-track.single-value')).toHaveCount(1)
  await expect(page.locator('.lab-range-track.single-value .last-symbol')).toHaveAttribute(
    'style',
    'left: 50%;',
  )
  await expect(page.locator('.lab-range-row').nth(1)).toContainText('范围缺失或不一致')
  await expect(page.locator('.individual-reference .percentile-explanation')).toHaveCount(0)
  await expect(page.locator('.score-scale-marker')).toHaveCount(2)
})
