# CRM and Yunxi Teaching Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox markers so progress can be tracked safely.

**Goal:** 把现有单页原型升级为两个彼此独立、可课堂操作的演示区：以“线索公海”为核心的运营商政企 CRM，以及仅覆盖云名片、呼叫控制、AI 数析、AI 助手、AI 助销的云犀功能演示。

**Architecture:** 继续采用无需构建工具的静态站点，但将页面、样式、数据和行为拆分为清晰的经典 JavaScript 模块。CRM 与云犀分别使用独立状态域、独立导航和独立自动演示；两者只共享页面外壳、弹窗、提示和演示控制器，不共享业务数据，也不做任何协同或回写。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、JSON、浏览器 localStorage、Python unittest、Playwright for Python、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-12-crm-yunxi-teaching-demo-design.md`

## Global Constraints

- 品牌标题只显示“CRM”，不得出现“联通云犀”作为 CRM 品牌。
- 云犀区只保留：云名片、呼叫控制、AI 数析、AI 助手、AI 助销；“AI 数析”必须使用这一准确写法。
- 不实现 CRM 与云犀协同、接口联动、数据回写或共享状态。
- 不出现 aTrust、DNS、VPN、代理软件或远程接入方案。
- 天津河东区线索公海恰好 50 家；全部是明显虚构的教学企业，不冒充真实公开主体。
- 电话号码必须脱敏，页面不得包含真实个人联系方式、账号凭据或私网地址。
- 保留用户当前工作区改动；尤其不要恢复、暂存或提交已删除的 `.nojekyll`。
- 每完成一个任务就运行该任务的测试并做小提交。

## File Structure

```text
index.html                         # 页面骨架与静态资源入口
assets/styles.css                  # 布局、组件、演示高亮与响应式样式
assets/js/state.js                 # 独立 localStorage 状态域与快照 API
assets/js/crm.js                   # CRM 页面、线索操作和闭环业务逻辑
assets/js/yunxi.js                 # 云犀五项功能的页面和交互逻辑
assets/js/demos.js                 # 两套独立自动演示的步骤与播放器
assets/js/app.js                   # 路由、弹窗、提示、初始化和公共 UI
data/crm-leads.json                # 天津河东区 50 家虚构教学线索
data/yunxi-products.json           # 五项云犀功能的教学资料结构
tests/__init__.py                  # 测试包标识
tests/test_data.py                 # 数据数量、分类、脱敏和禁词检查
tests/test_ui.py                   # Playwright 交互、状态隔离和响应式验收
README.md                          # 使用方法、数据说明与发布说明
```

## Task 1: 建立可重复的验收测试基线

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/test_data.py`
- Create: `tests/test_ui.py`
- Modify: `README.md`

- [ ] **Step 1: 写出当前必然失败的数据契约测试**

在 `tests/test_data.py` 中定义仓库根目录和 JSON 读取函数，并先断言目标文件存在：

```python
ROOT = Path(__file__).resolve().parents[1]

class DataContractTests(unittest.TestCase):
    def test_required_data_files_exist(self):
        self.assertTrue((ROOT / "data/crm-leads.json").exists())
        self.assertTrue((ROOT / "data/yunxi-products.json").exists())
```

- [ ] **Step 2: 写出当前必然失败的页面结构测试**

在 `tests/test_ui.py` 中启动临时静态服务器；若 Playwright 未安装则明确失败并给出安装命令。首个测试要求存在两个入口按钮：`data-mode="crm"` 与 `data-mode="yunxi"`。

- [ ] **Step 3: 运行测试并确认失败原因正确**

Run: `python3 -m unittest discover -s tests -v`

Expected: 因数据文件或双入口不存在而失败，而不是语法错误。

- [ ] **Step 4: 在 README 增加测试依赖和运行命令**

写明：

```text
python3 -m pip install playwright
python3 -m playwright install chromium
python3 -m unittest discover -s tests -v
```

- [ ] **Step 5: Commit**

```bash
git add tests README.md
git commit -m "test: add CRM teaching demo acceptance harness"
```

## Task 2: 构建恰好 50 家天津河东区虚构线索数据

**Files:**
- Create: `data/crm-leads.json`
- Modify: `tests/test_data.py`

- [ ] **Step 1: 先写精确数量与分类分布测试**

```python
EXPECTED = {
    "健身运动": 8, "美容美发医美": 8, "汽车4S及服务": 8,
    "教育培训": 8, "家居地产": 6, "财税法务企业服务": 5,
    "口腔体检养老": 4, "电商物流同城配送": 3,
}

def test_hedong_pool_has_exactly_50_leads(self):
    leads = load_json("data/crm-leads.json")
    self.assertEqual(len(leads), 50)
    self.assertEqual(Counter(x["industry"] for x in leads), EXPECTED)
```

- [ ] **Step 2: 增加地区、唯一性和脱敏测试**

允许街道仅为：大王庄、大直沽、中山门、富民路、春华、唐家口、常州道、上杭路、东新、鲁山道、二号桥、向阳楼。断言每条 `city=天津市`、`district=河东区`、ID 唯一、名称含“模拟”、手机号符合 `1**-****-dddd`，并包含 `source="教学模拟"` 与 `verifiedAt`。

- [ ] **Step 3: 运行测试确认失败**

Run: `python3 -m unittest tests.test_data -v`

Expected: 缺少数据文件或数量为零。

- [ ] **Step 4: 写入 50 条完整数据**

每条记录固定字段：

```json
{
  "id": "TJHD-001",
  "company": "河东跃动健身服务（模拟）有限公司",
  "city": "天津市",
  "district": "河东区",
  "street": "大王庄",
  "industry": "健身运动",
  "contact": "王经理（模拟）",
  "phone": "1**-****-1021",
  "score": 86,
  "opportunity": "企业宽带 + 云名片",
  "status": "待领取",
  "source": "教学模拟",
  "verifiedAt": "2026-09-12",
  "signal": "新店筹备，预计 18 个工位与会员回访需求"
}
```

名称、评分、机会、需求信号逐条变化，避免机械重复；不得使用真实企业全称或真实电话。

- [ ] **Step 5: 运行测试并通过**

Run: `python3 -m unittest tests.test_data -v`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add data/crm-leads.json tests/test_data.py
git commit -m "feat: add Tianjin Hedong teaching lead pool"
```

## Task 3: 拆分静态页面并建立完全独立的状态域

**Files:**
- Modify: `index.html`
- Create: `assets/styles.css`
- Create: `assets/js/state.js`
- Create: `assets/js/app.js`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写状态隔离测试**

测试页面启动后存在两个键：`crm_operator_state_v4` 与 `yunxi_teaching_state_v1`。修改 CRM 状态前后，云犀键值必须逐字相同；反向亦然。

- [ ] **Step 2: 写页面骨架测试**

断言 `index.html` 只加载一个样式文件和四个以上本地脚本；页面含 `#app-shell`、`#sidebar`、`#main-content`、`#modal-root`、`#toast-root`、`#demo-controls`。

- [ ] **Step 3: 运行测试确认失败**

Run: `python3 -m unittest tests.test_ui -v`

Expected: 新 DOM 和状态键不存在。

- [ ] **Step 4: 实现状态 API**

`assets/js/state.js` 暴露：

```javascript
window.State = {
  createDomain(key, seed) // -> { get, save, reset, snapshot, restore, upsert }
};
```

所有写入先深拷贝，JSON 解析失败时恢复 seed；CRM 和云犀实例只在各自模块内创建。

- [ ] **Step 5: 实现公共应用外壳**

`assets/js/app.js` 暴露：

```javascript
window.App = {
  navigate(mode, page), openModal(content), closeModal(), toast(message, tone)
};
```

首页提供“进入 CRM”和“进入云犀功能演示”两个并列入口。顶部只显示中性标题“CRM 教学演示”，并显示“全站数据均为教学模拟”的说明。

- [ ] **Step 6: 迁移样式并通过测试**

Run: `python3 -m unittest tests.test_ui -v`

Expected: 页面结构与状态隔离测试通过。

- [ ] **Step 7: Commit**

```bash
git add index.html assets tests/test_ui.py
git commit -m "refactor: split static app and isolate product state"
```

## Task 4: 以线索公海为第一优先级完成 CRM 交互

**Files:**
- Create: `assets/js/crm.js`
- Modify: `assets/styles.css`
- Modify: `assets/js/app.js`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写导航顺序和线索公海测试**

CRM 一级导航固定为：线索中心、工作台、客户、商机、报价与产品、合同订单回款、销售活动、通话与质检、报表。进入 CRM 默认打开线索中心；二级默认打开“天津河东客户公海”。

- [ ] **Step 2: 写筛选、领取和分配测试**

测试行业与街道组合筛选；点击第一条“领取”后公海计数从 50 变为 49，该记录出现在“我的线索”；分配客户经理后负责人字段更新，刷新页面仍保留。

- [ ] **Step 3: 写业务闭环测试**

同一条线索依次执行：首次联系、创建 T+2 跟进任务、转客户、建商机、生成报价、建合同、建订单、登记回款、赢单。断言各模块通过同一业务 ID 关联，状态和金额一致。

- [ ] **Step 4: 运行测试确认失败**

Run: `python3 -m unittest tests.test_ui.CrmFlowTests -v`

Expected: CRM 页面或操作按钮不存在。

- [ ] **Step 5: 实现 CRM 页面和统一业务操作**

`assets/js/crm.js` 暴露：

```javascript
window.CRM = {
  pages,
  render(page),
  bind(),
  claimLead(id), assignLead(id, owner), recycleLead(id),
  logContact(id, payload), createTask(id, payload), convertLead(id),
  createOpportunity(customerId, payload), createQuote(opportunityId, payload),
  createContract(opportunityId, payload), createOrder(contractId, payload),
  registerPayment(orderId, payload), closeOpportunity(id)
};
```

所有操作调用同一组纯业务函数；按钮处理器和自动演示不得复制状态变更代码。重复调用转客户、建合同、建订单、登记回款时根据来源 ID 幂等更新，不新增重复对象。

- [ ] **Step 6: 优化课堂可读性**

线索表首屏显示公司、街道、行业、评分、机会信号、状态和操作；右侧详情抽屉显示虚构标识、脱敏联系人、推荐产品与时间线。将低频功能合并到对应一级模块，不保留空壳页面。

- [ ] **Step 7: 运行 CRM 测试并通过**

Run: `python3 -m unittest tests.test_ui.CrmFlowTests -v`

Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add assets/js/crm.js assets/js/app.js assets/styles.css tests/test_ui.py
git commit -m "feat: prioritize CRM lead pool and sales lifecycle"
```

## Task 5: 建立云犀五项功能的独立资料与导航

**Files:**
- Create: `data/yunxi-products.json`
- Create: `assets/js/yunxi.js`
- Modify: `assets/js/app.js`
- Modify: `tests/test_data.py`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写五项功能契约测试**

断言产品 ID 恰好为 `cloud-card`、`call-control`、`ai-analytics`、`ai-assistant`、`ai-sales`，中文名恰好对应云名片、呼叫控制、AI 数析、AI 助手、AI 助销；禁止出现 `AI 数悉` 或 `AI数悉`。

- [ ] **Step 2: 写资料字段完整性测试**

每项必须包含 `positioning`、`audience`、`before`、`during`、`after`、`limitations`、`teachingPoints`、`sourceRefs`。`sourceRefs` 记录已核验的金山文档资料标识和核验日期，不在页面伪造外部公开链接。

- [ ] **Step 3: 运行测试确认失败**

Run: `python3 -m unittest tests.test_data -v`

Expected: 云犀数据文件缺失。

- [ ] **Step 4: 写五项产品教学数据**

内容边界：

- 云名片：企业身份展示、主叫名片触达、终端与平台显示限制。
- 呼叫控制：单号码频次、总量、时段、黑名单；不得声称保证不封号。
- AI 数析：企业批量/多人通话管理、结构化标签、看板、钻取。
- AI 助手：个人通话记录、录音转写、摘要、待办、AI 问答，使用手机/小程序式界面。
- AI 助销：外呼实时转写、知识库、话术推荐、标签、会后总结，重点使用 4S 店情境。

- [ ] **Step 5: 实现独立云犀入口和导航**

`assets/js/yunxi.js` 暴露：

```javascript
window.Yunxi = {
  pages, render(page), bind(),
  previewCard(), saveCallPolicy(), simulateControlledCall(),
  runAnalysis(), generateAssistantOutput(),
  startSalesCall(), triggerSalesObjection(), endSalesCall()
};
```

云犀首页只展示五张功能卡，不显示 CRM 协同、客户回写或联合流程入口。

- [ ] **Step 6: 运行数据与导航测试并通过**

Run: `python3 -m unittest tests.test_data tests.test_ui.YunxiNavigationTests -v`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add data/yunxi-products.json assets/js/yunxi.js assets/js/app.js tests
git commit -m "feat: add independent Yunxi teaching modules"
```

## Task 6: 完成云名片与呼叫控制可操作演示

**Files:**
- Modify: `assets/js/yunxi.js`
- Modify: `assets/styles.css`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写云名片交互测试**

填写模拟企业简称、品牌语和服务标签，点击预览后手机画面同步显示；切换“不支持展示”的终端情境时出现限制说明，不承诺 100% 展示。

- [ ] **Step 2: 写呼叫控制策略测试**

设置单号码日上限、全员日配额、允许时段和黑名单；模拟呼叫应覆盖三类结果：允许、达到频次上限而拦截、黑名单拦截，并形成教学日志。

- [ ] **Step 3: 运行测试确认失败**

Run: `python3 -m unittest tests.test_ui.YunxiCardAndControlTests -v`

Expected: 表单、预览或拦截日志不存在。

- [ ] **Step 4: 实现云名片模拟器**

采用左侧参数、右侧手机预览；保存仅写入 `yunxi_teaching_state_v1`。页面明确标注“教学模拟，不代表实际终端展示结果”。

- [ ] **Step 5: 实现呼叫控制策略台**

使用固定测试号码掩码和内存计数器。`simulateControlledCall()` 根据黑名单、时段、单号频次、团队配额的固定顺序返回 `{allowed, reason, rule}`，便于课堂解释判定逻辑。

- [ ] **Step 6: 运行测试并通过**

Run: `python3 -m unittest tests.test_ui.YunxiCardAndControlTests -v`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add assets/js/yunxi.js assets/styles.css tests/test_ui.py
git commit -m "feat: simulate Yunxi card and call control"
```

## Task 7: 清晰区分 AI 数析、AI 助手和 AI 助销

**Files:**
- Modify: `assets/js/yunxi.js`
- Modify: `assets/styles.css`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写三类 AI 场景测试**

测试 AI 数析必须产生团队指标与标签钻取；AI 助手必须产生个人摘要、待办和问答；AI 助销必须在模拟通话进行中响应客户异议并实时推荐话术。三页不得复用同一标题和同一结果面板。

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest tests.test_ui.YunxiAiTests -v`

Expected: 三套差异化结果不存在。

- [ ] **Step 3: 实现 AI 数析**

提供团队通话概览、接通率、有效沟通率、客户意向标签和人员排行。点击标签后钻取到脱敏通话列表；所有数值来自固定模拟样本聚合，不随机漂移。

- [ ] **Step 4: 实现 AI 助手**

采用移动端工作台视觉，选择一条个人通话后生成固定的转写摘要、待办与风险点；AI 问答只回答当前模拟通话上下文，并标注“模拟生成”。

- [ ] **Step 5: 实现 AI 助销**

以 4S 店客户邀约为脚本：开始通话后逐段显示实时转写；点击“价格高”“暂时没时间”“担心售后”触发不同知识库话术；结束后生成摘要、意向标签和下一步建议。

- [ ] **Step 6: 运行测试并通过**

Run: `python3 -m unittest tests.test_ui.YunxiAiTests -v`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add assets/js/yunxi.js assets/styles.css tests/test_ui.py
git commit -m "feat: add distinct Yunxi AI demonstrations"
```

## Task 8: 实现两套互不干扰的自动演示

**Files:**
- Create: `assets/js/demos.js`
- Modify: `assets/js/app.js`
- Modify: `assets/styles.css`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写演示选择器与控制器测试**

点击“自动演示”必须先选择且只能选择两种模式：“CRM 线索成交演示”“云犀五项功能导览”。控制条包含播放/暂停、上一步、下一步、0.75/1/1.5 倍速、重播、退出。

- [ ] **Step 2: 写 CRM 自动演示测试**

测试快速模式依次完成：进入公海、筛选、领取、首次联系、T+2 跟进、转客户、建商机、报价、合同、订单、回款、赢单、返回工作台。最终关联对象各一条，重复播放不重复创建。

- [ ] **Step 3: 写云犀自动演示隔离测试**

播放前保存 CRM localStorage 原始字符串；云犀导览依次进入五项功能并触发其核心交互；退出后断言 CRM 原始字符串完全未变化。

- [ ] **Step 4: 运行测试确认失败**

Run: `python3 -m unittest tests.test_ui.DemoPlayerTests -v`

Expected: 演示选择器和播放器 API 不存在。

- [ ] **Step 5: 实现声明式演示步骤**

`assets/js/demos.js` 暴露：

```javascript
window.Demos = {
  start(mode), pause(), resume(), next(), previous(),
  restart(), exit({ restore }), setSpeed(rate), runAllForTest(mode)
};
```

每一步使用 `{id, title, explanation, target, enter, leave}`。CRM 步骤只调用 `CRM` 业务 API，云犀步骤只调用 `Yunxi` API。进入演示前只快照当前模式的状态域；退出提供“保留结果”和“恢复演示前状态”。

- [ ] **Step 6: 实现讲解浮层与目标高亮**

浮层始终展示“正在做什么 / 为什么做 / 数据变化”；目标元素滚动到可视区并高亮。找不到目标时跳过高亮但继续步骤，避免投屏尺寸变化导致卡死。

- [ ] **Step 7: 运行演示测试并通过**

Run: `python3 -m unittest tests.test_ui.DemoPlayerTests -v`

Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add assets/js/demos.js assets/js/app.js assets/styles.css tests/test_ui.py
git commit -m "feat: add isolated CRM and Yunxi guided demos"
```

## Task 9: 完成响应式、重置、文案与隐私验收

**Files:**
- Modify: `assets/styles.css`
- Modify: `assets/js/app.js`
- Modify: `README.md`
- Modify: `tests/test_data.py`
- Modify: `tests/test_ui.py`

- [ ] **Step 1: 写禁词和敏感信息扫描测试**

扫描 HTML、CSS、JS、JSON、README，禁止：`AI 数悉`、`AI数悉`、`aTrust`、`回写 CRM`、`联动 CRM`、连续 11 位中国手机号、`10.x.x.x`/`192.168.x.x` 私网 URL。测试说明文字可提“CRM 与云犀相互独立”，但不得描述协同方案。

- [ ] **Step 2: 写重置与幂等测试**

分别提供“重置 CRM 教学数据”和“重置云犀教学数据”；重置一方不得改变另一方。CRM 完整流程重复执行两次后，来源线索对应的客户、合同、订单、回款仍各一条。

- [ ] **Step 3: 写响应式测试**

在 1366×768、1024×768、720×900 三种视口检查无水平溢出；侧栏、表格、抽屉、弹窗、讲解浮层和控制条可见且不遮挡主要操作。720 宽时表格允许容器内横向滚动，但 `document.body.scrollWidth === innerWidth`。

- [ ] **Step 4: 运行测试确认失败**

Run: `python3 -m unittest discover -s tests -v`

Expected: 至少一个禁词、重置或响应式断言失败。

- [ ] **Step 5: 修正文案与布局**

删除无关模块和旧品牌残留；统一教学标识、按钮语气、空状态和错误提示。确保演示模式的焦点管理、Esc 关闭弹窗和键盘可操作性。

- [ ] **Step 6: 更新 README**

说明两个独立演示区、50 条数据为虚构教学数据、浏览器本地保存、两个重置入口、自动演示用法、GitHub Pages 地址和本地测试方法。不要描述 aTrust 或 CRM/云犀协同。

- [ ] **Step 7: 运行全量测试并通过**

Run: `python3 -m unittest discover -s tests -v`

Expected: PASS。

Run: `git diff --check`

Expected: 无输出。

- [ ] **Step 8: Commit**

```bash
git add assets index.html data README.md tests
git commit -m "fix: complete teaching demo acceptance polish"
```

## Task 10: 最终核验并发布到 GitHub Pages

**Files:**
- Modify only if needed: files already listed above

- [ ] **Step 1: 使用 verification-before-completion 技能执行最终核验**

重新运行，不复用旧结果：

```bash
python3 -m unittest discover -s tests -v
git diff --check
git status --short
```

Expected: 测试全通过；无空白错误；仅允许用户原有的 `.nojekyll` 删除保持未暂存。

- [ ] **Step 2: 浏览器人工抽查**

依次人工走通：

1. CRM 线索筛选、领取、分配和完整成交。
2. 云名片预览、呼叫控制拦截、AI 数析钻取、AI 助手摘要、AI 助销实时话术。
3. 两套自动演示的暂停、前后切换、倍速、重播、退出恢复。
4. 刷新持久化、分别重置、重复播放幂等。

- [ ] **Step 3: 检查待推送提交和敏感内容**

```bash
git log --oneline --decorate -12
git diff origin/main...HEAD --stat
git grep -nE '([0-9]{11}|192\.168\.|10\.[0-9]+\.[0-9]+\.)' -- ':!docs/superpowers'
```

Expected: 只有本项目改动；敏感内容扫描无结果。

- [ ] **Step 4: 推送默认分支**

```bash
git push origin main
```

Expected: 推送成功。不得使用 `git add -A`，避免把 `.nojekyll` 删除带入提交。

- [ ] **Step 5: 核验 Pages 在线地址**

打开仓库 Pages 地址，检查 HTTP 200、静态资源加载成功、两套演示可操作。若 GitHub 部署有短暂延迟，仅轮询页面状态，不修改本地数据。

- [ ] **Step 6: 报告最终结果**

向用户提供：在线网址、主要改动、测试结果、教学数据声明，以及未触碰 `.nojekyll` 用户改动的说明。

## Completion Review Checklist

- [ ] 规格中的两区独立、五项云犀功能、50 条河东公海线索均有明确实现任务和测试。
- [ ] 所有业务操作都对应可调用接口，不存在“稍后实现”“类似处理”等占位语。
- [ ] CRM 和云犀状态键、重置、自动演示、页面导航均相互隔离。
- [ ] “AI 数析”拼写和产品边界在数据、页面和测试中一致。
- [ ] 全部测试命令、预期失败、预期通过和提交边界均已写明。
- [ ] 发布任务不会暂存或恢复用户删除的 `.nojekyll`。
