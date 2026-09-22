# 📦 部署到永久地址（手机扫码即开）

下面给你 4 个**完全免费 + 永久**的方案，挑一个最顺手的即可。部署后链接形如：

- GitHub Pages：`https://你的用户名.github.io/omr`
- Vercel：`https答题卡扫描小程序.vercel.app`
- Cloudflare Pages：`https答题卡扫描小程序.pages.dev`
- 腾讯云 EdgeOne Pages：`https答题卡扫描小程序.edgeone.app`

下面任选一种，**全部操作在浏览器里完成**，不用敲命令。

---

## 方案 A：GitHub Pages（最推荐 · 完全永久）

**优点**：微软旗下的服务，全球可用，**永久不会失效**，可直接绑定自己的域名。
**要求**：需要一个 GitHub 账号（免费注册，1 分钟）。

### 步骤

1. **注册 / 登录 GitHub**
   - 打开 https://github.com ，点右上角 `Sign up`，按提示用邮箱注册并验证。

2. **新建仓库**
   - 登录后点右上角 `+` → `New repository`
   - `Repository name` 填：`omr`（或你想取的名字，**不要勾** "Add a README"）
   - 其余默认 → 点 `Create repository`

3. **上传项目文件**
   - 在新建的仓库页点 `uploading an existing file`（蓝色链接）
   - 把 `D:\workbuddy\答题卡扫描小程序\` **整个文件夹**里的所有内容（不是文件夹本身，是里面的 9 个文件/文件夹）：
     ```
     index.html  template.html  app.js  layout.js
     manifest.webmanifest  sw.js  vercel.json  _headers  package.json
     answers.sample.json
     icons/  lib/
     ```
     全部拖进网页里（一次可拖多文件 + 文件夹）
   - 等进度条跑完，点 `Commit changes`

4. **开启 Pages**
   - 进仓库 → 顶部菜单 `Settings` → 左侧 `Pages`
   - `Source` 选 `Deploy from a branch` → `Branch` 选 `main`，`/` (root)
   - 点 `Save`
   - 等待 1-2 分钟，页面会刷新出绿色横幅，告诉你访问地址：
     ```
     https://你的用户名.github.io/omr/
     ```

5. **手机扫码访问**
   - 电脑打开 https://你的用户名.github.io/omr/ 看效果
   - 用手机浏览器（Safari/Chrome）输入同样网址即可
   - iOS Safari 底部点分享 → "添加到主屏幕" → 桌面出现"答题卡"图标
   - Android Chrome 菜单 → "添加到主屏幕"

✅ **完成！永久可用，可分享给任何人。**

> 想换成自己的域名？进 Pages 设置里填 `Custom domain`，再在你的域名服务商加一条 CNAME 解析即可（README 不再展开）。

---

## 方案 B：Vercel（最简单 · 一键导入）

**优点**：导入 GitHub 仓库后**全自动部署**，每次 push 自动更新，国内访问也快。

1. 注册 https://vercel.com （推荐用 GitHub 账号一键登录）
2. 点 `Add New → Project` → `Import` 你刚才建的 `omr` 仓库
3. Framework Preset 选 `Other`，点 `Deploy`
4. 30 秒后给你一个 `xxx.vercel.app` 的地址，永久有效

---

## 方案 C：Cloudflare Pages（国内访问最快）

**优点**：Cloudflare 全球 CDN，**大陆访问速度**通常比 GitHub Pages 还快。

1. 注册 https://dash.cloudflare.com （免费）
2. 左侧 `Workers 和 Pages` → `创建应用程序` → `Pages` → `直接上传`
3. 输入项目名 `omr`，把 `D:\workbuddy\答题卡扫描小程序\` 整个文件夹**压缩成 zip** 上传
4. 几十秒后给你 `omr.pages.dev` 域名

---

## 方案 D：腾讯云 EdgeOne Pages（腾讯生态，国内最稳）

**优点**：腾讯的免费静态托管，**微信里点开最快**，国内 CDN。

1. 注册 https://console.cloud.tencent.com/edgeone （需实名认证，首次约 5 分钟）
2. 进入 EdgeOne Pages → `创建项目` → 选择 `直接上传` 或 `连接 Git`
3. 把整个项目压缩 zip 上传
4. 部署完成得到 `xxx.edgeone.app` 域名，可一键绑定自己的域名

---

## 方案 E（最快的"伪永久"）：刷新沙盒链接

如果只想再延几天用，回到 WorkBuddy 跟我说"**重新部署答题卡**"即可，我重新生成新的 7 天链接。**不算永久方案**，但 0 门槛。

---

## 部署后做这些事，体验拉满

| 操作 | 说明 |
|------|------|
| 打开页面，按浏览器提示「添加到主屏幕」 | 手机桌面出现 APP 图标，全屏打开，无地址栏 |
| **首次打开**联网**等识别引擎加载完**（约 1 分钟，看进度） | 之后**断网也能判卷** |
| 在「考试管理」录入答案，再点导出 JSON 备份 | 换设备/清缓存后能恢复 |
| 把链接生成二维码贴在教室 | 学生不会丢，老师也能临时用 |

---

## 找不到入口 / 报错怎么办？

- **GitHub 上传文件大小有限制**（单个文件 ≤ 100 MB）—— 我们 `opencv.js` 才 10MB，**没问题**。
- **Pages 没生效**：等 2 分钟，仓库 `Actions` 标签页能看部署日志。
- **手机打开是空白**：第一次要等 1-2 分钟加载 opencv.js（10MB），进度在浏览器加载条。
- **iPhone 添加到主屏幕后打不开**：必须是 Safari 操作（Chrome iOS 不支持 PWA 安装）。

---

## 想要一个**自己的域名**（如 `my-grading.cn`）

| 平台 | 操作 |
|------|------|
| 阿里云/腾讯云买域名 | 约 ¥30-80/年，搜索 `cn 域名 注册` |
| DNS 解析 | 在域名服务商后台加一条 CNAME 指向你托管平台给的默认域名 |
| 平台绑定 | Vercel/Cloudflare/EdgeOne 都支持一键绑定并自动续 HTTPS |

加完域名的访问地址变成 `https://my-grading.cn/`，可以印在教室门口、做成二维码贴墙上。

---

## 仍有问题？

让 WorkBuddy 帮你：直接说"**帮我部署到 GitHub**" 或 "**帮我部署到 Vercel**"，按提示提供账号或跟着步骤点几下就行。