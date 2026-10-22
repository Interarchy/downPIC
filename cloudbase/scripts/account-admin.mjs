import { createLocalAccountService, unlockStaleAccountStore } from '../accounts.mjs';

const [command, ...args] = process.argv.slice(2);
const help = `ArchBuddy 本地账号管理（先停止本地账号服务，再执行；结束后重新启动）
  node cloudbase/scripts/account-admin.mjs list
  node cloudbase/scripts/account-admin.mjs orders
  node cloudbase/scripts/account-admin.mjs approve <账号ID> <审核说明，至少5字>
  node cloudbase/scripts/account-admin.mjs reject <账号ID> <拒绝说明，至少5字>
  node cloudbase/scripts/account-admin.mjs topup <账号ID> <积分> <UUID请求ID> <原因，至少5字>
  node cloudbase/scripts/account-admin.mjs disable <账号ID>
  node cloudbase/scripts/account-admin.mjs enable <账号ID>
  node cloudbase/scripts/account-admin.mjs uncertain
  node cloudbase/scripts/account-admin.mjs refund-uncertain <账号ID> <请求ID> <核对说明，至少5字>
  node cloudbase/scripts/account-admin.mjs unlock-stale
订单尚无支付通道，不能确认付款；人工赠送与订单无关。重复批准不会重复加分。`;
if (!command || command === '--help') console.log(help);
else {
  let service;
  try {
    if (command === 'unlock-stale') console.log(JSON.stringify(await unlockStaleAccountStore()));
    else {
      service = await createLocalAccountService();
      const [accountId] = args;
      const options = command === 'topup' ? { accountId, points: args[1], requestId: args[2], reason: args.slice(3).join(' ') }
        : command === 'refund-uncertain' ? { accountId, receiptId: args[1], reason: args.slice(2).join(' ') }
        : { accountId, reason: args.slice(1).join(' ') };
      console.log(JSON.stringify(await service.admin(command, options), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await service?.close(); }
}
