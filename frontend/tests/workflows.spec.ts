import { expect, test } from '@playwright/test'

test('工作台统计由数据驱动，入口能正确筛选任务', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '每一份关注，都有后续。' })).toBeVisible()
  const metrics = page.locator('.metric-card')
  await expect(metrics.nth(0).locator('.metric-value')).toHaveText('12人')
  await expect(metrics.nth(1).locator('.metric-value')).toHaveText('5项')
  await expect(metrics.nth(2).locator('.metric-value')).toHaveText('5项')
  await expect(metrics.nth(3).locator('.metric-value')).toHaveText('2项')
  await metrics.nth(3).click()
  await expect(page.locator('.followup-card')).toHaveCount(2)
  await expect(page.locator('.overdue-label')).toHaveCount(2)
})

test('患者目录支持组合筛选与无结果状态', async ({ page }) => {
  await page.goto('/#/patients')
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(12)
  await page.getByRole('button', { name: '优先关注 4' }).click()
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(4)
  await page.getByRole('combobox', { name: '疾病筛选' }).selectOption('慢性肾病')
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索患者', exact: true }).fill('不存在')
  await expect(page.getByRole('heading', { name: '没有找到相关记录' })).toBeVisible()
  await page.getByRole('button', { name: '清除搜索' }).click()
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(2)
})

test('全局搜索与档案深链接可用，检验图表随指标切换', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: '全局搜索患者' }).fill('P001')
  await page.getByRole('textbox', { name: '全局搜索患者' }).press('Enter')
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(1)
  await page.getByRole('link', { name: '查看林女士的健康档案' }).click()
  await expect(page.getByRole('heading', { name: '林女士', exact: true })).toBeVisible()
  await expect(page.locator('.lab-chart svg')).toBeVisible()
  await expect(page.locator('.lab-summary strong')).toHaveText('104g/L')
  await page.getByRole('button', { name: '肌酐', exact: true }).click()
  await expect(page.locator('.lab-summary strong')).toHaveText('116μmol/L')
  await page.getByText('查看检验数值表', { exact: true }).click()
  await expect(page.locator('.lab-data-details tbody tr')).toHaveCount(6)
  await page.getByRole('button', { name: '诊疗与处理时间线', exact: true }).click()
  await expect(page.getByRole('heading', { name: '出院记录', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '林女士', exact: true })).toBeVisible()
})

test('人工复核保存、计数更新，并在刷新和时间线中保留', async ({ page }) => {
  await page.goto('/#/reviews?patient=P001')
  await page.getByRole('button', { name: '记录复核意见', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: /需补充信息/ }).check()
  await dialog
    .getByRole('textbox', { name: '复核意见', exact: true })
    .fill('请补充出院后的血压监测记录，再确认随访安排。')
  await dialog.getByRole('button', { name: '保存复核意见' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.heading-status')).toHaveText('4 项评估等待复核')
  await page.reload()
  await expect(page.locator('.review-last')).toContainText('请补充出院后的血压监测记录')
  await page.goto('/#/patients/P001')
  await page.getByRole('button', { name: '诊疗与处理时间线', exact: true }).click()
  await expect(page.locator('.clinical-timeline')).toContainText('请补充出院后的血压监测记录')
})

test('新建任务后统计更新，记录完成后同步到患者档案', async ({ page }) => {
  await page.goto('/#/followups')
  await page.getByRole('button', { name: '新建随访任务', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: '任务名称', exact: true }).fill('端到端演示随访')
  await dialog
    .getByRole('textbox', { name: '关注事项', exact: true })
    .fill('确认出院后的复查安排。')
  await dialog.getByRole('button', { name: '创建任务' }).click()
  await expect(page.locator('.task-summary.all strong')).toHaveText('9项')
  await page.reload()
  const task = page
    .locator('.followup-card')
    .filter({ has: page.getByRole('heading', { name: '端到端演示随访', exact: true }) })
  await expect(task).toBeVisible()
  await task.getByRole('button', { name: '开始处理' }).click()
  await expect(task.locator('.task-status')).toHaveText('进行中')
  await task.getByRole('button', { name: '填写记录' }).click()
  dialog = page.getByRole('dialog')
  await dialog
    .getByRole('textbox', { name: '随访记录', exact: true })
    .fill('已联系患者，确认已安排复查。')
  await dialog.getByRole('textbox', { name: '后续安排', exact: true }).fill('复查后继续跟进。')
  await dialog.getByRole('button', { name: '保存随访记录' }).click()
  await expect(task.locator('.task-status')).toHaveText('已完成')
  await page.goto('/#/patients/P001')
  await page.getByRole('button', { name: /随访记录\s*1/ }).click()
  await expect(page.locator('.record-list')).toContainText('已联系患者，确认已安排复查。')
})

test('未接通保留为进行中，并可重新安排日期', async ({ page }) => {
  await page.goto('/#/followups?task=T001')
  await page.getByRole('button', { name: '填写记录' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: '联系结果' }).selectOption('未接通')
  await expect(dialog.getByRole('checkbox')).toBeDisabled()
  await dialog.getByRole('textbox', { name: '随访记录', exact: true }).fill('两次联系暂未接通。')
  await dialog.getByRole('textbox', { name: '后续安排', exact: true }).fill('明日再次联系。')
  await dialog.getByLabel('下一次处理日期', { exact: true }).fill('2026-10-17')
  await dialog.getByRole('button', { name: '保存随访记录' }).click()
  await expect(page.locator('.task-status')).toHaveText('进行中')
  await expect(page.locator('.task-meta')).toContainText('2026-10-17')
  await page.reload()
  await page.getByText('查看随访记录（1）', { exact: true }).click()
  await expect(page.locator('.task-record')).toContainText('未接通')
})

test('复核可创建随访，已有任务时避免重复创建', async ({ page }) => {
  await page.goto('/#/reviews?patient=P009')
  await page.getByRole('button', { name: '记录复核意见' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: /确认关注/ }).check()
  await dialog
    .getByRole('textbox', { name: '复核意见', exact: true })
    .fill('人工确认需要安排一次演示随访。')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '保存复核意见' }).click()
  await page.goto('/#/followups?patient=P009')
  await expect(page.locator('.followup-card')).toHaveCount(1)
  await page.goto('/#/reviews?patient=P009')
  await page.getByRole('button', { name: '记录复核意见' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('checkbox')).toBeDisabled()
  await expect(dialog).toContainText('该患者已有未完成随访任务，不重复创建')
})

test('导出结构化记录，重置仅清除本应用的数据', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: '每一份关注，都有后续。' }).waitFor()
  await page.evaluate(() => localStorage.setItem('another-app', 'preserve-me'))
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出演示记录', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('银龄守护-演示记录')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const value = JSON.parse(Buffer.concat(chunks).toString())
  expect(value.dataMode).toBe('synthetic-demo')
  expect(value.tasks).toHaveLength(8)
  await page.getByRole('button', { name: '重置演示', exact: true }).click()
  await page.getByRole('button', { name: '确认重置' }).click()
  expect(await page.evaluate(() => localStorage.getItem('another-app'))).toBe('preserve-me')
  expect(await page.evaluate(() => localStorage.getItem('silver-guardian.demo.v1'))).toBeNull()
})

test('保存被浏览器拒绝时，不假装操作成功', async ({ page }) => {
  await page.goto('/#/reviews?patient=P001')
  await page.getByRole('button', { name: '记录复核意见' }).click()
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
  await page
    .getByRole('textbox', { name: '复核意见', exact: true })
    .fill('这是一次不能保存的复核记录。')
  await page.getByRole('button', { name: '保存复核意见' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('保存失败，记录未更新')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.review-last .review-badge')).toHaveText('待复核')
})

test('损坏的本地记录不被静默覆盖，可恢复初始数据', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupt-seeded')) {
      localStorage.setItem('silver-guardian.demo.v1', '{broken')
      sessionStorage.setItem('corrupt-seeded', 'true')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '暂时无法打开工作台' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('silver-guardian.demo.v1'))).toBe('{broken')
  await page.getByRole('button', { name: '恢复初始演示' }).click()
  await expect(page.getByRole('heading', { name: '每一份关注，都有后续。' })).toBeVisible()
})

test('数据文件请求失败可重试，不显示虚假的空统计', async ({ page }) => {
  await page.route('**/demo/dataset.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '暂时无法打开工作台' })).toBeVisible()
  await expect(page.locator('.metric-card')).toHaveCount(0)
  await page.unroute('**/demo/dataset.json')
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.locator('.metric-card')).toHaveCount(4)
})

test('未知患者与未知页面有明确返回入口', async ({ page }) => {
  await page.goto('/#/patients/unknown')
  await expect(page.getByRole('heading', { name: '没有找到这份档案' })).toBeVisible()
  await page.getByRole('link', { name: '返回患者档案' }).click()
  await expect(page.locator('.patient-table tbody tr')).toHaveCount(12)
  await page.goto('/#/unknown')
  await expect(page.getByRole('heading', { name: '这个页面不存在' })).toBeVisible()
})

test('手机端各页面不产生整页横向溢出，导航与弹窗可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const path of ['/', '/#/patients', '/#/patients/P001', '/#/reviews', '/#/followups']) {
    await page.goto(path)
    await page.locator('.app-footer').waitFor()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy()
  }
  await page.getByRole('button', { name: '打开导航' }).click()
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /患者档案/ })
    .click()
  await expect(page.getByRole('heading', { name: '连续的记录，完整的关怀。' })).toBeVisible()
  await page.getByRole('button', { name: '快速新建随访任务' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(errors).toEqual([])
})
