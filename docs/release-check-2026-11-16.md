# 2026-11-16 发布检查

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
