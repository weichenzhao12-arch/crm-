# 2026-11-16 发布检查

最新发布状态：已通过实际 Cloudflare 测试站及正式站接口验收并上线，详情见 production-release-2026-11-16.md。下面保留早期阻塞检查记录供追溯。

## 本日后续修正结果

- 原先的缺失生产接口、DEV-only 入口和团队范围问题已补代码，详见 cloud-modules-rollout.md。
- 最终全量测试：42 个文件、135 项通过；类型检查、双功能开关生产构建、Wrangler Worker 编译通过。
- 完整仓库 HTTP 联测通过，测试请求实际经过生产 Functions 路由与 D1 适配器，不再只测本地中间件。
- 失败审计写入会整单回滚；迁移守卫缺失拒绝写入；权限和归属变化使旧库存提交失效。
- 默认打印权不再带出全部发货单访问；团队客户详情只读且变更处理器再次校验。
- 本地预览 http://127.0.0.1:5180 使用生产处理器加 D 盘持久测试库，仓库/交接健康探测通过。
- 本地未绑定 R2 和浏览器 PDF 服务，整体 health 的 ok=false 不能理解成全部服务就绪。
- Wrangler 本地 Workers 运行时启动崩溃，实际 Cloudflare D1 环境、迁移回滚和实体打印仍未验收；未上线。

以下是本日较早一轮检查的历史记录，不代表上述修正仍未实现。

结论：不满足整套系统上线条件，未部署、未修改线上数据。

## 本轮实跑

- `node node_modules/vitest/vitest.mjs run`：35 个测试文件、86 项通过。
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`：通过。
- `node node_modules/vite/bin/vite.js build`：通过；主包约 790KB，仍有体积警告。
- 本轮未完成人工逐页面验收、实体打印、生产数据库迁移和回滚演练。
- 仓库独立 HTTP 联测在前一轮通过，不能替代生产环境验收。

## 发布阻塞证据

1. `src/features/warehouse/release.ts` 仅在 DEV 且 local-crm 模式开放仓库相关功能。
2. `scripts/local-crm.ts` 通过 Vite serve 插件注册 `/api/local-warehouse` 和 `/api/local-personnel`。
3. `functions/[[path]].ts` 尚无这两个模块的生产路由。
4. `scripts/local-warehouse.ts` 和 `scripts/local-personnel.ts` 使用同步 Node SQLite 事务，不能原样部署为 Cloudflare D1 接口。
5. 岗位及默认权限已可设置，但按直属上级/部门范围的团队授权尚未完整实现；保留明确授权的本人/全部客户规则。

## 解除阻塞条件

- 在生产 Functions 接入仓库、交接模块，使用 D1 支持的原子写入/并发策略。
- 对生产接口重跑权限、幂等、锁库、裁卷、撤销、退货及交接一致性验收。
- 验证云端迁移、备份恢复及回滚方案，再打开生产入口。
- 完成页面人工验收和现场打印核对。

禁止仅将 localWarehouseEnabled 改为 true 后发布，这会暴露未接通的入口。
