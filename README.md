# 不断更排期台

这是一个本地可直接打开的排期产品原型，面向本地生活商家代运营场景，核心能力包括：

- 商家库存管理
- 按发片规则自动推算未来发布日期
- 根据断更日倒推出最晚写本 / 拍摄 / 开剪时间
- 拍摄批次看板
- 红黄绿风险预警

## 直接使用

1. 用浏览器打开 [index.html](/Users/douwenkai/Documents/codex/index.html)
2. 默认会载入 4 家商家的示例数据
3. 数据会保存在浏览器 `localStorage`
4. 可以随时点页面右上角 `恢复示例数据`

## 在线部署

这套产品现在已经整理成静态站点，可以直接部署到 Vercel 或 Netlify。

### 方案 1：Vercel

1. 把当前目录上传到你的 Git 仓库。
2. 在 Vercel 新建项目并导入该仓库。
3. Framework Preset 选 `Other`。
4. 不需要安装依赖，也不需要 Build Command。
5. Root Directory 选当前项目根目录。
6. 部署完成后，默认首页就是 `index.html`。

项目里已经带了 [vercel.json](/Users/douwenkai/Documents/codex/vercel.json)，可以直接用。【F:/Users/douwenkai/Documents/codex/vercel.json†L1-L13】

### 方案 2：Netlify

1. 把当前目录上传到你的 Git 仓库。
2. 在 Netlify 选择 `Add new site` -> `Import an existing project`。
3. 不需要 Build Command。
4. Publish directory 填 `.`。

项目里已经带了 [netlify.toml](/Users/douwenkai/Documents/codex/netlify.toml)，可以直接用。【F:/Users/douwenkai/Documents/codex/netlify.toml†L1-L10】

### 上线后的数据说明

- 当前数据保存在浏览器本地 `localStorage`
- 这意味着：
  - 你在自己电脑上打开，数据会留在这台设备的浏览器里
  - 换手机、换电脑、换浏览器，数据不会自动同步
- 如果你要“多设备同步”或“团队一起用”，下一步需要加后端存储

## 适合下一步继续升级的方向

如果你准备正式对外用，推荐按这个顺序继续：

1. 接 Supabase 或 Firebase，做云端数据同步
2. 做账号登录
3. 做飞书提醒或企微提醒
4. 给批次加附件、脚本链接、成片链接

## 项目文件

- [index.html](/Users/douwenkai/Documents/codex/index.html)
  页面结构和弹窗。
- [app.css](/Users/douwenkai/Documents/codex/app.css)
  视觉样式和响应式布局。
- [app.js](/Users/douwenkai/Documents/codex/app.js)
  业务规则、库存计算、看板渲染、数据存储。
- [app.webmanifest](/Users/douwenkai/Documents/codex/app.webmanifest)
  基础 Web App 清单文件。
- [vercel.json](/Users/douwenkai/Documents/codex/vercel.json)
  Vercel 静态部署配置。
- [netlify.toml](/Users/douwenkai/Documents/codex/netlify.toml)
  Netlify 静态部署配置。

## 功能说明

### 商家总览

- 支持 `单数日`、`双数日`、`自定义周几`
- 自动算未来发片日
- 自动算库存可支撑到哪天
- 自动算断更日和最晚写本 / 拍摄 / 开剪时间
- 支持一键 `库存 +3`

### 拍摄批次看板

- 支持新建批次
- 支持阶段流转
- 支持完成批次后自动补库存
- 支持识别逾期批次

### 风险雷达

- 红色：3 天内会断更，或已无库存
- 黄色：7 天内会断更
- 绿色：库存相对稳定

## 现有示例商家

- `妙颜`：双数日更新
- `包记西点`：单数日更新
- `西施竹韵`：周一 / 周三 / 周五 / 周六 / 周日更新
- `川香居麻辣鸡块`：单数日更新

## 飞书资料

如果你还想同时保留飞书版本，当前目录里也有完整搭建资料：

- [feishu-bitable-setup.md](/Users/douwenkai/Documents/codex/feishu-bitable-setup.md)
- [templates/飞书搭建操作清单.md](/Users/douwenkai/Documents/codex/templates/飞书搭建操作清单.md)
- [templates/商家总览表_初始化.csv](/Users/douwenkai/Documents/codex/templates/商家总览表_初始化.csv)
- [templates/拍摄批次表_初始化.csv](/Users/douwenkai/Documents/codex/templates/拍摄批次表_初始化.csv)
