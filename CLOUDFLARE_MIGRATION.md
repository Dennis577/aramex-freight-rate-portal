# Cloudflare Pages 迁移指南
# Aramex Freight Rate Portal

## 为什么迁移

Netlify 免费套餐限制：
- 构建时长 300 分钟/月
- 超出后 **Production deploys 被暂停**，新代码无法上线

Cloudflare Pages 免费套餐：
- 构建 500 次/月（几乎无时长限制）
- **带宽无限**
- 全球 CDN 速度更快

---

## 准备工作（已完成 ✓）

代码仓库已就绪，以下文件已推送至 `main` 分支：

```
_headers              ← Cloudflare 缓存控制规则
scripts/inject-env.sh ← 构建时注入环境变量，自动复制 _headers 到 dist/
```

---

## 步骤一：注册 / 登录 Cloudflare

1. 访问 https://pages.cloudflare.com
2. 点击 **Sign Up** 或 **Log In**
3. 如果已有 Cloudflare 账号（域名托管在 CF），直接登录

---

## 步骤二：创建 Pages 项目

1. 登录后点击 **Create a project**
2. 选择 **Connect to Git**
3. 授权 GitHub，选择仓库：
   - 仓库：`Dennis577/aramex-freight-rate-portal`
   - 分支：`main`
4. 点击 **Begin setup**

---

## 步骤三：配置构建

在 **Build settings** 页面填写：

| 字段 | 值 |
|------|-----|
| Project name | `aramex-rate`（可自定义） |
| Production branch | `main` |
| Build command | `sh scripts/inject-env.sh` |
| Build output directory | `dist` |
| Root directory | `/`（默认） |
| Environment variables | 见下方 |

### 添加环境变量

> ⚠️ 多账号密码已硬编码在 `scripts/inject-env.sh` 中（SHA-256 hash，非秘密），
> **无需**在 Cloudflare 设置密码相关环境变量。
>
> 只需设置以下两个 Supabase 连接变量：

点击 **Environment variables** → **Add variable**，添加以下两个：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `SUPABASE_URL` | `https://yaracegkoaamhfavwqzs.supabase.co` | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Supabase anon public key |

> 💡 `SUPABASE_ANON_KEY` 的值请从 Supabase Dashboard → Project Settings → API → `anon` `public` key 复制。

### 设置 Node 版本

在 **Environment variables** 中再添加一个：

| 变量名 | 值 |
|--------|-----|
| `NODE_VERSION` | `20` |

---

## 步骤四：首次部署

1. 确认所有配置填写正确
2. 点击 **Save and Deploy**
3. 等待构建完成（约 1-2 分钟）
4. 构建成功后，Cloudflare 会分配一个临时域名：
   - 格式：`https://aramex-rate.pages.dev`
   - 点击即可访问

---

## 步骤五：绑定自定义域名（可选）

### 方案 A：使用 Cloudflare 免费子域名
- `aramex-rate.pages.dev` 自动可用，无需配置

### 方案 B：绑定自己的域名（如 aramex-rate.com）
1. 在 Cloudflare Pages 项目 → **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入域名，按提示添加 DNS 记录

---

## 步骤六：验证部署

部署完成后，逐一验证：

```
✅ 访问 https://aramex-rate.pages.dev
✅ 打开浏览器开发者工具 → Network
✅ 确认 config.js 加载成功（无 404 / 无空 CONFIG）
✅ 测试搜索功能（Air Freight / Ocean Freight）
✅ 访问 /admin.html 管理员页面
✅ 检查 Cache-Control 响应头（见下方）
```

### 检查 Cache-Control 头

```bash
curl -I https://aramex-rate.pages.dev/index.html
# 应返回：Cache-Control: no-cache, no-store, must-revalidate

curl -I https://aramex-rate.pages.dev/assets/js/config.js
# 应返回：Cache-Control: no-cache, no-store, must-revalidate
```

---

## 回滚方案

如果 Cloudflare Pages 部署有问题：

1. Netlify 上的站点 **不会被删除**，只是部署被暂停
2. 等 Netlify 额度重置（次月1日）后可恢复部署
3. 或升级 Netlify 付费计划立即恢复

---

## 注意事项

1. **部署平台**：现已完全迁移至 Cloudflare Pages，Netlify 相关文件已全部移除。

2. **`_headers` 文件**：
   - 已加入仓库，Cloudflare Pages 构建时会自动读取 `dist/_headers`
   - 用于设置 HTML/JS/CSS 的 no-cache 缓存头

3. **构建日志**：
   - Cloudflare Pages → 项目 → **Deployments** → 点击某次部署可查看完整日志

---

## 常见问题

**Q：构建失败，提示 `sh scripts/inject-env.sh: not found`？**
A：确认 Build command 填写的是 `sh scripts/inject-env.sh`（不要加 `./` 前缀）。

**Q：环境变量不生效？**
A：确认变量名拼写完全一致（`SUPABASE_URL` 不是 `SUPABASE_URL ` 带空格）。

**Q：Cloudflare Pages 环境变量在哪里设置？**
A：在 Cloudflare Pages Dashboard → 项目 → Settings → Environment variables 中添加。

---

## 完成检查清单

- [ ] Cloudflare Pages 项目已创建
- [ ] 构建命令和输出目录已正确配置
- [ ] 两个环境变量已添加（《SUPABASE_URL》和《SUPABASE_ANON_KEY》）
- [ ] 首次部署成功，站点可访问
- [ ] Cache-Control 头正确返回
- [ ] 搜索功能正常
- [ ] 管理员页面正常
- [ ] （可选）自定义域名已绑定
