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
  await page
    .getByRole('button', { name: replace ? '更换文件' : '导入真实历史数据', exact: true })
    .click()
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('fixture-wide.csv', wideText))
  await page
    .getByLabel('再入院风险评分表', { exact: true })
    .setInputFiles(file('fixture-risk.csv', riskText))
  await page.getByRole('button', { name: '导入并查看历史数据', exact: true }).click()
}
async function importFixture(page: Page) {
  await page.goto('/')
  await upload(page)
  await expect(page.getByRole('heading', { name: '让真实记录，清晰呈现。' })).toBeVisible()
}

test('本地导入正确区分样本、患者、原始行及同日差异，不发送上传请求', async ({ page }) => {
  const uploads: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' || request.method() === 'PUT') uploads.push(request.url())
  })
  await importFixture(page)
  await expect(page.locator('.metric-value')).toHaveText(['3', '2', '4', '1'])
  await expect(page.locator('.history-quality')).toContainText('评分文件全部原始行5')
  await expect(page.locator('.history-quality')).toContainText('评分文件不同患者3')
  await expect(page.locator('.history-quality')).toContainText('评分文件完全重复的额外行1')
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
  await expect(page.getByRole('heading', { name: '原始随访记录未提供' })).toBeVisible()
  await expect(page.getByText('未提供姓名、科室及出院日期')).toBeVisible()
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
  await page.getByRole('button', { name: '记录来源核对', exact: true }).click()
  await page
    .getByRole('textbox', { name: '核对意见', exact: true })
    .fill('同日有两条差异记录，需要核实就诊事件编号。')
  await page.getByRole('button', { name: '保存核对意见' }).click()
  await page.getByRole('button', { name: '新建试用任务' }).click()
  await page.getByRole('textbox', { name: '任务名称', exact: true }).fill('核实记录流程测试')
  await page.getByRole('button', { name: '创建本地任务' }).click()
  await page
    .getByRole('navigation', { name: '历史数据导航' })
    .getByRole('button', { name: '随访流程试用' })
    .click()
  await page.getByRole('button', { name: '填写试用记录' }).click()
  await page.getByRole('combobox', { name: '联系结果' }).selectOption('未接通')
  await expect(page.getByRole('checkbox')).toBeDisabled()
  await page.getByRole('textbox', { name: '处理记录' }).fill('本地试用：暂未联系成功。')
  await page.getByRole('button', { name: '保存试用记录' }).click()
  await expect(page.locator('.task-status')).toHaveText('进行中')
  const state = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.startsWith('silver-guardian.history.')),
  )
  expect(state).toHaveLength(1)
  expect(state[0][1]).not.toContain('fixture-A')
  expect(state[0][1]).not.toContain('fixture-X')
  expect(state[0][1]).not.toContain('血红蛋白')
  await page.reload()
  await expect(page.getByRole('heading', { name: '每一份关注，都有后续。' })).toBeVisible()
  await upload(page)
  await expect(page.getByRole('heading', { name: '让真实记录，清晰呈现。' })).toBeVisible()
  await page.getByRole('button', { name: '查看患者 H0001', exact: true }).click()
  await expect(page.locator('.history-shell')).toContainText(
    '同日有两条差异记录，需要核实就诊事件编号。',
  )
  await expect(page.locator('.history-shell')).toContainText('本地试用：暂未联系成功。')
  await upload(page, wide, risk.replace('0.3,0,中风险', '0.31,0,中风险'), true)
  await expect(page.getByRole('heading', { name: '让真实记录，清晰呈现。' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '历史数据导航' })
    .getByRole('button', { name: '随访流程试用' })
    .click()
  await expect(page.getByRole('heading', { name: '尚无本地试用任务' })).toBeVisible()
})

test('缺字段、重复患者或非法评分阻止导入且不覆盖当前页面', async ({ page }) => {
  await page.goto('/')
  await upload(page, 'PATIENT_ID,年龄\nfixture-A,76\n')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('缺少字段：SEX')
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('duplicate.csv', 'PATIENT_ID,年龄,SEX\nfixture-A,76,2\nfixture-A,76,2\n'))
  await page.getByRole('button', { name: '导入并查看历史数据' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('重复患者编号')
  await page
    .getByLabel('患者健康画像宽表', { exact: true })
    .setInputFiles(file('fixture-wide.csv', wide))
  await page
    .getByLabel('再入院风险评分表', { exact: true })
    .setInputFiles(file('bad-risk.csv', risk.replace('0.7,1,高风险', '1.7,1,高风险')))
  await page.getByRole('button', { name: '导入并查看历史数据' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('未丢弃或替换该记录')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('heading', { name: '每一份关注，都有后续。' })).toBeVisible()
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
  await page.getByRole('button', { name: '恢复本地流程为空' }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('unrelated-app'))).toBe('keep')
})
