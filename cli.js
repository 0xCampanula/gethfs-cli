#!/usr/bin/env node
const { program } = require('commander');
program.version(require('./package.json').version);

const { create, upload, remove, setDefault, download } = require("./src");
const { MAX_CHUNKS, DEFAULT_MAX_CHUNK_SIZE_KB } = require("gethstorage-sdk");

program
    .option('-p, --privateKey [privateKey]', '私钥')
    .option('-a, --address [address]', 'FlatDirectory 合约地址')
    .option('-f, --file [file]', '上传文件路径/名称')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .option('-s, --threadPoolSize [threadPoolSize]', '线程池大小（用于估算与数据拉取并发，分块交易始终逐笔发送）')
    .option('-e, --estimateGas [estimateGas]', '估算 Gas 成本')
    .option('--maxFeePerGas <maxFeePerGas>', '自定义上传交易每单位 gas 最高费用，单位 wei（EIP-1559）。默认：节点 base fee × 1.1 + 优先费')
    .option('--maxPriorityFeePerGas <maxPriorityFeePerGas>', '自定义上传交易每单位 gas 最高优先费，单位 wei（EIP-1559）。默认：100')
    .option('--gasPrice <gasPrice>', '自定义 gas 价格，单位 wei（适用于无 EIP-1559 的 legacy 链，如 BNB Chain）')
    .option('-m, --chunkSize [chunkSize]', `每个 calldata 分块的数据大小，单位 KB（仅 calldata 上传）。默认：${DEFAULT_MAX_CHUNK_SIZE_KB}`)
    .option('-n, --maxChunkCount [maxChunkCount]', `单次请求最大分块数。默认：${MAX_CHUNKS}`);

program
    .command('create')
    .description('部署 FlatDirectory 合约')
    .option('-p, --privateKey <privateKey>', '私钥')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .action(() => {
        const opts = program.opts();
        create(opts.privateKey, opts.chainId, opts.rpc);
    });

program
    .command('default')
    .description('设置默认文件')
    .option('-p, --privateKey <privateKey>', '私钥')
    .option('-a, --address <address>', 'FlatDirectory 合约地址')
    .option('-f, --file <file>', '文件名称')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .action(() => {
        const opts = program.opts();
        setDefault(opts.privateKey, opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('remove')
    .description('删除文件')
    .option('-p, --privateKey <privateKey>', '私钥')
    .option('-a, --address <address>', 'FlatDirectory 合约地址')
    .option('-f, --file <file>', '文件名称')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .action(() => {
        const opts = program.opts();
        remove(opts.privateKey, opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('download')
    .description('下载文件')
    .option('-a, --address <address>', 'FlatDirectory 合约地址')
    .option('-f, --file <file>', '文件名称')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .action(() => {
        const opts = program.opts();
        download(opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('upload')
    .description('上传文件|目录')
    .option('-p, --privateKey <privateKey>', '私钥')
    .option('-a, --address <address>', 'FlatDirectory 合约地址')
    .option('-f, --file <file>', '上传文件|目录路径')
    .option('-c, --chainId [chainId]', '链 ID')
    .option('-r, --rpc [rpc]', '节点 RPC 地址')
    .option('-s, --threadPoolSize [threadPoolSize]', '线程池大小（用于估算与数据拉取并发，分块交易始终逐笔发送）')
    .option('--maxFeePerGas <maxFeePerGas>', '自定义上传交易每单位 gas 最高费用，单位 wei（EIP-1559）。默认：节点 base fee × 1.1 + 优先费')
    .option('--maxPriorityFeePerGas <maxPriorityFeePerGas>', '自定义上传交易每单位 gas 最高优先费，单位 wei（EIP-1559）。默认：100')
    .option('--gasPrice <gasPrice>', '自定义 gas 价格，单位 wei（适用于无 EIP-1559 的 legacy 链，如 BNB Chain）')
    .option('-m, --chunkSize [chunkSize]', `每个 calldata 分块的数据大小，单位 KB（仅 calldata 上传）。默认：${DEFAULT_MAX_CHUNK_SIZE_KB}`)
    .option('-n, --maxChunkCount [maxChunkCount]', `单次请求最大分块数。默认：${MAX_CHUNKS}`)
    .action(() => {
        const opts = program.opts();
        upload(opts.privateKey, opts.address, opts.file, opts.rpc, opts.chainId, opts.maxFeePerGas, opts.maxPriorityFeePerGas, opts.gasPrice, opts.threadPoolSize, opts.estimateGas, opts.chunkSize, opts.maxChunkCount);
    });

program.parse(process.argv);
